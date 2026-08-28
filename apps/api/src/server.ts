import { loadEnv, createLogger } from "@project-lien/shared-config";
import { createApp } from "./app.js";

const env = loadEnv();
const logger = createLogger("api");
const app = createApp();

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, "api listening");
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    logger.info("http server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
