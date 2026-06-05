import { Router, type IRouter } from "express";
import { desc, gte, eq } from "drizzle-orm";
import { db, tasksTable, notesTable, remindersTable, chatMessagesTable } from "@workspace/db";
import {
  GetDashboardStatsResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats/dashboard", async (_req, res): Promise<void> => {
  const [tasks, notes, reminders] = await Promise.all([
    db.select().from(tasksTable),
    db.select().from(notesTable),
    db.select().from(remindersTable),
  ]);

  const now = new Date().toISOString();
  const upcomingReminders = reminders.filter(r => !r.done && r.remindAt >= now).length;

  const stats = {
    totalTasks: tasks.length,
    doneTasks: tasks.filter(t => t.status === "done").length,
    pendingTasks: tasks.filter(t => t.status === "pending").length,
    totalNotes: notes.length,
    totalReminders: reminders.length,
    upcomingReminders,
  };

  res.json(GetDashboardStatsResponse.parse(stats));
});

router.get("/stats/recent-activity", async (_req, res): Promise<void> => {
  const [tasks, notes, reminders, chatMsgs] = await Promise.all([
    db.select().from(tasksTable).orderBy(desc(tasksTable.createdAt)).limit(5),
    db.select().from(notesTable).orderBy(desc(notesTable.createdAt)).limit(5),
    db.select().from(remindersTable).orderBy(desc(remindersTable.createdAt)).limit(5),
    db.select().from(chatMessagesTable).where(eq(chatMessagesTable.role, "user")).orderBy(desc(chatMessagesTable.createdAt)).limit(5),
  ]);

  const activity = [
    ...tasks.map(t => ({ id: `task-${t.id}`, type: "task" as const, title: t.title, createdAt: t.createdAt.toISOString() })),
    ...notes.map(n => ({ id: `note-${n.id}`, type: "note" as const, title: n.title, createdAt: n.createdAt.toISOString() })),
    ...reminders.map(r => ({ id: `reminder-${r.id}`, type: "reminder" as const, title: r.title, createdAt: r.createdAt.toISOString() })),
    ...chatMsgs.map(m => ({ id: `chat-${m.id}`, type: "chat" as const, title: m.content.slice(0, 60), createdAt: m.createdAt.toISOString() })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  res.json(GetRecentActivityResponse.parse(activity));
});

export default router;
