# Layout Logic Customization

Hearth supports custom condition and action ids for auto layout logic.

## Source of Truth

Built-in layout-logic ids and runtime behavior live in one shared contract:

- `packages/shared/src/layout-logic-registry.ts`

Consumers:

- Admin/UI registry wiring: `apps/web/src/components/admin/logicNodeRegistry.ts`
- Server runtime resolution: `apps/server/src/layout-logic/registry.ts`

## How It Works

1. Built-ins are defined once in `@hearth/shared`.
2. Web consumes the same ids for inspector dropdowns and summaries.
3. Server consumes the same ids for condition/action execution.
4. Custom app-specific ids can be added in:
   - web `customConditionTypes` / `customCanvasActionTypes` / `customRuleActionTypes`
   - server `customConditionResolvers` / `customActionResolvers`

If a runtime action id is unknown, the server falls back to default display behavior.
If a runtime condition id is unknown, evaluation falls back to built-in portrait/landscape behavior.
The selected action-node type is saved per set as `photoActionType`.
The select-photo action collection is saved per set as `photoActionCollectionId`.
Rule `cycleSeconds` is the active dwell timer for the resolved layout target; in set-driven display mode this also becomes the effective Photos slide interval for that layout.
Built-in display actions may include `actionParams.photoCollectionId` to override the set select-photo collection for that specific rule step. If neither is set, `/photos` is used by default.
Canvas node placement is saved per set as `logicNodePositions` so set graph layout persists across reloads.

## Typed Params

Action/condition params are schema-driven in the SDK:

- `paramsSchema`: persisted param schema (Zod)
- `paramFields`: inspector control definitions

Supported field types:

- `text`
- `number`
- `boolean`
- `select`

Condition evaluation context currently includes selected photo orientation (`portrait | landscape | null`).

## Param Example

```ts
{
  id: "layout.display.priority",
  label: "Display layout (priority)",
  description: "Display with priority metadata.",
  fields: [...],
  paramsSchema: z.object({
    priority: z.number().int().min(1).max(5).default(1),
    reason: z.string().default("manual"),
  }),
  paramFields: [
    { key: "priority", label: "Priority", kind: "number", min: 1, max: 5, step: 1 },
    { key: "reason", label: "Reason", kind: "text" },
  ],
}
```

This keeps custom logic predictable while still allowing custom action/condition ids and behavior.
