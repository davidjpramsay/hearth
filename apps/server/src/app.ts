import { existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBibleVerseRoutes } from "./routes/bible-verse.js";
import { registerCalendarRoutes } from "./routes/calendar.js";
import { registerChoresModuleRoutes } from "./routes/chores-module.js";
import { registerChoresRoutes } from "./routes/chores.js";
import { registerDisplayRoutes } from "./routes/display.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerLayoutRoutes } from "./routes/layouts.js";
import { registerLocalWarningsRoutes } from "./routes/local-warnings.js";
import { registerModuleAdapterRoutes } from "./routes/module-adapters.js";
import { registerPhotoRoutes } from "./routes/photos.js";
import { registerPlannerModuleRoutes } from "./routes/planner-module.js";
import { registerPlannerRoutes } from "./routes/planner.js";
import { registerSiteTimeRoutes } from "./routes/site-time.js";
import { registerWeatherRoutes } from "./routes/weather.js";
import type { AppServices } from "./types.js";

export const createApp = async (services: AppServices) => {
  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyCors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
  });

  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
  });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ message: "Unauthorized" });
    }
  });

  app.register(
    async (apiApp) => {
      registerAuthRoutes(apiApp, services);
      registerLayoutRoutes(apiApp, services);
      registerModuleAdapterRoutes(apiApp, services);
      registerLocalWarningsRoutes(apiApp, services);
      registerChoresRoutes(apiApp, services);
      registerPlannerRoutes(apiApp, services);
      registerCalendarRoutes(apiApp, services);
      registerWeatherRoutes(apiApp, services);
      registerBibleVerseRoutes(apiApp, services);
      registerChoresModuleRoutes(apiApp, services);
      registerPlannerModuleRoutes(apiApp, services);
      registerPhotoRoutes(apiApp, services);
      registerSiteTimeRoutes(apiApp, services);
      registerDisplayRoutes(apiApp, services);
      registerEventRoutes(apiApp, services);
    },
    { prefix: "/api" },
  );

  if (existsSync(config.webDistPath)) {
    await app.register(fastifyStatic, {
      root: config.webDistPath,
      wildcard: false,
      prefix: "/",
    });

    app.get("/*", async (request, reply) => {
      const rawUrl = request.raw.url ?? "/";
      const [pathname] = rawUrl.split("?");
      const decodedPath = decodeURIComponent(pathname || "/");
      if (decodedPath === "/api" || decodedPath.startsWith("/api/")) {
        return reply.code(404).send({ message: "Not Found" });
      }

      const relativePath = decodedPath.replace(/^\/+/, "");
      const rootPath = resolve(config.webDistPath);
      const candidatePath = resolve(config.webDistPath, relativePath);
      const isInsideRoot =
        candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${sep}`);

      if (relativePath.length > 0 && isInsideRoot) {
        try {
          if (statSync(candidatePath).isFile()) {
            return reply.sendFile(relativePath);
          }
        } catch {
          // Fall through to SPA index fallback.
        }
      }

      return reply.sendFile("index.html");
    });
  }

  return app;
};
