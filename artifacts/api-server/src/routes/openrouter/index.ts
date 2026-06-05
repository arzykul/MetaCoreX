import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";
import { db, conversations, messages, tasksTable, notesTable, remindersTable } from "@workspace/db";
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

const SYSTEM_PROMPT = `Ты — PersonalAI, умный персональный помощник. Ты помогаешь пользователю управлять задачами, заметками и напоминаниями.

У тебя есть следующие инструменты:
- create_task: создать задачу
- create_note: создать заметку
- create_reminder: создать напоминание
- list_tasks: показать список задач
- list_notes: показать список заметок
- list_reminders: показать список напоминаний

Когда пользователь просит что-то создать или найти — используй инструменты. Отвечай на русском языке. Будь кратким и полезным.`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Создать новую задачу для пользователя",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Название задачи" },
          description: { type: "string", description: "Описание задачи (необязательно)" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Приоритет задачи" },
          dueDate: { type: "string", description: "Дедлайн в формате ISO (необязательно)" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Создать новую заметку",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Заголовок заметки" },
          content: { type: "string", description: "Содержимое заметки" },
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
          title: { type: "string", description: "Текст напоминания" },
          remindAt: { type: "string", description: "Дата и время напоминания в формате ISO" },
        },
        required: ["title", "remindAt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "Получить список задач пользователя",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_notes",
      description: "Получить список заметок пользователя",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_reminders",
      description: "Получить список напоминаний пользователя",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    if (name === "create_task") {
      const [task] = await db.insert(tasksTable).values({
        title: args.title as string,
        description: (args.description as string) ?? null,
        priority: (args.priority as "low" | "medium" | "high") ?? "medium",
        dueDate: args.dueDate ? (args.dueDate as string) : null,
        status: "pending",
      }).returning();
      return `✅ Задача создана: "${task.title}" (приоритет: ${task.priority})`;
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
      return `🔔 Напоминание создано: "${reminder.title}" на ${new Date(reminder.remindAt).toLocaleString("ru-RU")}`;
    }

    if (name === "list_tasks") {
      const tasks = await db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)).limit(10);
      if (tasks.length === 0) return "Задач пока нет.";
      return "Задачи:\n" + tasks.map(t => `- [${t.status}] ${t.title} (${t.priority})`).join("\n");
    }

    if (name === "list_notes") {
      const notes = await db.select().from(notesTable).orderBy(desc(notesTable.createdAt)).limit(10);
      if (notes.length === 0) return "Заметок пока нет.";
      return "Заметки:\n" + notes.map(n => `- ${n.title}`).join("\n");
    }

    if (name === "list_reminders") {
      const reminders = await db.select().from(remindersTable).orderBy(desc(remindersTable.createdAt)).limit(10);
      if (reminders.length === 0) return "Напоминаний пока нет.";
      return "Напоминания:\n" + reminders.map(r => `- [${r.done ? "✓" : "●"}] ${r.title} — ${new Date(r.remindAt).toLocaleString("ru-RU")}`).join("\n");
    }

    return `Неизвестный инструмент: ${name}`;
  } catch (err) {
    logger.error({ err, tool: name }, "Tool execution error");
    return `Ошибка при выполнении инструмента ${name}`;
  }
}

// GET /openrouter/conversations
router.get("/openrouter/conversations", async (_req, res): Promise<void> => {
  const convs = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
  res.json(convs);
});

// POST /openrouter/conversations
router.post("/openrouter/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenrouterConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conv] = await db.insert(conversations).values({ title: parsed.data.title }).returning();
  res.status(201).json(conv);
});

// GET /openrouter/conversations/:id
router.get("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

// DELETE /openrouter/conversations/:id
router.delete("/openrouter/conversations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.sendStatus(204);
});

// GET /openrouter/conversations/:id/messages
router.get("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const msgs = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);
  res.json(msgs);
});

// POST /openrouter/conversations/:id/messages (SSE streaming with tool use)
router.post("/openrouter/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = SendOpenrouterMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) { res.status(404).json({ error: "Not found" }); return; }

  // Save user message
  await db.insert(messages).values({ conversationId: id, role: "user", content: parsed.data.content });

  // Load history
  const history = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(messages.createdAt);

  // Build messages for LLM
  const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    let fullResponse = "";
    let toolCallsDone = false;

    // Agentic loop: call LLM, execute tools if needed, then stream final response
    while (!toolCallsDone) {
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

      // If model wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        chatMessages.push(msg);

        for (const toolCall of msg.tool_calls) {
          const tc = toolCall as { id: string; function: { name: string; arguments: string } };
          const toolName = tc.function.name;
          let toolArgs: Record<string, unknown> = {};
          try { toolArgs = JSON.parse(tc.function.arguments); } catch { /* empty args */ }

          // Notify client which tool is running
          res.write(`data: ${JSON.stringify({ tool: toolName })}\n\n`);

          const result = await executeTool(toolName, toolArgs);

          chatMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
        // Continue loop to get final answer
        continue;
      }

      // No tool calls — stream the final answer
      toolCallsDone = true;
      const finalContent = msg.content ?? "";

      // Stream the response word by word for smooth UX
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
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      if (!fullResponse) fullResponse = finalContent;
    }

    // Save assistant response
    if (fullResponse) {
      await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullResponse });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "OpenRouter stream error");
    res.write(`data: ${JSON.stringify({ error: "Ошибка AI. Попробуйте ещё раз." })}\n\n`);
    res.end();
  }
});

export default router;
