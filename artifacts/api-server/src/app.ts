import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the Visual Core dashboard from /public at the workspace root
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",   // dist/ → artifact root  (in prod)
  "..",   // artifact root → artifacts/
  "..",   // artifacts/ → workspace root
  "public"
);
app.use(express.static(workspaceRoot));

app.use("/api", router);

// SPA fallback — serve index.html for any unknown path (dashboard routes)
// Express 5 requires named wildcard: /{*path}
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(workspaceRoot, "index.html"));
});

export default app;
