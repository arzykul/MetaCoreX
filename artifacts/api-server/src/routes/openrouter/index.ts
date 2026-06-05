import { Router, type IRouter } from "express";
import { eq, desc, lte, and } from "drizzle-orm";
import OpenAI from "openai";
import {
  db, conversations, messages,
  tasksTable, notesTable, remindersTable, agentMemories,
} from "@workspace/db";
import {
  CreateOpenrouterConversationBody,
  SendOpenrouterMessageBody,
} from "@workspace/api-zod";
import { logger } from "../../lib/logger.js";

const router: IRouter = Router();

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadMemories(): Promise<string> {
  const mems = await db.select().from(agentMemories).orderBy(agentMemories.updatedAt);
  if (mems.length === 0) return "";
  return "\n\nЧто ты знаешь о пользователе (долгосрочная память):\n" +
    mems.map(m => `- ${m.key}: ${m.value}`).join("\n");
}

async function webSearch(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = await res.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: { Text?: string; FirstURL?: string }[];
    };

    const parts: string[] = [];
    if (data.AbstractText) parts.push(data.AbstractText);
    if (data.RelatedTopics?.length) {
      const topics = data.RelatedTopics
        .filter(t => t.Text)
        .slice(0, 4)
        .map(t => `• ${t.Text}`);
      if (topics.length) parts.push(topics.join("\n"));
    }
    return parts.length ? parts.join("\n\n") : "Результатов не найдено. Попробуйте переформулировать запрос.";
  } catch {
    return "Поиск недоступен. Попробуйте позже.";
  }
}

// ─── Tools definition ─────────────────────────────────────────────────────────

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "remember_fact",
      description: "Запомнить важный факт о пользователе для будущих разговоров (имя, предпочтения, привычки, цели)",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Короткий ключ факта, например 'имя', 'город', 'работа'" },
          value: { type: "string", description: "Значение факта" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_facts",
      description: "Вспомнить всё что известно о пользователе из долгосрочной памяти",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Поиск информации в интернете через DuckDuckGo",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Поисковый запрос" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Создать новую задачу для пользователя",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          dueDate: { type: "string", description: "ISO дата дедлайна (необязательно)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Создать заметку",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Создать напоминание",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          remindAt: { type: "string", description: "ISO дата и время" },
        },
        required: ["title", "remindAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Получить список задач",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "Получить список заметок",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "Получить список напоминаний",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    if (name === "remember_fact") {
      const key = args.key as string;
      const value = args.value as string;
      await db.insert(agentMemories)
        .values({ key, value })
        .onConflictDoUpdate({ target: agentMemories.key, set: { value, updatedAt: new Date() } });
      return `✅ Запомнил: ${key} = ${value}`;
    }

    if (name === "recall_facts") {
      const mems = await db.select().from(agentMemories);
      if (mems.length === 0) return "Памяти пока нет.";
      return "Что я знаю о тебе:\n" + mems.map(m => `- ${m.key}: ${m.value}`).join("\n");
    }

    if (name === "web_search") {
      return await webSearch(args.query as string);
    }

    if (name === "create_task") {
      const [task] = await db.insert(tasksTable).values({
        title: args.title as string,
        description: (args.description as string) ?? null,
        priority: (args.priority as "low" | "medium" | "high") ?? "medium",
        dueDate: args.dueDate ? (args.dueDate as string) : null,
        status: "pending",
      }).returning();
      return `✅ Задача создана: "${task.title}" (${task.priority})`;
    }

    if (name === "create_note") {
      const [note] = await db.insert(notesTable).values({
        title: args.title as string,
        content: (args.content as string) ?? "",
        pinned: false,
      }).returning();
      return `📝 Заметка создана: "${note.title}"`;
    }

    if (name === "create_reminder") {
      const [reminder] = await db.insert(remindersTable).values({
        title: args.title as string,
        remindAt: args.remindAt as string,
        done: false,
      }).returning();
      return `🔔 Напоминание: "${reminder.title}" — ${new Date(reminder.remindAt).toLocaleString("ru-RU")}`;
    }

    if (name === "list_tasks") {
      const tasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)).limit(15);
      if (!tasks.length) return "Задач нет.";
      return "Задачи:\n" + tasks.map(t => `- [${t.status}] ${t.title} (${t.priority})`).join("\n");
    }

    if (name === "list_notes") {
      const notes = await db.select().from(notesTable).orderBy(desc(notesTable.createdAt)).limit(15);
      if (!notes.length) return "Заметок нет.";
      return "Заметки:\n" + notes.map(n => `- ${n.title}`).join("\n");
    }

    if (name === "list_reminders") {
      const reminders = await db.select().from(remindersTable).orderBy(remindersTable.remindAt).limit(15);
      if (!reminders.length) return "Напоминаний нет.";
      return "Напоминания:\n" + reminders.map(r =>
        `- [${r.done ? "✓" : "⏰"}] ${r.title} — ${new Date(r.remindAt).toLocaleString("ru-RU")}`
      ).join("\n");
    }

    return `Неизвестный инструмент: ${name}`;
  } catch (err) {
    logger.error({ err, tool: name }, "Tool error");
    return `Ошибка инструмента: ${name}`;
  }
}

// ─── Agentic loop ─────────────────────────────────────────────────────────────

async function agenticLoop(
  chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  onTool: (tool: string) => void,
  onChunk: (text: string) => void,
): Promise<string> {
  const MAX_ITERATIONS = 6;
  let iterations = 0;

  while (iterations++ < MAX_ITERATIONS) {
    const completion = await openrouter.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      messages: chatMessages,
      tools,
      tool_choice: "auto",
      stream: false,
    });

    const choice = completion.choices[0];
    if (!choice) break;

    const msg = choice.message;

    // Tool calls → execute and continue
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      chatMessages.push(msg);
      for (const toolCall of msg.tool_calls) {
        const tc = toolCall as { id: string; function: { name: string; arguments: string } };
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* empty */ }

        onTool(tc.function.name);
        const result = await executeTool(tc.function.name, toolArgs);
        chatMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    // Final text → stream it
    const finalContent = msg.content ?? "";
    if (finalContent) {
      // Stream final answer word-by-word via another streaming call
      const stream = await openrouter.chat.completions.create({
        model: MODEL,
        max_tokens: 8192,
        messages: chatMessages.concat([{ role: "user", content: "" }]).slice(0, -1).concat([
          { role: "assistant", content: finalContent },
        ]),
        stream: false, // Already have content, just emit it
      });
      void stream; // not used
      // Emit the content we already have, chunk by chunk (simulate streaming)
      const words = finalContent.split(" ");
      for (const word of words) {
        onChunk(word + " ");
        await new Promise(r => setTimeout(r, 0)); // yield to event loop
      }
      return finalContent;
    }
    break;
  }
  return "";
}

// ─── Real streaming agentic loop ──────────────────────────────────────────────

async function agenticLoopStreaming(
  chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  onTool: (tool: string) => void,
  write: (data: string) => void,
): Promise<string> {
  const MAX_ITERATIONS = 6;
  let iterations = 0;
  let fullResponse = "";

  while (iterations++ < MAX_ITERATIONS) {
    // First check if tools are needed (non-streaming)
    const check = await openrouter.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      messages: chatMessages,
      tools,
      tool_choice: "auto",
      stream: false,
    });

    const choice = check.choices[0];
    if (!choice) break;
    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      chatMessages.push(msg);
      for (const toolCall of msg.tool_calls) {
        const tc = toolCall as { id: string; function: { name: string; arguments: string } };
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* empty */ }
        onTool(tc.function.name);
        write(`data: ${JSON.stringify({ tool: tc.function.name })}\n\n`);
        const result = await executeTool(tc.function.name, toolArgs);
        chatMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
      continue;
    }

    // No more tools → stream the final response
    const stream = await openrouter.chat.completions.create({
      model: MODEL,
      max_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }
    break;
  }

  return fullResponse;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/openrouter/conversations", async (_req, res): Promise<void> => {
  const convs = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
  res.json(convs);
});

router.post("/openrouter/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenrouterConversationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [conv] = await db.insert(conversations).values({ title: parsed.data.title }).returning();
  res.status(201).json(conv);
});

router.get("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

router.delete("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.sendStatus(204);
});

router.get("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json(msgs);
});

router.post("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SendOpenrouterMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  // Save user message
  await db.insert(messages).values({ conversationId: id, role: "user", content: parsed.data.content });

  // Load history + memories
  const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  const memoryContext = await loadMemories();

  const systemPrompt = `Ты — PersonalAI, умный автономный персональный помощник. Сегодня: ${new Date().toLocaleString("ru-RU")}.
${memoryContext}

Инструменты:
- remember_fact: запомни важный факт о пользователе (имя, предпочтения, цели, привычки)
- recall_facts: вспомни всё о пользователе
- web_search: поиск в интернете через DuckDuckGo
- create_task / list_tasks: задачи
- create_note / list_notes: заметки  
- create_reminder / list_reminders: напоминания

Правила:
- Если пользователь называет своё имя — немедленно запомни через remember_fact
- Если вопрос требует актуальных данных — используй web_search
- Всегда отвечай на русском языке
- Будь кратким, дружелюбным и полезным`;

  const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const fullResponse = await agenticLoopStreaming(
      chatMessages,
      (tool) => logger.info({ tool }, "Agent tool call"),
      (data) => res.write(data),
    );

    if (fullResponse) {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "OpenRouter agent error");
    res.write(`data: ${JSON.stringify({ error: "Ошибка AI. Попробуйте ещё раз." })}\n\n`);
    res.end();
  }
});

// ─── Reminder checker endpoint (called by frontend polling) ───────────────────

router.get("/openrouter/reminders/due", async (_req, res): Promise<void> => {
  const now = new Date();
  const dueReminders = await db
    .select()
    .from(remindersTable)
    .where(and(
      lte(remindersTable.remindAt, now.toISOString()),
      eq(remindersTable.done, false),
    ));

  // Mark as done
  for (const r of dueReminders) {
    await db.update(remindersTable).set({ done: true }).where(eq(remindersTable.id, r.id));
  }

  res.json(dueReminders);
});

export default router;
