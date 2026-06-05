import { Router, type IRouter } from "express";
import { eq, desc, gte } from "drizzle-orm";
import { db, remindersTable } from "@workspace/db";
import {
  ListRemindersQueryParams,
  ListRemindersResponse,
  CreateReminderBody,
  UpdateReminderParams,
  UpdateReminderBody,
  UpdateReminderResponse,
  DeleteReminderParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reminders", async (req, res): Promise<void> => {
  const parsed = ListRemindersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let reminders;
  if (parsed.data.upcoming) {
    reminders = await db.select().from(remindersTable)
      .where(gte(remindersTable.remindAt, new Date().toISOString()))
      .orderBy(remindersTable.remindAt);
  } else {
    reminders = await db.select().from(remindersTable).orderBy(desc(remindersTable.createdAt));
  }

  res.json(ListRemindersResponse.parse(reminders));
});

router.post("/reminders", async (req, res): Promise<void> => {
  const parsed = CreateReminderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [reminder] = await db.insert(remindersTable).values({
    title: parsed.data.title,
    remindAt: parsed.data.remindAt,
    done: false,
  }).returning();
  res.status(201).json(reminder);
});

router.patch("/reminders/:id", async (req, res): Promise<void> => {
  const params = UpdateReminderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateReminderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [reminder] = await db.update(remindersTable).set(parsed.data)
    .where(eq(remindersTable.id, params.data.id)).returning();
  if (!reminder) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.json(UpdateReminderResponse.parse(reminder));
});

router.delete("/reminders/:id", async (req, res): Promise<void> => {
  const params = DeleteReminderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [reminder] = await db.delete(remindersTable).where(eq(remindersTable.id, params.data.id)).returning();
  if (!reminder) {
    res.status(404).json({ error: "Reminder not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
