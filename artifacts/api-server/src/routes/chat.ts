import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, chatMessagesTable } from "@workspace/db";
import {
  ListChatMessagesQueryParams,
  ListChatMessagesResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
  DeleteChatMessageParams,
} from "@workspace/api-zod";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.get("/chat/messages", async (req, res): Promise<void> => {
  const parsed = ListChatMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 50;
  const messages = await db.select().from(chatMessagesTable)
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);

  res.json(ListChatMessagesResponse.parse(messages.reverse()));
});

router.post("/chat/messages", async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Save user message
  await db.insert(chatMessagesTable).values({
    role: "user",
    content: parsed.data.content,
  });

  // Generate simple AI response (no external API needed for first build)
  const userContent = parsed.data.content.toLowerCase();
  let aiReply: string;

  if (userContent.includes("задач") || userContent.includes("task")) {
    aiReply = "Я помогу вам с задачами! Перейдите в раздел «Задачи», чтобы создать или управлять вашими задачами. Что именно вы хотите сделать?";
  } else if (userContent.includes("напомин") || userContent.includes("reminder")) {
    aiReply = "Для управления напоминаниями откройте раздел «Напоминания». Я могу помочь вам организовать их. Когда вам нужно напомнить?";
  } else if (userContent.includes("замет") || userContent.includes("note")) {
    aiReply = "Раздел «Заметки» поможет вам сохранить все важные мысли. Хотите создать новую заметку или найти существующую?";
  } else if (userContent.includes("привет") || userContent.includes("hello") || userContent.includes("hi")) {
    aiReply = "Привет! Я ваш персональный AI-помощник. Я могу помочь вам управлять задачами, напоминаниями, заметками и ответить на ваши вопросы. Чем могу помочь?";
  } else if (userContent.includes("помог") || userContent.includes("help")) {
    aiReply = "Я ваш персональный помощник! Вот что я умею:\n• Управление задачами и дедлайнами\n• Создание напоминаний\n• Хранение заметок\n• Ответы на вопросы\n\nПросто напишите, что вам нужно!";
  } else if (userContent.includes("спасибо") || userContent.includes("thanks")) {
    aiReply = "Пожалуйста! Всегда рад помочь. Если возникнут вопросы — я здесь!";
  } else {
    aiReply = `Понял вас. Я помогу вам с этим! Используйте разделы приложения для управления задачами, заметками и напоминаниями. Если нужна дополнительная помощь — просто спросите.`;
  }

  const [assistantMsg] = await db.insert(chatMessagesTable).values({
    role: "assistant",
    content: aiReply,
  }).returning();

  req.log.info({ messageId: assistantMsg.id }, "AI response generated");
  res.json(SendChatMessageResponse.parse(assistantMsg));
});

router.delete("/chat/messages/:id", async (req, res): Promise<void> => {
  const params = DeleteChatMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
