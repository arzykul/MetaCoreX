import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import eventsRouter from "./events.js";
import contractRouter from "./contract.js";
import agentRouter from "./agent.js";
import agentTasksRouter from "./agent-tasks.js";
import pouRouter from "./pou.js";
import tasksRouter from "./tasks.js";
import notesRouter from "./notes.js";
import remindersRouter from "./reminders.js";
import chatRouter from "./chat.js";
import statsRouter from "./stats.js";
import openrouterRouter from "./openrouter/index.js";
import verifyRouter from "./verify.js";
import platformsRouter from "./platforms.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(contractRouter);
router.use(agentRouter);
router.use(agentTasksRouter);
router.use(pouRouter);
router.use(tasksRouter);
router.use(notesRouter);
router.use(remindersRouter);
router.use(chatRouter);
router.use(statsRouter);
router.use(openrouterRouter);
router.use(verifyRouter);
router.use(platformsRouter);

export default router;
