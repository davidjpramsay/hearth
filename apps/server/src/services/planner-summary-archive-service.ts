import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { PlannerDayWindowConfig, PlannerWeekSummaryResponse } from "@hearth/shared";
import type { PlannerRepository } from "../repositories/planner-repository.js";

const formatDisplayDate = (value: string): string =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));

const buildSummaryGroups = (summary: PlannerWeekSummaryResponse) =>
  summary.users
    .map((user) => {
      const completed = summary.days
        .map((day) => ({
          date: day.date,
          label: formatDisplayDate(day.date),
          rows: day.blocks
            .filter((block) => block.userId === user.id && block.completed)
            .map((block) => ({
              startTime: block.startTime,
              endTime: block.endTime,
              name: block.name,
            })),
        }))
        .filter((entry) => entry.rows.length > 0);

      const incomplete = summary.days
        .map((day) => ({
          date: day.date,
          label: formatDisplayDate(day.date),
          rows: day.blocks
            .filter((block) => block.userId === user.id && !block.completed)
            .map((block) => ({
              startTime: block.startTime,
              endTime: block.endTime,
              name: block.name,
            })),
        }))
        .filter((entry) => entry.rows.length > 0);

      return {
        user,
        completed,
        incomplete,
      };
    })
    .filter((entry) => entry.completed.length > 0 || entry.incomplete.length > 0);

export class PlannerSummaryArchiveService {
  constructor(
    private readonly plannerRepository: PlannerRepository,
    private readonly options: {
      archiveDir: string;
    },
  ) {
    mkdirSync(this.options.archiveDir, { recursive: true });
  }

  private buildPdfRelativePath(weekStartDate: string): string {
    return `planner-summaries/hearth-school-summary-${weekStartDate}.pdf`;
  }

  private buildPdfAbsolutePath(weekStartDate: string): string {
    return join(this.options.archiveDir, `hearth-school-summary-${weekStartDate}.pdf`);
  }

  async ensurePdfForSummary(summary: PlannerWeekSummaryResponse): Promise<string> {
    const archive = this.plannerRepository.getSummaryArchive(summary.startDate);
    const existingPath = this.plannerRepository.getSummaryArchivePdfRelativePath(summary.startDate);
    if (
      archive?.pdfAvailable &&
      existingPath &&
      existsSync(this.buildPdfAbsolutePath(summary.startDate))
    ) {
      return existingPath;
    }

    const absolutePath = this.buildPdfAbsolutePath(summary.startDate);
    const relativePath = this.buildPdfRelativePath(summary.startDate);
    const groups = buildSummaryGroups(summary);
    const document = new PDFDocument({
      size: "A4",
      margin: 42,
      info: {
        Title: `Hearth school summary ${summary.startDate} to ${summary.endDate}`,
        Author: "Hearth",
      },
    });
    const chunks: Buffer[] = [];

    document.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    document.fontSize(20).text("Hearth School Summary", { align: "left" });
    document.moveDown(0.3);
    document
      .fontSize(11)
      .fillColor("#475569")
      .text(`${formatDisplayDate(summary.startDate)} to ${formatDisplayDate(summary.endDate)}`);
    document.moveDown(0.6);

    for (const child of groups) {
      if (document.y > 700) {
        document.addPage();
      }

      document.fillColor("#0f172a").fontSize(15).text(child.user.name);
      document.moveDown(0.2);

      if (child.completed.length > 0) {
        document.fillColor("#065f46").fontSize(10).text("Completed");
        for (const day of child.completed) {
          document.moveDown(0.1);
          document.fillColor("#475569").fontSize(10).text(day.label);
          for (const item of day.rows) {
            document
              .fillColor("#111827")
              .fontSize(10)
              .text(`• ${item.startTime}-${item.endTime}  ${item.name}`);
          }
        }
      }

      if (child.incomplete.length > 0) {
        document.moveDown(0.2);
        document.fillColor("#92400e").fontSize(10).text("Incomplete");
        for (const day of child.incomplete) {
          document.moveDown(0.1);
          document.fillColor("#475569").fontSize(10).text(day.label);
          for (const item of day.rows) {
            document
              .fillColor("#111827")
              .fontSize(10)
              .text(`• ${item.startTime}-${item.endTime}  ${item.name}`);
          }
        }
      }

      if (child.completed.length === 0 && child.incomplete.length === 0) {
        document.fillColor("#475569").fontSize(10).text("No activities");
      }

      document.moveDown(0.6);
    }

    const pdfBuffer = await new Promise<Buffer>((resolvePromise, rejectPromise) => {
      document.on("end", () => {
        resolvePromise(Buffer.concat(chunks));
      });
      document.on("error", rejectPromise);
      document.end();
    });

    writeFileSync(absolutePath, pdfBuffer);
    this.plannerRepository.setSummaryArchivePdfRelativePath(summary.startDate, relativePath);
    return relativePath;
  }

  async ensurePdfForWeekStart(
    weekStartDate: string,
    dayWindow: PlannerDayWindowConfig,
  ): Promise<string> {
    const archive = this.plannerRepository.getSummaryArchive(weekStartDate);
    if (!archive) {
      throw new Error("School summary archive not found");
    }

    const summary = this.plannerRepository.getWeekSummary({
      startDate: weekStartDate,
      days: 7,
      dayWindow,
    });
    return this.ensurePdfForSummary(summary);
  }

  async readPdf(weekStartDate: string, dayWindow: PlannerDayWindowConfig): Promise<Buffer> {
    await this.ensurePdfForWeekStart(weekStartDate, dayWindow);
    const absolutePath = this.buildPdfAbsolutePath(weekStartDate);
    return readFileSync(absolutePath);
  }
}
