import {
  createLayoutRequestSchema,
  layoutsQuerySchema,
  layoutsResponseSchema,
  type ScreenProfileLayouts,
  updateLayoutRequestSchema,
} from "@hearth/shared";
import { createEmptyLayoutConfig } from "@hearth/core";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { sanitizeLayoutRecordForPublicDisplay } from "../services/public-layout.js";
import type { AppServices } from "../types.js";

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const isDuplicateLayoutNameError = (error: unknown): boolean =>
  error instanceof Error &&
  /unique constraint failed/i.test(error.message) &&
  /(layouts\.name|idx_layout_name_unique_nocase)/i.test(error.message);

const FAMILY_LAYOUT_KEYS = [
  "staticLayoutName",
  "portraitPhotoLayoutName",
  "landscapePhotoLayoutName",
] as const;
const FAMILY_LAYOUT_LIST_KEYS = ["portraitPhotoLayoutNames", "landscapePhotoLayoutNames"] as const;

const renameLayoutNameInRouting = (
  mapping: ScreenProfileLayouts,
  fromName: string,
  toName: string,
): { next: ScreenProfileLayouts; changed: boolean } => {
  let changed = false;
  const nextFamilies = { ...mapping.families };

  for (const [familyId, currentTargets] of Object.entries(mapping.families)) {
    const nextTargets = { ...currentTargets };

    for (const key of FAMILY_LAYOUT_KEYS) {
      if (currentTargets[key] === fromName) {
        nextTargets[key] = toName;
        changed = true;
      }
    }

    for (const key of FAMILY_LAYOUT_LIST_KEYS) {
      const nextList = currentTargets[key].map((entry) => (entry === fromName ? toName : entry));
      const deduplicated = Array.from(new Set(nextList));
      if (JSON.stringify(deduplicated) !== JSON.stringify(currentTargets[key])) {
        nextTargets[key] = deduplicated;
        changed = true;
      }
    }

    const nextAutoTargets = currentTargets.autoLayoutTargets.map((target) =>
      target.layoutName === fromName ? { ...target, layoutName: toName } : target,
    );
    if (JSON.stringify(nextAutoTargets) !== JSON.stringify(currentTargets.autoLayoutTargets)) {
      nextTargets.autoLayoutTargets = nextAutoTargets;
      changed = true;
    }

    const nextLogicNodes = currentTargets.logicGraph.nodes.map((node) =>
      node.type === "display" && node.layoutName === fromName
        ? { ...node, layoutName: toName }
        : node,
    );
    if (JSON.stringify(nextLogicNodes) !== JSON.stringify(currentTargets.logicGraph.nodes)) {
      nextTargets.logicGraph = {
        ...currentTargets.logicGraph,
        nodes: nextLogicNodes,
      };
      changed = true;
    }

    nextFamilies[familyId] = nextTargets;
  }

  return {
    next: {
      ...mapping,
      families: nextFamilies,
    },
    changed,
  };
};

const clearLayoutNameFromRouting = (
  mapping: ScreenProfileLayouts,
  layoutName: string,
): { next: ScreenProfileLayouts; changed: boolean } => {
  let changed = false;
  const nextFamilies = { ...mapping.families };

  for (const [familyId, currentTargets] of Object.entries(mapping.families)) {
    const nextTargets = { ...currentTargets };

    for (const key of FAMILY_LAYOUT_KEYS) {
      if (currentTargets[key] === layoutName) {
        nextTargets[key] = null;
        changed = true;
      }
    }

    for (const key of FAMILY_LAYOUT_LIST_KEYS) {
      const filtered = currentTargets[key].filter((entry) => entry !== layoutName);
      if (filtered.length !== currentTargets[key].length) {
        nextTargets[key] = filtered;
        changed = true;
      }
    }

    const filteredAutoTargets = currentTargets.autoLayoutTargets.filter(
      (target) => target.layoutName !== layoutName,
    );
    if (filteredAutoTargets.length !== currentTargets.autoLayoutTargets.length) {
      nextTargets.autoLayoutTargets = filteredAutoTargets;
      changed = true;
    }

    const removedNodeIds = new Set(
      currentTargets.logicGraph.nodes
        .filter((node) => node.type === "display" && node.layoutName === layoutName)
        .map((node) => node.id),
    );
    if (removedNodeIds.size > 0) {
      nextTargets.logicGraph = {
        ...currentTargets.logicGraph,
        nodes: currentTargets.logicGraph.nodes.filter((node) => !removedNodeIds.has(node.id)),
        edges: currentTargets.logicGraph.edges.filter(
          (edge) => !removedNodeIds.has(edge.from) && !removedNodeIds.has(edge.to),
        ),
      };
      changed = true;
    }

    nextFamilies[familyId] = nextTargets;
  }

  return {
    next: {
      ...mapping,
      families: nextFamilies,
    },
    changed,
  };
};

export const registerLayoutRoutes = (app: FastifyInstance, services: AppServices): void => {
  app.get("/layouts", async (request, reply) => {
    const query = layoutsQuerySchema.safeParse(request.query ?? {});

    if (!query.success) {
      return reply.code(400).send({ message: query.error.message });
    }

    if (!query.data.activeOnly) {
      await app.authenticate(request, reply);

      if (reply.sent) {
        return;
      }
    }

    const layouts = services.layoutRepository.listLayouts(query.data.activeOnly);
    return reply.send(
      layoutsResponseSchema.parse(
        query.data.activeOnly
          ? layouts.map((layout) => sanitizeLayoutRecordForPublicDisplay(layout) ?? layout)
          : layouts,
      ),
    );
  });

  app.post("/layouts", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const parsedBody = createLayoutRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    let createdLayout;
    try {
      createdLayout = services.layoutRepository.createLayout(
        parsedBody.data.name,
        parsedBody.data.config ?? createEmptyLayoutConfig(),
      );
    } catch (error) {
      if (isDuplicateLayoutNameError(error)) {
        return reply.code(409).send({ message: "Layout name must be unique" });
      }

      throw error;
    }

    const activeLayout = services.layoutRepository.getActiveLayout();

    services.layoutEventBus.publish({
      type: "layout-updated",
      layoutId: createdLayout.id,
      activeLayoutId: activeLayout?.id ?? null,
      version: createdLayout.version,
      changedAt: new Date().toISOString(),
    });

    return reply.code(201).send(createdLayout);
  });

  app.put("/layouts/:id", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const parsedBody = updateLayoutRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    const existingLayout = services.layoutRepository.getById(params.data.id);
    if (!existingLayout) {
      return reply.code(404).send({ message: "Layout not found" });
    }

    let updated;
    try {
      updated = services.layoutRepository.updateLayout(params.data.id, {
        name: parsedBody.data.name,
        config: parsedBody.data.config,
      });
    } catch (error) {
      if (isDuplicateLayoutNameError(error)) {
        return reply.code(409).send({ message: "Layout name must be unique" });
      }

      throw error;
    }

    if (!updated) {
      return reply.code(404).send({ message: "Layout not found" });
    }

    if (existingLayout.name !== updated.name) {
      const currentMapping = services.settingsRepository.getScreenProfileLayouts();
      const renamed = renameLayoutNameInRouting(currentMapping, existingLayout.name, updated.name);

      if (renamed.changed) {
        services.settingsRepository.setScreenProfileLayouts(renamed.next);
      }
    }

    const activeLayout = services.layoutRepository.getActiveLayout();

    services.layoutEventBus.publish({
      type: "layout-updated",
      layoutId: updated.id,
      activeLayoutId: activeLayout?.id ?? null,
      version: updated.version,
      changedAt: new Date().toISOString(),
    });

    return reply.send(updated);
  });

  app.post("/layouts/:id/activate", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const activated = services.layoutRepository.activateLayout(params.data.id);

    if (!activated) {
      return reply.code(404).send({ message: "Layout not found" });
    }

    services.layoutEventBus.publish({
      type: "layout-updated",
      layoutId: activated.id,
      activeLayoutId: activated.id,
      version: activated.version,
      changedAt: new Date().toISOString(),
    });

    return reply.send(activated);
  });

  app.delete("/layouts/:id", async (request, reply) => {
    await app.authenticate(request, reply);

    if (reply.sent) {
      return;
    }

    const params = idParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ message: params.error.message });
    }

    const deleted = services.layoutRepository.deleteLayout(params.data.id);

    if (!deleted) {
      return reply.code(404).send({ message: "Layout not found" });
    }

    const currentMapping = services.settingsRepository.getScreenProfileLayouts();
    const cleared = clearLayoutNameFromRouting(currentMapping, deleted.name);

    if (cleared.changed) {
      services.settingsRepository.setScreenProfileLayouts(cleared.next);
    }

    const activeLayout = services.layoutRepository.getActiveLayout();

    services.layoutEventBus.publish({
      type: "layout-updated",
      layoutId: deleted.id,
      activeLayoutId: activeLayout?.id ?? null,
      version: activeLayout?.version ?? deleted.version,
      changedAt: new Date().toISOString(),
    });

    return reply.code(204).send();
  });
};
