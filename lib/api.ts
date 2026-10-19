import { API_BASE_URL } from "./config.ts";
import { resolveMediaUrl } from "./media.ts";
import {
  parseCreationDetail,
  parseCreationPage,
  parseCreationQueued,
  parseCreationRetry,
  parseMediaAsset,
  parseWorkflowCapabilities,
  parseWorkflowDetail,
  parseWorkflowPage,
} from "./studio-contracts.ts";
import { parseUserProfile } from "./profile-contract.ts";
import { parsePaintingStatistics, parsePoetryGraph } from "./knowledge-contracts.ts";
import {
  parseCritiqueCapability, parseHistoricalPaintingGuide, parsePaintingCritiqueTask, parsePaintingGuide,
} from "./painting-insight-contracts.ts";
import type {
  AuthRequest,
  AuthResponse,
  CreationSubmission,
  LegacyApiResponse,
  PaintingDetail,
  PaintingPage,
  PaintingQuery,
  PaintingSummary,
  RegisterRequest,
  WorkflowDefinitionInput,
  UserProfile,
} from "./types.ts";

export type ApiErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server"
  | "network"
  | "unknown";

type ErrorBody = {
  message?: unknown;
  code?: unknown;
  correlationId?: unknown;
  validationErrors?: unknown;
  data?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly kind: ApiErrorKind,
    public readonly code?: string,
    public readonly validationErrors: Record<string, string> = {},
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * A response may be HTTP-successful but still fail the owner-scoped Creation
 * contract. This is intentionally distinct from authentication, transport,
 * and provider failures so the UI can retain its last known run state.
 */
export class CreationResponseContractError extends Error {
  constructor(
    public readonly endpoint: "list" | "detail",
    public readonly parserReason: string,
  ) {
    super(endpoint === "detail"
      ? "创作详情返回格式不完整。上次成功读取的内容已保留，请点击“刷新详情”确认实际状态。"
      : "我的作品列表返回格式不完整。上次成功读取的内容已保留，请点击“刷新”再次读取。");
    this.name = "CreationResponseContractError";
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "unknown";
}

function fallbackMessage(status: number): string {
  const messages: Record<number, string> = {
    400: "请求内容有误，请检查后重试。",
    401: "登录状态已失效，请重新登录。",
    403: "当前账号无权执行此操作。",
    404: "请求的内容不存在或暂不可用。",
    409: "当前状态发生冲突，请刷新后重试。",
    429: "请求过于频繁，请稍后再试。",
  };

  return messages[status] ?? (status >= 500
    ? "服务暂时不可用，请稍后再试。"
    : "请求未能完成，请稍后再试。");
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined;

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function toApiError(status: number, body: unknown): ApiError {
  const source = body && typeof body === "object" ? body as ErrorBody : {};
  const validationErrors = {
    ...stringRecord(source.data),
    ...stringRecord(source.validationErrors),
  };

  return new ApiError(
    typeof source.message === "string" && source.message.trim()
      ? source.message
      : fallbackMessage(status),
    status,
    kindForStatus(status),
    typeof source.code === "string" ? source.code : undefined,
    validationErrors,
    typeof source.correlationId === "string" ? source.correlationId : undefined,
  );
}

function parseCreationResponse<T>(
  endpoint: "list" | "detail",
  body: unknown,
  parser: (value: unknown) => T,
): T {
  try {
    return parser(body);
  } catch (error) {
    const parserReason = error instanceof Error && error.message
      ? error.message
      : "响应字段无法识别";
    throw new CreationResponseContractError(endpoint, parserReason);
  }
}

type RequestOptions = RequestInit & {
  token?: string | null;
  legacyEnvelope?: boolean;
};

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { token, legacyEnvelope = false, headers, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: requestHeaders,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(
      "无法连接到 ArtLIVE 服务，请检查网络或稍后重试。",
      0,
      "network",
    );
  }

  const body = await parseBody(response);
  if (!response.ok) throw toApiError(response.status, body);
  if (!legacyEnvelope) return body as T;

  const envelope = body as LegacyApiResponse<T> | undefined;
  if (
    !envelope?.success
    || envelope.data === null
    || envelope.data === undefined
  ) {
    throw new ApiError(
      envelope?.message || "服务返回了无法识别的响应。",
      response.status,
      "unknown",
    );
  }
  return envelope.data;
}

async function apiMediaBlob(
  logicalUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const url = resolveMediaUrl(logicalUrl);
  if (!url) {
    throw new ApiError("媒体资源地址无效。", 0, "unknown");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "image/*,audio/*,application/octet-stream,application/json",
        Authorization: `Bearer ${token}`,
      },
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError("无法读取创作结果媒体，请检查网络或稍后重试。", 0, "network");
  }

  if (!response.ok) throw toApiError(response.status, await parseBody(response));
  return response.blob();
}

function queryString(query: PaintingQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : "";
}

export const api = {
  login: (payload: AuthRequest) => apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    legacyEnvelope: true,
  }),
  register: (payload: RegisterRequest) => apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    legacyEnvelope: true,
  }),
  profile: async (token: string) => parseUserProfile(await apiRequest<unknown>("/api/user/profile", {
    token,
    legacyEnvelope: true,
  })),
  paintings: (query: PaintingQuery, token?: string | null, signal?: AbortSignal) =>
    apiRequest<PaintingPage>(`/api/v1/paintings${queryString(query)}`, { token, signal }),
  dailyPainting: (token?: string | null, signal?: AbortSignal) =>
    apiRequest<PaintingSummary>("/api/v1/paintings/daily", { token, signal }),
  painting: (paintingId: string, token: string, signal?: AbortSignal) =>
    apiRequest<PaintingDetail>(`/api/v1/paintings/${encodeURIComponent(paintingId)}`, { token, signal }),
  favoritePainting: (paintingId: string, token: string) =>
    apiRequest<void>(`/api/v1/paintings/${paintingId}/favorite`, {
      method: "PUT",
      token,
    }),
  unfavoritePainting: (paintingId: string, token: string) =>
    apiRequest<void>(`/api/v1/paintings/${paintingId}/favorite`, {
      method: "DELETE",
      token,
    }),
  favoritePaintings: (page: number, size: number, token: string) =>
    apiRequest<PaintingPage>(
      `/api/v1/me/favorites/paintings?page=${page}&size=${size}`,
      { token },
    ),
  guide: async (paintingId: string, token: string, signal?: AbortSignal) =>
    parsePaintingGuide(await apiRequest<unknown>(`/api/v1/paintings/${encodeURIComponent(paintingId)}/guide`, { token, signal }), paintingId),
  historicalGuide: async (paintingId: string, token: string, signal?: AbortSignal) =>
    parseHistoricalPaintingGuide(await apiRequest<unknown>(`/api/v1/paintings/${encodeURIComponent(paintingId)}/guide/history`, { token, signal }), paintingId),
  ensureGuide: async (paintingId: string, token: string, signal?: AbortSignal) =>
    parsePaintingGuide(await apiRequest<unknown>(`/api/v1/paintings/${encodeURIComponent(paintingId)}/guide`, {
      method: "POST",
      token,
      signal,
    }), paintingId),
  critiqueCapability: async (token: string, signal?: AbortSignal) =>
    parseCritiqueCapability(await apiRequest<unknown>("/api/v1/critic/capability", { token, signal })),
  critique: async (paintingId: string, token: string, signal?: AbortSignal) =>
    parsePaintingCritiqueTask(await apiRequest<unknown>(`/api/v1/paintings/${encodeURIComponent(paintingId)}/critic`, { token, signal }), paintingId),
  critiqueTask: async (critiqueId: string, paintingId: string, token: string, signal?: AbortSignal) =>
    parsePaintingCritiqueTask(await apiRequest<unknown>(`/api/v1/critic-tasks/${encodeURIComponent(critiqueId)}`, { token, signal }), paintingId, critiqueId),
  submitCritique: async (paintingId: string, token: string, signal?: AbortSignal) =>
    parsePaintingCritiqueTask(await apiRequest<unknown>(`/api/v1/paintings/${encodeURIComponent(paintingId)}/critic`, {
      method: "POST", body: JSON.stringify({ profile: "authoritative_four" }), token, signal,
    }), paintingId),
  workflowCapabilities: async (token: string, signal?: AbortSignal) =>
    parseWorkflowCapabilities(await apiRequest<unknown>("/api/v1/workflow/node-types", {
      token,
      signal,
    })),
  workflows: async (page: number, size: number, token: string, signal?: AbortSignal) =>
    parseWorkflowPage(await apiRequest<unknown>(
      `/api/v1/me/workflows?page=${page}&size=${size}`,
      { token, signal },
    )),
  workflow: async (workflowId: string, token: string, signal?: AbortSignal) =>
    parseWorkflowDetail(await apiRequest<unknown>(
      `/api/v1/me/workflows/${encodeURIComponent(workflowId)}`,
      { token, signal },
    )),
  createWorkflow: async (payload: WorkflowDefinitionInput, token: string, signal?: AbortSignal) =>
    parseWorkflowDetail(await apiRequest<unknown>("/api/v1/me/workflows", {
      method: "POST",
      body: JSON.stringify(payload),
      token,
      signal,
    })),
  replaceWorkflow: async (
    workflowId: string,
    payload: WorkflowDefinitionInput,
    token: string,
    signal?: AbortSignal,
  ) => parseWorkflowDetail(await apiRequest<unknown>(
    `/api/v1/me/workflows/${encodeURIComponent(workflowId)}`,
    { method: "PUT", body: JSON.stringify(payload), token, signal },
  )),
  uploadImage: async (
    file: File,
    semanticType: "IMAGE" | "PAINTING",
    token: string,
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.set("file", file);
    form.set("semanticType", semanticType);
    return parseMediaAsset(await apiRequest<unknown>("/api/v1/assets/uploads", {
      method: "POST",
      body: form,
      token,
      signal,
    }));
  },
  submitCreation: async (
    payload: CreationSubmission,
    token: string,
    signal?: AbortSignal,
  ) => parseCreationQueued(await apiRequest<unknown>("/api/v1/creations", {
    method: "POST",
    body: JSON.stringify(payload),
    token,
    signal,
  })),
  creations: async (page: number, size: number, token: string, signal?: AbortSignal) =>
    parseCreationResponse(
      "list",
      await apiRequest<unknown>(
        `/api/v1/me/creations?page=${page}&size=${size}`,
        { token, signal },
      ),
      parseCreationPage,
    ),
  creation: async (creationId: string, token: string, signal?: AbortSignal) =>
    parseCreationResponse(
      "detail",
      await apiRequest<unknown>(
        `/api/v1/creations/${encodeURIComponent(creationId)}`,
        { token, signal },
      ),
      parseCreationDetail,
    ),
  retryCreation: async (
    creationId: string,
    expectedRetryVersion: number,
    idempotencyKey: string,
    token: string,
    signal?: AbortSignal,
  ) => parseCreationRetry(await apiRequest<unknown>(
    `/api/v1/creations/${encodeURIComponent(creationId)}/retry`,
    {
      method: "POST",
      body: JSON.stringify({ expectedRetryVersion }),
      headers: { "Idempotency-Key": idempotencyKey },
      token,
      signal,
    },
  )),
  mediaBlob: apiMediaBlob,
  paintingStatistics: async (token: string, signal?: AbortSignal) =>
    parsePaintingStatistics(await apiRequest<unknown>("/api/v1/knowledge/painting-statistics", { token, signal })),
  poetryGraph: async (token: string, signal?: AbortSignal) =>
    parsePoetryGraph(await apiRequest<unknown>("/api/v1/knowledge/poetry-graph", { token, signal })),
};

export function errorMessage(error: unknown, fallback = "发生了未知错误，请稍后再试。"): string {
  return error instanceof ApiError || error instanceof CreationResponseContractError
    ? error.message
    : fallback;
}
