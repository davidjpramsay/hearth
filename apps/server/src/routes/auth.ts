import bcrypt from "bcryptjs";
import {
  loginRequestSchema,
  loginResponseSchema,
} from "@hearth/shared";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";

export const verifyAdminPassword = (input: {
  storedPasswordHash: string | null;
  password: string;
  comparePassword: (password: string, hash: string) => boolean;
}): "authorized" | "invalid" | "setup-required" => {
  if (!input.storedPasswordHash) {
    return "setup-required";
  }

  return input.comparePassword(input.password, input.storedPasswordHash)
    ? "authorized"
    : "invalid";
};

export const registerAuthRoutes = (
  app: FastifyInstance,
  services: AppServices,
): void => {
  const { compareSync } = bcrypt;

  app.post("/auth/login", async (request, reply) => {
    const parsedBody = loginRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    const authState = verifyAdminPassword({
      storedPasswordHash: services.settingsRepository.getAdminPasswordHash(),
      password: parsedBody.data.password,
      comparePassword: compareSync,
    });
    if (authState === "setup-required") {
      return reply.code(503).send({
        message: "Admin password is not initialized. Set ADMIN_PASSWORD on the server and restart.",
      });
    }

    if (authState === "invalid") {
      return reply.code(401).send({ message: "Invalid password" });
    }

    const token = app.jwt.sign({ role: "admin" }, { expiresIn: "7d" });

    return reply.send(
      loginResponseSchema.parse({
        token,
      }),
    );
  });
};
