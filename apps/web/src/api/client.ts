import {
  choreMemberSchema,
  choreRecordSchema,
  choresBoardQuerySchema,
  choresBoardResponseSchema,
  choresDashboardResponseSchema,
  choresPayoutConfigSchema,
  createChoreMemberRequestSchema,
  createChoreRequestSchema,
  displayDeviceSchema,
  displayDevicesResponseSchema,
  layoutRecordSchema,
  layoutsResponseSchema,
  loginResponseSchema,
  photoCollectionsResponseSchema,
  photoLibraryFoldersResponseSchema,
  reportScreenProfileRequestSchema,
  reportScreenProfileResponseSchema,
  screenProfileLayoutsSchema,
  setChoreCompletionRequestSchema,
  updateDisplayDeviceRequestSchema,
  updateChoresPayoutConfigRequestSchema,
  type ChoreMember,
  type ChoreRecord,
  type ChoresBoardResponse,
  type ChoresDashboardResponse,
  type ChoresPayoutConfig,
  type CreateChoreMemberRequest,
  type CreateChoreRequest,
  type CreateLayoutRequest,
  type DisplayDevice,
  type DisplayDevicesResponse,
  type LayoutRecord,
  type LoginResponse,
  type PhotoCollectionsResponse,
  type PhotoLibraryFoldersResponse,
  type ReportScreenProfileRequest,
  type ReportScreenProfileResponse,
  type ScreenProfileLayouts,
  type SetChoreCompletionRequest,
  type UpdateDisplayDeviceRequest,
  type UpdateChoreMemberRequest,
  type UpdateChoreRequest,
  type UpdateChoresPayoutConfigRequest,
  type UpdateLayoutRequest,
} from "@hearth/shared";
import { handleUnauthorizedAdminResponse } from "../auth/session";

const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

const request = async <T>(
  path: string,
  init: RequestInit,
  parser: (payload: unknown) => T,
): Promise<T> => {
  const headers = new Headers(init.headers ?? {});
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    handleUnauthorizedAdminResponse(response.status, headers);
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody.message === "string"
        ? errorBody.message
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return parser(undefined);
  }

  const data = await response.json().catch(() => undefined);
  return parser(data);
};

const withAuth = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});

export const login = async (password: string): Promise<LoginResponse> =>
  request(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
    (payload) => loginResponseSchema.parse(payload),
  );

export const getLayouts = async (activeOnly = false, token?: string): Promise<LayoutRecord[]> =>
  request(
    `/layouts?activeOnly=${activeOnly ? "true" : "false"}`,
    {
      method: "GET",
      headers: token ? withAuth(token) : undefined,
    },
    (payload) => layoutsResponseSchema.parse(payload),
  );

export const createLayout = async (
  token: string,
  payload: CreateLayoutRequest,
): Promise<LayoutRecord> =>
  request(
    "/layouts",
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(payload),
    },
    (body) => layoutRecordSchema.parse(body),
  );

export const updateLayout = async (
  token: string,
  id: number,
  payload: UpdateLayoutRequest,
): Promise<LayoutRecord> =>
  request(
    `/layouts/${id}`,
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(payload),
    },
    (body) => layoutRecordSchema.parse(body),
  );

export const activateLayout = async (token: string, id: number): Promise<LayoutRecord> =>
  request(
    `/layouts/${id}/activate`,
    {
      method: "POST",
      headers: withAuth(token),
    },
    (body) => layoutRecordSchema.parse(body),
  );

export const deleteLayout = async (token: string, id: number): Promise<void> => {
  await request(
    `/layouts/${id}`,
    {
      method: "DELETE",
      headers: withAuth(token),
    },
    () => undefined,
  );
};

export const getScreenProfileLayouts = async (token: string): Promise<ScreenProfileLayouts> =>
  request(
    "/display/screen-profiles",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => screenProfileLayoutsSchema.parse(payload),
  );

export const updateScreenProfileLayouts = async (
  token: string,
  payload: ScreenProfileLayouts,
): Promise<ScreenProfileLayouts> =>
  request(
    "/display/screen-profiles",
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(screenProfileLayoutsSchema.parse(payload)),
    },
    (body) => screenProfileLayoutsSchema.parse(body),
  );

export const getDisplayDevices = async (token: string): Promise<DisplayDevicesResponse> =>
  request(
    "/display/devices",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => displayDevicesResponseSchema.parse(payload),
  );

export const updateDisplayDevice = async (
  token: string,
  deviceId: string,
  payload: UpdateDisplayDeviceRequest,
): Promise<DisplayDevice> =>
  request(
    `/display/devices/${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(updateDisplayDeviceRequestSchema.parse(payload)),
    },
    (body) => displayDeviceSchema.parse(body),
  );

export const deleteDisplayDevice = async (token: string, deviceId: string): Promise<void> => {
  await request(
    `/display/devices/${encodeURIComponent(deviceId)}`,
    {
      method: "DELETE",
      headers: withAuth(token),
    },
    () => undefined,
  );
};

export const getPhotoCollections = async (token: string): Promise<PhotoCollectionsResponse> =>
  request(
    "/display/photo-collections",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => photoCollectionsResponseSchema.parse(payload),
  );

export const updatePhotoCollections = async (
  token: string,
  payload: PhotoCollectionsResponse,
): Promise<PhotoCollectionsResponse> =>
  request(
    "/display/photo-collections",
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(photoCollectionsResponseSchema.parse(payload)),
    },
    (body) => photoCollectionsResponseSchema.parse(body),
  );

export const getPhotoLibraryFolders = async (token: string): Promise<PhotoLibraryFoldersResponse> =>
  request(
    "/display/photo-library-folders",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => photoLibraryFoldersResponseSchema.parse(payload),
  );

export const reportScreenProfile = async (
  payload: ReportScreenProfileRequest,
): Promise<ReportScreenProfileResponse> =>
  request(
    "/display/screen-profile/report",
    {
      method: "POST",
      body: JSON.stringify(reportScreenProfileRequestSchema.parse(payload)),
    },
    (body) => reportScreenProfileResponseSchema.parse(body),
  );

export const getChoreBoard = async (
  token: string,
  options: { startDate?: string; days?: number } = {},
): Promise<ChoresBoardResponse> => {
  const parsedQuery = choresBoardQuerySchema.parse(options);
  const query = new URLSearchParams();

  if (parsedQuery.startDate) {
    query.set("startDate", parsedQuery.startDate);
  }

  query.set("days", String(parsedQuery.days));

  return request(
    `/chores/board?${query.toString()}`,
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => choresBoardResponseSchema.parse(payload),
  );
};

export const getChoresDashboard = async (token: string): Promise<ChoresDashboardResponse> =>
  request(
    "/chores/dashboard",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => choresDashboardResponseSchema.parse(payload),
  );

export const getChoreMembers = async (token: string): Promise<ChoreMember[]> =>
  request(
    "/chores/members",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => choreMemberSchema.array().parse(payload),
  );

export const createChoreMember = async (
  token: string,
  payload: CreateChoreMemberRequest,
): Promise<ChoreMember> =>
  request(
    "/chores/members",
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(createChoreMemberRequestSchema.parse(payload)),
    },
    (body) => choreMemberSchema.parse(body),
  );

export const updateChoreMember = async (
  token: string,
  id: number,
  payload: UpdateChoreMemberRequest,
): Promise<ChoreMember> =>
  request(
    `/chores/members/${id}`,
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(payload),
    },
    (body) => choreMemberSchema.parse(body),
  );

export const deleteChoreMember = async (token: string, id: number): Promise<void> => {
  await request(
    `/chores/members/${id}`,
    {
      method: "DELETE",
      headers: withAuth(token),
    },
    () => undefined,
  );
};

export const getChoreItems = async (token: string): Promise<ChoreRecord[]> =>
  request(
    "/chores/items",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => choreRecordSchema.array().parse(payload),
  );

export const createChoreItem = async (
  token: string,
  payload: CreateChoreRequest,
): Promise<ChoreRecord> =>
  request(
    "/chores/items",
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(createChoreRequestSchema.parse(payload)),
    },
    (body) => choreRecordSchema.parse(body),
  );

export const updateChoreItem = async (
  token: string,
  id: number,
  payload: UpdateChoreRequest,
): Promise<ChoreRecord> =>
  request(
    `/chores/items/${id}`,
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(payload),
    },
    (body) => choreRecordSchema.parse(body),
  );

export const deleteChoreItem = async (token: string, id: number): Promise<void> => {
  await request(
    `/chores/items/${id}`,
    {
      method: "DELETE",
      headers: withAuth(token),
    },
    () => undefined,
  );
};

export const setChoreCompletion = async (
  token: string,
  payload: SetChoreCompletionRequest,
): Promise<ChoresDashboardResponse> =>
  request(
    "/chores/completions",
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(setChoreCompletionRequestSchema.parse(payload)),
    },
    (body) => choresDashboardResponseSchema.parse(body),
  );

export const getChoresPayoutConfig = async (token: string): Promise<ChoresPayoutConfig> =>
  request(
    "/chores/payout-config",
    {
      method: "GET",
      headers: withAuth(token),
    },
    (payload) => choresPayoutConfigSchema.parse(payload),
  );

export const updateChoresPayoutConfig = async (
  token: string,
  payload: UpdateChoresPayoutConfigRequest,
): Promise<ChoresPayoutConfig> =>
  request(
    "/chores/payout-config",
    {
      method: "PUT",
      headers: withAuth(token),
      body: JSON.stringify(updateChoresPayoutConfigRequestSchema.parse(payload)),
    },
    (body) => choresPayoutConfigSchema.parse(body),
  );
