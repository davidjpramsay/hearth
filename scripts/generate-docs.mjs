#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import prettier from "prettier";

const rootDir = process.cwd();
const docsContentPath = path.join(rootDir, "docs/content/app-docs.json");
const markdownOutputPath = path.join(rootDir, "docs/APP_DOCS.md");
const docsSiteModulePath = path.join(rootDir, "apps/docs/src/content/app-docs.generated.ts");
const checkMode = process.argv.includes("--check");

const formatWithProjectPrettier = async (value, filepath) => {
  const resolvedConfig = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(value, {
    ...resolvedConfig,
    filepath,
  });
};

const escapeInlineCode = (value) => value.replace(/`/g, "\\`");

const formatCodeBlock = (code) =>
  code
    ? [`### ${code.title}`, "", `\`\`\`${code.language}`, code.content, "```", ""].join("\n")
    : "";

const formatBullets = (bullets) =>
  Array.isArray(bullets) && bullets.length > 0
    ? `${bullets.map((item) => `- ${item}`).join("\n")}\n\n`
    : "";

const generateMarkdown = (content) => {
  const hero = content.hero;
  const sections = content.sections ?? [];

  return [
    "<!-- This file is generated from docs/content/app-docs.json. Do not edit it directly. -->",
    "",
    "# Hearth App Docs",
    "",
    `${hero.summary}`,
    "",
    "## Highlights",
    "",
    ...hero.highlights.map((highlight) => `- ${highlight}`),
    "",
    "## Sections",
    "",
    ...sections.map((section) => `- [${escapeInlineCode(section.title)}](#${section.id})`),
    "",
    ...sections.flatMap((section) => {
      const lines = [
        `## ${section.title}`,
        "",
        `_${section.eyebrow}_`,
        "",
        `${section.summary}`,
        "",
        ...section.body.flatMap((paragraph) => [paragraph, ""]),
      ];

      const bulletsBlock = formatBullets(section.bullets);
      if (bulletsBlock) {
        lines.push(bulletsBlock.trimEnd(), "");
      }

      const codeBlock = formatCodeBlock(section.code);
      if (codeBlock) {
        lines.push(codeBlock.trimEnd(), "");
      }

      return lines;
    }),
  ].join("\n");
};

const generateDocsSiteModule = (
  content,
) => `// This file is generated from docs/content/app-docs.json. Do not edit it directly.
export const appDocsContent = ${JSON.stringify(content, null, 2)} as const;
`;

const run = async () => {
  const rawContent = await fs.readFile(docsContentPath, "utf8");
  const parsedContent = JSON.parse(rawContent);
  const nextMarkdown = await formatWithProjectPrettier(
    generateMarkdown(parsedContent),
    markdownOutputPath,
  );
  const nextDocsSiteModule = await formatWithProjectPrettier(
    generateDocsSiteModule(parsedContent),
    docsSiteModulePath,
  );

  if (checkMode) {
    const existingMarkdown = await fs.readFile(markdownOutputPath, "utf8").catch(() => null);
    const existingDocsSiteModule = await fs.readFile(docsSiteModulePath, "utf8").catch(() => null);
    if (existingMarkdown !== nextMarkdown || existingDocsSiteModule !== nextDocsSiteModule) {
      console.error(
        "Generated docs are out of date. Run `pnpm docs:sync` to regenerate the docs artifacts.",
      );
      process.exit(1);
    }

    return;
  }

  await fs.writeFile(markdownOutputPath, nextMarkdown, "utf8");
  await fs.mkdir(path.dirname(docsSiteModulePath), { recursive: true });
  await fs.writeFile(docsSiteModulePath, nextDocsSiteModule, "utf8");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
