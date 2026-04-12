#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import prettier from "prettier";

const rootDir = process.cwd();
const docsContentPath = path.join(rootDir, "docs/content/app-docs.json");
const markdownOutputPath = path.join(rootDir, "docs/APP_DOCS.md");
const docsSiteContentDirPath = path.join(rootDir, "apps/docs/src/content/docs");
const docsSiteSidebarPath = path.join(rootDir, "apps/docs/src/generated/starlight-sidebar.mjs");
const checkMode = process.argv.includes("--check");

const formatWithProjectPrettier = async (value, filepath) => {
  const resolvedConfig = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(value, {
    ...resolvedConfig,
    filepath,
  });
};

const escapeInlineCode = (value) => value.replace(/`/g, "\\`");
const escapeYamlString = (value) => JSON.stringify(value);
const slugifySectionId = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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

const groupSectionEntries = (sections) => {
  const groups = [];
  const groupMap = new Map();

  for (const section of sections) {
    const groupName = typeof section.group === "string" ? section.group : "Documentation";
    const existingGroup = groupMap.get(groupName);
    if (existingGroup) {
      existingGroup.push(section);
      continue;
    }

    const nextGroup = [section];
    groupMap.set(groupName, nextGroup);
    groups.push([groupName, nextGroup]);
  }

  return groups;
};

const generateSectionPage = (section) => {
  const lines = [
    "---",
    `title: ${escapeYamlString(section.title)}`,
    `description: ${escapeYamlString(section.summary)}`,
    "---",
    "",
    `${section.summary}`,
    "",
    ...section.body.flatMap((paragraph) => [paragraph, ""]),
  ];

  const bulletsBlock = formatBullets(section.bullets);
  if (bulletsBlock) {
    lines.push("## Key Points", "", bulletsBlock.trimEnd(), "");
  }

  const codeBlock = formatCodeBlock(section.code);
  if (codeBlock) {
    lines.push(codeBlock.trimEnd(), "");
  }

  return lines.join("\n");
};

const generateStarlightSidebarModule = (content) => {
  const sections = content.sections ?? [];
  const groups = groupSectionEntries(sections).map(([label, items]) => ({
    label,
    items: items.map((section) => ({
      label: section.title,
      slug: slugifySectionId(section.id),
    })),
  }));

  return `export const docsSidebar = ${JSON.stringify(groups, null, 2)};\n`;
};

const run = async () => {
  const rawContent = await fs.readFile(docsContentPath, "utf8");
  const parsedContent = JSON.parse(rawContent);
  const sections = parsedContent.sections ?? [];
  const nextMarkdown = await formatWithProjectPrettier(
    generateMarkdown(parsedContent),
    markdownOutputPath,
  );
  const nextSidebarModule = await formatWithProjectPrettier(
    generateStarlightSidebarModule(parsedContent),
    docsSiteSidebarPath,
  );
  const nextSectionPages = await Promise.all(
    sections.map(async (section) => {
      const filename = `${slugifySectionId(section.id)}.md`;
      const filepath = path.join(docsSiteContentDirPath, filename);
      const content = await formatWithProjectPrettier(generateSectionPage(section), filepath);
      return { filepath, content };
    }),
  );

  if (checkMode) {
    const existingMarkdown = await fs.readFile(markdownOutputPath, "utf8").catch(() => null);
    const existingSidebarModule = await fs.readFile(docsSiteSidebarPath, "utf8").catch(() => null);

    const pagesAreCurrent = await Promise.all(
      nextSectionPages.map(async ({ filepath, content }) => {
        const existingContent = await fs.readFile(filepath, "utf8").catch(() => null);
        return existingContent === content;
      }),
    );

    if (
      existingMarkdown !== nextMarkdown ||
      existingSidebarModule !== nextSidebarModule ||
      pagesAreCurrent.some((value) => value === false)
    ) {
      console.error(
        "Generated docs are out of date. Run `pnpm docs:sync` to regenerate the docs artifacts.",
      );
      process.exit(1);
    }

    return;
  }

  await fs.writeFile(markdownOutputPath, nextMarkdown, "utf8");
  await fs.mkdir(docsSiteContentDirPath, { recursive: true });
  await fs.mkdir(path.dirname(docsSiteSidebarPath), { recursive: true });
  const existingEntries = await fs
    .readdir(docsSiteContentDirPath, { withFileTypes: true })
    .catch(() => []);
  await Promise.all(
    existingEntries
      .filter((entry) => entry.isFile())
      .map((entry) => fs.unlink(path.join(docsSiteContentDirPath, entry.name))),
  );
  await Promise.all(
    nextSectionPages.map(({ filepath, content }) => fs.writeFile(filepath, content, "utf8")),
  );
  await fs.writeFile(docsSiteSidebarPath, nextSidebarModule, "utf8");
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
