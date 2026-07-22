import {
  createPlannerTemplateRequestSchema,
  duplicatePlannerTemplateRequestSchema,
  plannerActivityBlockSchema,
  plannerDashboardResponseSchema,
  plannerDateAssignmentSchema,
  plannerDayWindowConfigSchema,
  plannerSummaryArchiveListResponseSchema,
  plannerTemplateDetailSchema,
  plannerTemplateSchema,
  plannerTodayResponseSchema,
  plannerWeekSummaryResponseSchema,
  replacePlannerTemplateBlocksRequestSchema,
  updatePlannerTemplateRequestSchema,
  upsertPlannerDateAssignmentRequestSchema,
  type CreatePlannerTemplateRequest,
  type DuplicatePlannerTemplateRequest,
  type PlannerActivityBlock,
  type PlannerDashboardResponse,
  type PlannerDateAssignment,
  type PlannerDayWindowConfig,
  type PlannerSummaryArchiveListResponse,
  type PlannerTemplate,
  type PlannerTemplateDetail,
  type PlannerTodayResponse,
  type PlannerWeekSummaryResponse,
  type ReplacePlannerTemplateBlocksRequest,
  type UpdatePlannerTemplateRequest,
  type UpsertPlannerDateAssignmentRequest,
} from "@hearth/shared";
import { handleUnauthorizedAdminResponse } from "../auth/session";
import { API_BASE, request, withAuth } from "./http";

export const getPlannerDashboard = async (token: string): Promise<PlannerDashboardResponse> =>
  request("/planner/dashboard", { method: "GET", headers: withAuth(token) }, (payload) =>
    plannerDashboardResponseSchema.parse(payload),
  );

export const getPlannerSummary = async (token: string): Promise<PlannerWeekSummaryResponse> =>
  request("/planner/summary", { method: "GET", headers: withAuth(token) }, (payload) =>
    plannerWeekSummaryResponseSchema.parse(payload),
  );

export const getPlannerSummaryArchives = async (
  token: string,
): Promise<PlannerSummaryArchiveListResponse> =>
  request("/planner/summary/archives", { method: "GET", headers: withAuth(token) }, (payload) =>
    plannerSummaryArchiveListResponseSchema.parse(payload),
  );

export const downloadPlannerSummaryPdf = async (
  token: string,
  weekStartDate: string,
): Promise<Blob> => {
  const authHeaders = new Headers(withAuth(token));
  const response = await fetch(
    `${API_BASE}/planner/summary/archives/${encodeURIComponent(weekStartDate)}/pdf`,
    { method: "GET", headers: authHeaders },
  );

  if (!response.ok) {
    handleUnauthorizedAdminResponse(response.status, authHeaders);
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody.message === "string"
        ? errorBody.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return response.blob();
};

export const getPlannerDayWindow = async (token: string): Promise<PlannerDayWindowConfig> =>
  request("/planner/day-window", { method: "GET", headers: withAuth(token) }, (payload) =>
    plannerDayWindowConfigSchema.parse(payload),
  );

export const updatePlannerDayWindow = async (
  token: string,
  payload: PlannerDayWindowConfig,
): Promise<PlannerDayWindowConfig> =>
  request(
    "/planner/day-window",
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(plannerDayWindowConfigSchema.parse(payload)),
    },
    (body) => plannerDayWindowConfigSchema.parse(body),
  );

export const getPlannerTemplates = async (token: string): Promise<PlannerTemplateDetail[]> =>
  request("/planner/templates", { method: "GET", headers: withAuth(token) }, (payload) =>
    plannerTemplateDetailSchema.array().parse(payload),
  );

export const createPlannerTemplate = async (
  token: string,
  payload: CreatePlannerTemplateRequest,
): Promise<PlannerTemplate> =>
  request(
    "/planner/templates",
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(createPlannerTemplateRequestSchema.parse(payload)),
    },
    (body) => plannerTemplateSchema.parse(body),
  );

export const updatePlannerTemplate = async (
  token: string,
  id: number,
  payload: UpdatePlannerTemplateRequest,
): Promise<PlannerTemplate> =>
  request(
    `/planner/templates/${id}`,
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(updatePlannerTemplateRequestSchema.parse(payload)),
    },
    (body) => plannerTemplateSchema.parse(body),
  );

export const duplicatePlannerTemplate = async (
  token: string,
  id: number,
  payload: DuplicatePlannerTemplateRequest,
): Promise<PlannerTemplate> =>
  request(
    `/planner/templates/${id}/duplicate`,
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(duplicatePlannerTemplateRequestSchema.parse(payload)),
    },
    (body) => plannerTemplateSchema.parse(body),
  );

export const deletePlannerTemplate = async (token: string, id: number): Promise<void> => {
  await request(
    `/planner/templates/${id}`,
    { method: "DELETE", headers: withAuth(token) },
    () => undefined,
  );
};

export const replacePlannerTemplateBlocks = async (
  token: string,
  id: number,
  payload: ReplacePlannerTemplateBlocksRequest,
): Promise<PlannerActivityBlock[]> =>
  request(
    `/planner/templates/${id}/blocks`,
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(replacePlannerTemplateBlocksRequestSchema.parse(payload)),
    },
    (body) => plannerActivityBlockSchema.array().parse(body),
  );

export const getPlannerAssignments = async (token: string): Promise<PlannerDateAssignment[]> =>
  request("/planner/assignments", { method: "GET", headers: withAuth(token) }, (payload) =>
    plannerDateAssignmentSchema.array().parse(payload),
  );

export const upsertPlannerAssignment = async (
  token: string,
  payload: UpsertPlannerDateAssignmentRequest,
): Promise<PlannerDateAssignment> =>
  request(
    "/planner/assignments",
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(upsertPlannerDateAssignmentRequestSchema.parse(payload)),
    },
    (body) => plannerDateAssignmentSchema.parse(body),
  );

export const deletePlannerAssignment = async (token: string, date: string): Promise<void> => {
  await request(
    `/planner/assignments/${encodeURIComponent(date)}`,
    { method: "DELETE", headers: withAuth(token) },
    () => undefined,
  );
};

export const getPlannerToday = async (instanceId: string): Promise<PlannerTodayResponse> =>
  request(
    `/modules/homeschool-planner/${encodeURIComponent(instanceId)}/today`,
    { method: "GET" },
    (payload) => plannerTodayResponseSchema.parse(payload),
  );
