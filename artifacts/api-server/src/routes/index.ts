import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import eventsRouter from "./events.js";
import contractRouter from "./contract.js";
import tasksRouter from "./tasks.js";
import notesRouter from "./notes.js";
import remindersRouter from "./reminders.js";
import chatRouter from "./chat.js";
import statsRouter from "./stats.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(contractRouter);
router.use(tasksRouter);
router.use(notesRouter);
router.use(remindersRouter);
router.use(chatRouter);
router.use(statsRouter);

export default router;
