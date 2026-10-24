import type {
  CreationDetail,
  CreationPage,
  CreationPoem,
  CreationQueued,
  CreationRetry,
  CreationStep,
  CreationSummary,
  MediaAsset,
  WorkflowCapabilities,
  WorkflowDetail,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowLifecycleStatus,
  WorkflowModality,
  WorkflowOperation,
  WorkflowOperationCapability,
  WorkflowPage,
  WorkflowProviderCapability,
  WorkflowSummary,
} from "./types.ts";

const WORKFLOW_MODALITIES = new Set<WorkflowModality>([
  "TEXT_DESCRIPTION",
  "POEM",
  "IMAGE",
  "PAINTING",
  "AUDIO",
  "VIDEO",
]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 响应格式无效`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} 缺失`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Keep nullable contract fields strict: null is meaningful, but a malformed
 * non-string must not be silently treated as an absent value.
 */
function nullableRequiredString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function dateTime(value: unknown, label: string): string {
  if (typeof value === "string" && value) return value;
  if (
    !Array.isArray(value)
    || value.length < 5
    || value.length > 7
    || value.some((part) => typeof part !== "number" || !Number.isInteger(part))
  ) {
    throw new Error(`${label} 缺失`);
  }

  const [year, month, day, hour, minute, second = 0, nanosecond = 0] = value;
  if (
    year < 1
    || year > 9999
    || month < 1
    || month > 12
    || day < 1
    || day > 31
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
    || nanosecond < 0
    || nanosecond > 999_999_999
  ) {
    throw new Error(`${label} 无效`);
  }

  const checked = new Date(0);
  checked.setUTCFullYear(year, month - 1, day);
  checked.setUTCHours(hour, minute, second, Math.floor(nanosecond / 1_000_000));
  if (
    checked.getUTCFullYear() !== year
    || checked.getUTCMonth() !== month - 1
    || checked.getUTCDate() !== day
  ) {
    throw new Error(`${label} 无效`);
  }

  const pad = (part: number, width = 2) => String(part).padStart(width, "0");
  const milliseconds = Math.floor(nanosecond / 1_000_000);
  const fraction = milliseconds ? `.${pad(milliseconds, 3)}` : "";
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${fraction}`;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} 缺失`);
  return value;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Older Creation records predate the field, so an omitted/null value remains
 * readable.  A present music duration is an execution contract though: never
 * display a fractional or silently altered request as an accepted VMM value.
 */
function requestedMusicDuration(operation: string, value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (
    operation !== "PAINTING_TO_MUSIC"
    || typeof value !== "number"
    || !Number.isInteger(value)
    || value < 3
    || value > 30
  ) {
    throw new Error("设定音乐时长无效");
  }
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} 缺失`);
  return value;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function modality(value: unknown, label: string): WorkflowModality {
  if (typeof value !== "string" || !WORKFLOW_MODALITIES.has(value as WorkflowModality)) {
    throw new Error(`${label} 无法识别`);
  }
  return value as WorkflowModality;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function providerCapability(value: unknown): WorkflowProviderCapability {
  const source = record(value, "工作流提供方能力");
  return {
    code: string(source.code, "提供方代码"),
    displayName: string(source.displayName, "提供方名称"),
    definitionEnabled: nullableBoolean(source.definitionEnabled),
    executionAvailable: nullableBoolean(source.executionAvailable),
    parameterSchema: source.parameterSchema ?? null,
  };
}

function operationCapability(value: unknown): WorkflowOperationCapability {
  const source = record(value, "工作流操作能力");
  return {
    code: string(source.code, "操作代码"),
    displayName: string(source.displayName, "操作名称"),
    inputModality: string(source.inputModality, "输入模态"),
    outputModality: string(source.outputModality, "输出模态"),
    definitionEnabled: nullableBoolean(source.definitionEnabled),
    draftEnabled: nullableBoolean(source.draftEnabled) ?? nullableBoolean(source.definitionEnabled),
    executionAvailable: nullableBoolean(source.executionAvailable),
    terminalOutput: nullableBoolean(source.terminalOutput),
    availabilityReason: nullableString(source.availabilityReason),
    executionConstraint: nullableString(source.executionConstraint),
    providers: Array.isArray(source.providers) ? source.providers.map(providerCapability) : [],
  };
}

export function parseWorkflowCapabilities(value: unknown): WorkflowCapabilities {
  const source = record(value, "能力发现");
  return {
    workflowSchemaVersion: nullableNumber(source.workflowSchemaVersion),
    featureEnabled: nullableBoolean(source.featureEnabled),
    maxVisibleCards: nullableNumber(source.maxVisibleCards) ?? 3,
    maxTransformSteps: nullableNumber(source.maxTransformSteps) ?? 2,
    maxExecutionTransformSteps: nullableNumber(source.maxExecutionTransformSteps) ?? 2,
    sourceModalities: strings(source.sourceModalities),
    operations: Array.isArray(source.operations) ? source.operations.map(operationCapability) : [],
  };
}

function workflowStatus(value: unknown): WorkflowLifecycleStatus {
  return value === "DRAFT" || value === "ACTIVE" ? value : "ACTIVE";
}

function graphNode(value: unknown): WorkflowGraphNode {
  const source = record(value, "工作流节点");
  const kind = string(source.kind, "节点类型");
  if (kind !== "SOURCE" && kind !== "TRANSFORM") throw new Error("工作流节点类型无效");
  const outputModality = modality(source.outputModality, "节点输出模态");
  const node: WorkflowGraphNode = {
    id: string(source.id, "节点标识"),
    kind,
    outputModality,
  };
  if (kind === "TRANSFORM") {
    node.operation = string(source.operation, "节点操作") as WorkflowOperation;
    node.providerCode = string(source.providerCode, "节点提供方");
    node.inputModality = modality(source.inputModality, "节点输入模态");
    node.parameters = source.parameters && typeof source.parameters === "object" && !Array.isArray(source.parameters)
      ? source.parameters as Record<string, unknown>
      : {};
  }
  return node;
}

function graphEdge(value: unknown): WorkflowGraphEdge {
  const source = record(value, "工作流连线");
  return { from: string(source.from, "连线来源"), to: string(source.to, "连线目标") };
}

function workflowGraph(value: unknown): WorkflowGraph {
  const source = record(value, "工作流图");
  if (!Array.isArray(source.nodes) || !Array.isArray(source.edges)) throw new Error("工作流图结构无效");
  return {
    schemaVersion: number(source.schemaVersion, "工作流图版本"),
    nodes: source.nodes.map(graphNode),
    edges: source.edges.map(graphEdge),
  };
}

function workflowSummary(value: unknown): WorkflowSummary {
  const source = record(value, "工作流");
  return {
    workflowId: string(source.workflowId, "工作流标识"),
    name: string(source.name, "工作流名称"),
    description: nullableString(source.description),
    schemaVersion: number(source.schemaVersion, "工作流版本"),
    sourceModality: modality(source.sourceModality, "工作流输入模态"),
    terminalModality: modality(source.terminalModality, "工作流输出模态"),
    nodeCount: number(source.nodeCount, "工作流节点数"),
    status: workflowStatus(source.status),
    conversionRequired: nullableBoolean(source.conversionRequired) ?? false,
    updatedAt: string(source.updatedAt, "工作流更新时间"),
    createdAt: string(source.createdAt, "工作流创建时间"),
  };
}

export function parseWorkflowPage(value: unknown): WorkflowPage {
  const source = record(value, "工作流列表");
  if (!Array.isArray(source.items)) throw new Error("工作流列表项目缺失");
  return {
    items: source.items.map(workflowSummary),
    page: number(source.page, "工作流页码"),
    size: number(source.size, "工作流分页大小"),
    totalElements: number(source.totalElements, "工作流总数"),
    totalPages: number(source.totalPages, "工作流总页数"),
    first: boolean(source.first, "工作流首页标记"),
    last: boolean(source.last, "工作流末页标记"),
    hasNext: boolean(source.hasNext, "工作流后续页标记"),
  };
}

export function parseWorkflowDetail(value: unknown): WorkflowDetail {
  const source = record(value, "工作流详情");
  return {
    ...workflowSummary(source),
    graph: workflowGraph(source.graph),
    edgeCount: number(source.edgeCount, "工作流边数"),
    operationSequence: strings(source.operationSequence),
  };
}

export function parseMediaAsset(value: unknown): MediaAsset {
  const source = record(value, "媒体资源");
  return {
    assetId: string(source.assetId, "资源标识"),
    originalFilename: nullableString(source.originalFilename),
    mimeType: string(source.mimeType, "媒体类型"),
    fileSize: nullableNumber(source.fileSize),
    width: nullableNumber(source.width),
    height: nullableNumber(source.height),
    durationSeconds: nullableNumber(source.durationSeconds),
    assetType: string(source.assetType, "资源类型"),
    semanticType: string(source.semanticType, "资源语义"),
    sourceType: string(source.sourceType, "资源来源"),
    visibility: string(source.visibility, "资源可见性"),
    status: string(source.status, "资源状态"),
    contentUrl: string(source.contentUrl, "资源内容地址"),
    downloadUrl: string(source.downloadUrl, "资源下载地址"),
    createdAt: dateTime(source.createdAt, "资源创建时间"),
    updatedAt: dateTime(source.updatedAt, "资源更新时间"),
  };
}

function creationBase(value: unknown): CreationSummary {
  const source = record(value, "创作");
  return {
    creationId: string(source.creationId, "创作标识"),
    workflowId: nullableString(source.workflowId),
    workflowName: nullableString(source.workflowName),
    status: string(source.status, "创作状态"),
    errorCode: nullableString(source.errorCode),
    errorMessage: nullableString(source.errorMessage),
    recoveryState: string(source.recoveryState, "恢复状态"),
    sourceModality: string(source.sourceModality, "创作输入模态"),
    sourcePaintingId: nullableString(source.sourcePaintingId),
    sourceAssetId: nullableString(source.sourceAssetId),
    finalModality: nullableString(source.finalModality),
    finalAssetId: nullableString(source.finalAssetId),
    finalAssetContentUrl: nullableString(source.finalAssetContentUrl),
    finalAssetDownloadUrl: nullableString(source.finalAssetDownloadUrl),
    createdAt: string(source.createdAt, "创作创建时间"),
    updatedAt: string(source.updatedAt, "创作更新时间"),
    startedAt: nullableString(source.startedAt),
    finishedAt: nullableString(source.finishedAt),
    retryVersion: number(source.retryVersion, "重试版本"),
    retryAvailable: boolean(source.retryAvailable, "重试可用标记"),
    retryBlockedReason: nullableString(source.retryBlockedReason),
    executionAttemptCount: number(source.executionAttemptCount, "执行次数"),
  };
}

function creationStep(value: unknown): CreationStep {
  const source = record(value, "创作步骤");
  const operation = string(source.operation, "步骤操作");
  return {
    stepId: string(source.stepId, "步骤标识"),
    stepIndex: number(source.stepIndex, "步骤序号"),
    nodeId: string(source.nodeId, "节点标识"),
    operation,
    inputModality: string(source.inputModality, "步骤输入模态"),
    outputModality: string(source.outputModality, "步骤输出模态"),
    status: string(source.status, "步骤状态"),
    attemptCount: number(source.attemptCount, "步骤执行次数"),
    errorCode: nullableString(source.errorCode),
    errorMessage: nullableString(source.errorMessage),
    outputAssetId: nullableString(source.outputAssetId),
    outputAssetContentUrl: nullableString(source.outputAssetContentUrl),
    outputAssetDownloadUrl: nullableString(source.outputAssetDownloadUrl),
    outputText: nullableString(source.outputText),
    outputPoem: creationPoem(source.outputPoem),
    requestedDurationSeconds: requestedMusicDuration(operation, source.requestedDurationSeconds),
    startedAt: nullableString(source.startedAt),
    finishedAt: nullableString(source.finishedAt),
  };
}

function creationPoem(value: unknown): CreationPoem | null {
  if (value === null || value === undefined) return null;
  const source = record(value, "诗歌结果");
  return {
    schemaVersion: string(source.schemaVersion, "诗歌版本"),
    title: nullableRequiredString(source.title, "诗歌标题"),
    lines: strings(source.lines),
    text: string(source.text, "诗歌正文"),
  };
}

export function parseCreationQueued(value: unknown): CreationQueued {
  const source = record(value, "创作提交");
  return {
    creationId: string(source.creationId, "创作标识"),
    status: string(source.status, "创作状态"),
  };
}

export function parseCreationPage(value: unknown): CreationPage {
  const source = record(value, "创作列表");
  if (!Array.isArray(source.items)) throw new Error("创作列表项目缺失");
  return {
    items: source.items.map(creationBase),
    page: number(source.page, "创作页码"),
    size: number(source.size, "创作分页大小"),
    totalElements: number(source.totalElements, "创作总数"),
    totalPages: number(source.totalPages, "创作总页数"),
    first: boolean(source.first, "创作首页标记"),
    last: boolean(source.last, "创作末页标记"),
    hasNext: boolean(source.hasNext, "创作后续页标记"),
  };
}

export function parseCreationDetail(value: unknown): CreationDetail {
  const source = record(value, "创作详情");
  if (!Array.isArray(source.steps)) throw new Error("创作步骤缺失");
  return {
    ...creationBase(source),
    sourcePaintingTitle: nullableString(source.sourcePaintingTitle),
    sourcePaintingContentUrl: nullableString(source.sourcePaintingContentUrl),
    sourceText: nullableString(source.sourceText),
    sourceAssetContentUrl: nullableString(source.sourceAssetContentUrl),
    sourceAssetDownloadUrl: nullableString(source.sourceAssetDownloadUrl),
    finalText: nullableString(source.finalText),
    finalPoem: creationPoem(source.finalPoem),
    steps: source.steps.map(creationStep),
  };
}

export function parseCreationRetry(value: unknown): CreationRetry {
  const source = record(value, "创作重试");
  return {
    creationId: string(source.creationId, "创作标识"),
    status: string(source.status, "创作状态"),
    retryVersion: number(source.retryVersion, "重试版本"),
    executionAttemptNumber: number(source.executionAttemptNumber, "执行轮次"),
    acceptedAt: string(source.acceptedAt, "重试受理时间"),
    idempotentReplay: boolean(source.idempotentReplay, "幂等回放标记"),
  };
}

export type AvailabilityAssessment = { available: boolean; reason: string };

export function paintingToMusicAvailability(
  capabilities: WorkflowCapabilities | null | undefined,
): AvailabilityAssessment {
  if (capabilities?.featureEnabled !== true) {
    return { available: false, reason: "后端创作能力未启用或状态未知" };
  }
  const operation = capabilities.operations.find((item) => item.code === "PAINTING_TO_MUSIC");
  if (!operation || operation.executionAvailable !== true) {
    return {
      available: false,
      reason: operation?.availabilityReason || "绘画转音乐能力未报告为可用",
    };
  }
  return { available: true, reason: "后端已报告可执行" };
}

export function workflowAvailability(
  capabilities: WorkflowCapabilities | null | undefined,
  workflow: WorkflowDetail | null | undefined,
): AvailabilityAssessment {
  if (!workflow) return { available: false, reason: "正在读取工作流详情" };
  if (workflow.conversionRequired) {
    return { available: false, reason: "历史工作流需要按当前顺序规则保存后才能执行" };
  }
  if (workflow.status !== "ACTIVE") {
    return { available: false, reason: "工作流草稿不能提交创作" };
  }
  if (capabilities?.featureEnabled !== true) {
    return { available: false, reason: "后端创作能力未启用或状态未知" };
  }
  if (workflow.operationSequence.length === 0) {
    return { available: false, reason: "工作流没有可验证的操作序列" };
  }
  if (workflow.operationSequence.length > (capabilities?.maxExecutionTransformSteps ?? 2)) {
    const limit = capabilities?.maxExecutionTransformSteps ?? 2;
    return {
      available: false,
      reason: `当前运行环境最多支持 ${limit} 个转换步骤；此流程仍可保存为草稿。`,
    };
  }
  // PAINTING_TO_MUSIC is structurally legal after a generated painting so it
  // can remain a reusable draft. Execution admits only a direct catalog or
  // owned uploaded painting, in a single transform. Apply that product
  // boundary to restored ACTIVE workflows too, not only to unsaved editor UI.
  if (workflow.operationSequence.includes("PAINTING_TO_MUSIC")
      && (workflow.operationSequence.length !== 1 || workflow.sourceModality !== "PAINTING")) {
    return {
      available: false,
      reason: "音乐创作仅支持一幅画廊国画或本人上传国画直接生成音乐；组合音乐流程仍可保存为草稿。",
    };
  }
  for (const code of workflow.operationSequence) {
    if (code === "PAINTING_TO_VIDEO") {
      return { available: false, reason: "绘画转视频暂未开放" };
    }
    const operation = capabilities.operations.find((item) => item.code === code);
    if (!operation || operation.definitionEnabled !== true || operation.executionAvailable !== true) {
      return {
        available: false,
        reason: operation?.availabilityReason || `${code} 未报告为可执行`,
      };
    }
    if (code === "PAINTING_TO_MUSIC" && !paintingToMusicAvailability(capabilities).available) {
      return paintingToMusicAvailability(capabilities);
    }
  }
  return { available: true, reason: "后端已报告工作流可执行" };
}

export type StudioSubmitStateInput = {
  capabilities: WorkflowCapabilities | null;
  workflow: WorkflowDetail | null;
  text: string;
  paintingId: string;
  file: File | null;
  busy: boolean;
  uncertain: boolean;
  /** The editor intentionally differs from the persisted workflow used by Creation. */
  workflowDirty?: boolean;
};

export function studioSubmitState(input: StudioSubmitStateInput): AvailabilityAssessment {
  if (input.busy) return { available: false, reason: "请求正在处理中" };
  if (input.uncertain) return { available: false, reason: "上次提交结果不确定，请先刷新我的作品核对" };
  if (input.workflowDirty) {
    return { available: false, reason: "工作流编辑内容尚未保存；请先保存后再提交创作" };
  }
  const availability = workflowAvailability(input.capabilities, input.workflow);
  if (!availability.available) return availability;
  switch (input.workflow?.sourceModality) {
    case "TEXT_DESCRIPTION":
    case "POEM":
      return input.text.trim()
        ? availability
        : { available: false, reason: "请输入创作文本" };
    case "IMAGE":
      return input.file
        ? availability
        : { available: false, reason: "请选择 JPEG 或 PNG 图片" };
    case "PAINTING":
      return input.paintingId.trim()
        ? availability
        : { available: false, reason: "请输入画作 UUID" };
    default:
      return { available: false, reason: "当前输入模态暂未接入" };
  }
}

export class SingleFlightGuard {
  private active = false;

  enter(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  leave(): void {
    this.active = false;
  }
}

export function creationRetryAvailable(
  creation: Pick<CreationSummary, "status" | "retryAvailable"> | null | undefined,
): boolean {
  return creation?.retryAvailable === true
    && (creation.status === "FAILED" || creation.status === "PARTIAL_SUCCESS");
}
