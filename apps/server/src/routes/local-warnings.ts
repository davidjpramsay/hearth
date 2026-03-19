import {
  localWarningItemSchema,
  localWarningsModuleCurrentQuerySchema,
  localWarningsModuleCurrentResponseSchema,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export const registerLocalWarningsRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/modules/local-warnings/current", async (request, reply) => {
    const parsedQuery = localWarningsModuleCurrentQuerySchema.safeParse(request.query ?? {});

    if (!parsedQuery.success) {
      return reply.code(400).send({ message: parsedQuery.error.message });
    }

    const warnings = await services.localWarningService.listActiveWarnings(parsedQuery.data);

    return reply.send(
      localWarningsModuleCurrentResponseSchema.parse({
        generatedAt: new Date().toISOString(),
        locationLabel: parsedQuery.data.locationQuery.trim() || "Local area",
        warnings: warnings.map((warning) => localWarningItemSchema.parse(warning)),
        warning: null,
      }),
    );
  });
};
