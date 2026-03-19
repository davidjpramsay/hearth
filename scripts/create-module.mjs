#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

const rootDir = process.cwd();
const sdkDir = path.join(rootDir, "apps/web/src/modules/sdk");
const serverAdaptersDir = path.join(rootDir, "apps/server/src/modules/adapters");
const adaptersIndexFile = path.join(serverAdaptersDir, "index.ts");

const normalizeName = (name) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toPascalCase = (name) =>
  name
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

const ask = async (rl, prompt, fallback = "") => {
  const answer = (await rl.question(`${prompt}${fallback ? ` (${fallback})` : ""}: `)).trim();
  return answer || fallback;
};

const moduleTemplate = (slug, displayName, typeLabel, includeDataHook) => `import { z } from "zod";
import { defineModule } from "@hearth/module-sdk";
import { ModuleFrame } from "../ui/ModuleFrame";
${includeDataHook ? 'import { useModuleQuery } from "../data/useModuleQuery";' : ""}

const settingsSchema = z.object({
  title: z.string().trim().min(1).max(80).default("${displayName}"),
});

type Settings = z.infer<typeof settingsSchema>;

const SettingsPanel = ({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) => (
  <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
    <h3 className="text-base font-semibold">${displayName} settings</h3>
    <label className="block space-y-2">
      <span>Title</span>
      <input
        className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
        value={settings.title}
        onChange={(event) =>
          onChange({
            ...settings,
            title: event.target.value,
          })
        }
      />
    </label>
  </div>
);

export const moduleDefinition = defineModule({
  manifest: {
    id: "${slug}",
    name: "${displayName}",
    version: "1.0.0",
    description: "Generated ${typeLabel} module",
    defaultSize: { w: 4, h: 3 },
    categories: ["generated"],
    permissions: [],
    dataSources: [{ id: "${slug}-source", kind: "${includeDataHook ? "rest" : "local"}" }],
  },
  settingsSchema,
  runtime: {
    Component: ({ settings }) => {
      ${
        includeDataHook
          ? `const data = useModuleQuery({
        key: "${slug}",
        queryFn: async () => {
          const response = await fetch("/api/modules/${slug}");
          if (!response.ok) {
            throw new Error(\`Failed to load ${slug} (\${response.status})\`);
          }
          return await response.json();
        },
        intervalMs: 30_000,
      });`
          : ""
      }

      return (
        <ModuleFrame
          title={settings.title}
          ${includeDataHook ? "loading={data.loading} error={data.error} lastUpdatedMs={data.lastUpdatedMs}" : ""}
        >
          <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-slate-200">
            ${includeDataHook ? '<pre className="max-h-40 overflow-auto text-xs">{JSON.stringify(data.data ?? { ok: true }, null, 2)}</pre>' : '<p className="text-sm">Generated module scaffold is ready.</p>'}
          </div>
        </ModuleFrame>
      );
    },
  },
  admin: {
    SettingsPanel,
  },
});

export default moduleDefinition;
`;

const moduleReadmeTemplate = (
  slug,
  displayName,
  typeLabel,
  includeServerAdapter,
) => `# ${displayName}

- Module ID: \`${slug}\`
- Type: ${typeLabel}
- Web file: \`apps/web/src/modules/sdk/${slug}.module.tsx\`
${includeServerAdapter ? `- Server adapter: \`apps/server/src/modules/adapters/${slug}.ts\`` : ""}

## Next steps

1. Replace settings schema with real settings.
2. Implement display and settings UI.
3. Add tests for settings/data validation.
${includeServerAdapter ? "4. Implement real data integration inside the server adapter." : ""}
`;

const serverAdapterTemplate = (slug, displayName) => {
  const adapterConst = `${slug.replace(/-/g, "")}Adapter`;
  const schemaConst = `${toPascalCase(slug)}ResponseSchema`;

  return `import { z } from "zod";
import type { ModuleServerAdapter } from "../types.js";

export const ${schemaConst} = z.object({
  ok: z.boolean(),
  module: z.string(),
  timestamp: z.string(),
});

export const ${adapterConst}: ModuleServerAdapter = {
  id: "${slug}",
  registerRoutes: (app) => {
    app.get("/", async (_request, reply) => {
      return reply.send(
        ${schemaConst}.parse({
          ok: true,
          module: "${displayName}",
          timestamp: new Date().toISOString(),
        }),
      );
    });
  },
  healthCheck: () => ({
    ok: true,
  }),
};
`;
};

const addAdapterToIndex = async (slug) => {
  let indexSource = await fs.readFile(adaptersIndexFile, "utf8");
  const importName = `${slug.replace(/-/g, "")}Adapter`;
  const importLine = `import { ${importName} } from "./${slug}.js";`;

  if (indexSource.includes(importLine)) {
    return;
  }

  indexSource = `${importLine}\n${indexSource}`;
  indexSource = indexSource.replace(
    /export const defaultModuleAdapters: ModuleServerAdapter\[] = \[(.*?)\];/s,
    (_match, group) => {
      const trimmed = group
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const entries = new Set(trimmed.map((entry) => entry.replace(/,$/, "")));
      entries.add(importName);
      const next = [...entries].sort();
      return `export const defaultModuleAdapters: ModuleServerAdapter[] = [\n  ${next.join(",\n  ")},\n];`;
    },
  );

  await fs.writeFile(adaptersIndexFile, indexSource, "utf8");
};

const run = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const rawName = await ask(rl, "Module name");
    const slug = normalizeName(rawName);
    if (!slug) {
      throw new Error("Module name must contain at least one alphanumeric character.");
    }

    const displayName = await ask(rl, "Display name", toPascalCase(slug));
    const type = await ask(rl, "Module type [ui-only|rest-poll|streaming|composite]", "ui-only");
    const normalizedType = ["ui-only", "rest-poll", "streaming", "composite"].includes(type)
      ? type
      : "ui-only";

    const includeServerAdapter =
      normalizedType === "ui-only"
        ? (await ask(rl, "Generate server adapter? [y/N]", "n")).toLowerCase().startsWith("y")
        : true;

    const moduleFile = path.join(sdkDir, `${slug}.module.tsx`);
    const readmeFile = path.join(sdkDir, `${slug}.README.md`);

    try {
      await fs.access(moduleFile);
      throw new Error(`Module file already exists: ${moduleFile}`);
    } catch {
      // Continue when file does not exist.
    }

    await fs.writeFile(
      moduleFile,
      moduleTemplate(slug, displayName, normalizedType, normalizedType !== "ui-only"),
      "utf8",
    );
    await fs.writeFile(
      readmeFile,
      moduleReadmeTemplate(slug, displayName, normalizedType, includeServerAdapter),
      "utf8",
    );

    if (includeServerAdapter) {
      const adapterFile = path.join(serverAdaptersDir, `${slug}.ts`);
      await fs.writeFile(adapterFile, serverAdapterTemplate(slug, displayName), "utf8");
      await addAdapterToIndex(slug);
    }

    process.stdout.write(`\nCreated module scaffold for '${slug}'.\n`);
    process.stdout.write(`- ${path.relative(rootDir, moduleFile)}\n`);
    process.stdout.write(`- ${path.relative(rootDir, readmeFile)}\n`);
    if (includeServerAdapter) {
      process.stdout.write(
        `- ${path.relative(rootDir, path.join(serverAdaptersDir, `${slug}.ts`))}\n`,
      );
    }
    process.stdout.write("\nNext: pnpm -r build\n");
  } finally {
    rl.close();
  }
};

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
