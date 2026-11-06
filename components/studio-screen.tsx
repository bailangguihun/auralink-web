"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { CreationRunHistory, CreationStepOutput } from "@/components/creation-run-history";
import { CreationGridSkeleton, LoadingSection, LoadingStatus, PendingIndicator, SkeletonRows } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { useSession } from "@/components/session-provider";
import { WorkflowDesigner } from "@/components/workflow-designer";
import { StudioExecutionDialog } from "@/components/studio-execution-dialog";
import { api, ApiError, errorMessage, isAbortError } from "@/lib/api";
import { classifyCreationStatus, pollCreation, type PollOutcome } from "@/lib/creation-polling";
import { resolveMediaUrl } from "@/lib/media";
import { creationAdmissionRejected, executionStep, mergeCreationObservation, submissionGateFor, type AcknowledgedExecution } from "@/lib/studio-execution-context";
import { SingleFlightGuard } from "@/lib/studio-contracts";
import {
  editorCanActivate,
  editorFromWorkflow,
  emptyWorkflowEditor,
  musicDurationForEditor,
  setEditorMusicDuration,
  workflowDefinitionFromEditor,
  type WorkflowEditorState,
} from "@/lib/workflow-editor";
import type {
  CreationDetail,
  CreationPage,
  CreationSource,
  MediaAsset,
  PaintingPage,
  PaintingSummary,
  WorkflowCapabilities,
  WorkflowDetail,
  WorkflowOperationCapability,
  WorkflowPage,
} from "@/lib/types";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CREATION_PAGE_SIZE = 12;

type PollUiState = "idle" | "polling" | "timeout" | "unknown" | "error";
type ActionPhase = "idle" | "savingWorkflow" | "uploading" | "submitting";
type PaintingInput =
  | { kind: "catalog"; painting: PaintingSummary }
  | { kind: "upload"; file: File }
  | null;

const statusLabels: Record<string, string> = {
  QUEUED: "已排队",
  RUNNING: "创作中",
  SUCCEEDED: "已完成",
  PARTIAL_SUCCESS: "部分完成",
  FAILED: "未完成",
};

const modalityLabels: Record<string, string> = {
  TEXT_DESCRIPTION: "文字描述",
  POEM: "古诗输入",
  IMAGE: "图像输入",
  PAINTING: "国画输入",
  AUDIO: "音乐",
  VIDEO: "视频",
};

function displayTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function useFilePreview(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const preview = URL.createObjectURL(file);
    setUrl(preview);
    return () => URL.revokeObjectURL(preview);
  }, [file]);
  return url;
}

function userFacingAvailability(
  editor: WorkflowEditorState,
  capabilities: WorkflowCapabilities | null,
  sourceIssue: string | null,
  painting: PaintingInput,
): string | null {
  if (!editor.sourceModality) return "请先选择一种输入。";
  if (sourceIssue) return sourceIssue;
  if (editor.operations.length === 0) return "请至少添加一个创作步骤。";
  if (!editorCanActivate(editor)) {
    return editor.operations.some((operation) => operation.code === "PAINTING_TO_VIDEO")
      ? "视频节点暂未开放，请调整创作步骤。"
      : "当前流程还不能执行。";
  }
  if (editor.operations.length > (capabilities?.maxExecutionTransformSteps ?? 2)) {
    return "当前运行环境最多支持两个转换步骤，请调整创作步骤。";
  }
  if (capabilities?.featureEnabled !== true) return "创作服务当前未开放，可以先编辑流程。";
  if (editor.operations.some((operation) => operation.code === "PAINTING_TO_MUSIC")) {
    if (editor.operations.length !== 1 || editor.sourceModality !== "PAINTING") {
      return "音乐创作仅支持一幅画廊国画或本人上传国画直接生成音乐，请调整创作步骤。";
    }
    if (painting?.kind === "upload" && capabilities.operations.find((item) => item.code === "PAINTING_TO_MUSIC")?.executionConstraint
        !== "CATALOG_OR_OWNED_UPLOAD_PAINTING_SINGLE_TRANSFORM_ONLY") {
      return "当前音乐服务尚不支持上传国画，请从画廊选择。";
    }
  }
  if (editor.operations.some((operation) => operation.executionAvailable !== true)) {
    return "当前流程所需的创作服务暂未开放。";
  }
  return null;
}

function sourceIssueFor(
  editor: WorkflowEditorState,
  text: string,
  imageFile: File | null,
  painting: PaintingInput,
): string | null {
  switch (editor.sourceModality) {
    case "TEXT_DESCRIPTION":
      return text.trim() ? null : "请填写文字描述。";
    case "POEM":
      return text.trim() ? null : "请填写古诗内容。";
    case "IMAGE":
      return uploadIssue(imageFile, "图像");
    case "PAINTING":
      return painting?.kind === "catalog" ? null : uploadIssue(painting?.file ?? null, "国画");
    default:
      return "请先选择一种输入。";
  }
}

function uploadIssue(file: File | null, label: string): string | null {
  if (!file) return `请选择一${label === "国画" ? "幅" : "张"}${label}。`;
  if (!file.size) return "所选文件为空，请重新选择。";
  if (file.size > MAX_UPLOAD_BYTES) return `${label}图片超过允许的 10 MiB 上限。`;
  if (!["image/jpeg", "image/png"].includes(file.type)) return "请选择 JPEG 或 PNG 图片。";
  return null;
}

export function StudioScreen() {
  const { sessionIdentity } = useSession();
  return <StudioWorkspace key={sessionIdentity.generation} />;
}

function StudioWorkspace() {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const submissionGate = useMemo(() => submissionGateFor(sessionIdentity), [sessionIdentity]);
  const submissionStatus = useSyncExternalStore(submissionGate.subscribe, submissionGate.snapshot, submissionGate.snapshot);
  const submissionUncertain = submissionStatus === "uncertain";
  const mounted = useRef(true);
  const editorEpoch = useRef(0);
  const [currentExecution, setCurrentExecution] = useState<AcknowledgedExecution | null>(null);
  const executionRef = useRef<AcknowledgedExecution | null>(null);
  // Shared ordering for the independent current/history read channels; login
  // changes and unmount discard this private, in-memory observation cache.
  const creationObservations = useRef(new Map<string, CreationDetail>());
  const observeCreation = useCallback((detail: CreationDetail) => {
    const observed = mergeCreationObservation(creationObservations.current.get(detail.creationId), detail);
    creationObservations.current.set(detail.creationId, observed);
    return observed;
  }, []);
  const [workflowLoadState, setWorkflowLoadState] = useState<"ready" | "loading" | "error">("ready");
  const [workflowListError, setWorkflowListError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<WorkflowCapabilities | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowPage | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetail | null>(null);
  const [workflowEditor, setWorkflowEditor] = useState<WorkflowEditorState>(emptyWorkflowEditor);
  const [workflowDirty, setWorkflowDirty] = useState(false);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(null);
  const [workflowSaveUncertain, setWorkflowSaveUncertain] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  const [creationPage, setCreationPage] = useState<CreationPage | null>(null);
  const [creationPageNumber, setCreationPageNumber] = useState(0);
  const [selectedCreation, setSelectedCreation] = useState<CreationDetail | null>(null);
  const [textSource, setTextSource] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [paintingInput, setPaintingInput] = useState<PaintingInput>(null);
  const [uploadedImage, setUploadedImage] = useState<{ file: File; asset: MediaAsset } | null>(null);
  const [uploadedPainting, setUploadedPainting] = useState<{ file: File; asset: MediaAsset } | null>(null);
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [galleryChoices, setGalleryChoices] = useState<PaintingPage | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  const [discoveryAttempt, setDiscoveryAttempt] = useState(0);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [loadingCreations, setLoadingCreations] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionPhase, setActionPhase] = useState<ActionPhase>("idle");
  const [pollState, setPollState] = useState<PollUiState>("idle");
  const [historyPollState, setHistoryPollState] = useState<PollUiState>("idle");
  const [creationReadStale, setCreationReadStale] = useState(false);

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const paintingUploadRef = useRef<HTMLInputElement | null>(null);
  const discoveryController = useRef<AbortController | null>(null);
  const workflowController = useRef<AbortController | null>(null);
  const workflowSaveController = useRef<AbortController | null>(null);
  const creationsController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const pollController = useRef<AbortController | null>(null);
  const historyPollController = useRef<AbortController | null>(null);
  const workflowListController = useRef<AbortController | null>(null);
  const galleryController = useRef<AbortController | null>(null);
  const hasCreationSnapshot = useRef(false);
  const workflowSaveGuard = useRef(new SingleFlightGuard());
  const imagePreview = useFilePreview(imageFile);
  const paintingPreview = useFilePreview(paintingInput?.kind === "upload" ? paintingInput.file : null);

  const sessionCurrent = useCallback(() => mounted.current && isCurrentSession(sessionIdentity), [isCurrentSession, sessionIdentity]);

  const handleSessionError = useCallback((caught: unknown): boolean => {
    if (caught instanceof ApiError && caught.kind === "unauthorized") {
      signOutIfCurrent(sessionIdentity);
      return true;
    }
    return false;
  }, [sessionIdentity, signOutIfCurrent]);

  const stopPolling = useCallback(() => {
    pollController.current?.abort();
    pollController.current = null;
    historyPollController.current?.abort();
    historyPollController.current = null;
    setPollState("idle");
    setHistoryPollState("idle");
  }, []);

  const abortForInputChange = useCallback(() => {
    editorEpoch.current += 1;
    executionRef.current = null;
    setCurrentExecution(null);
    actionController.current?.abort();
    actionController.current = null;
    workflowSaveController.current?.abort();
    detailController.current?.abort();
    detailController.current = null;
    setDetailLoading(false);
    galleryController.current?.abort();
    galleryController.current = null;
    setGalleryLoading(false);
    stopPolling();
    setActionError(null);
  }, [stopPolling]);

  const resetSourceInputs = useCallback(() => {
    setTextSource("");
    setImageFile(null);
    setPaintingInput(null);
    setUploadedImage(null);
    setUploadedPainting(null);
    setShowGalleryPicker(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
    mounted.current = false;
    discoveryController.current?.abort();
    workflowController.current?.abort();
    workflowSaveController.current?.abort();
    creationsController.current?.abort();
    detailController.current?.abort();
    actionController.current?.abort();
    pollController.current?.abort();
    historyPollController.current?.abort();
    workflowListController.current?.abort();
    galleryController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!token) {
      discoveryController.current?.abort();
      workflowController.current?.abort();
      workflowSaveController.current?.abort();
      creationsController.current?.abort();
      detailController.current?.abort();
      actionController.current?.abort();
      stopPolling();
      return;
    }
    const controller = new AbortController();
    discoveryController.current?.abort();
    discoveryController.current = controller;
    setLoadingDiscovery(true);
    setCapabilities(null);
    setDiscoveryError(null);
    void api.workflowCapabilities(token, controller.signal).then(capabilityResult => {
      if (controller.signal.aborted || !sessionCurrent()) return;
      setCapabilities(capabilityResult);
    }).catch((caught) => {
      if (isAbortError(caught) || controller.signal.aborted || !sessionCurrent()) return;
      handleSessionError(caught);
      setDiscoveryError(errorMessage(caught));
    }).finally(() => {
      if (!controller.signal.aborted && sessionCurrent()) setLoadingDiscovery(false);
    });
    return () => controller.abort();
  }, [discoveryAttempt, handleSessionError, sessionCurrent, stopPolling, token]);

  const refreshCreations = useCallback(async () => {
    if (!token) return;
    const controller = new AbortController();
    creationsController.current?.abort();
    creationsController.current = controller;
    setLoadingCreations(true);
    setCreationError(null);
    try {
      const result = await api.creations(creationPageNumber, CREATION_PAGE_SIZE, token, controller.signal);
      if (!controller.signal.aborted && sessionCurrent() && creationsController.current === controller) {
        hasCreationSnapshot.current = true;
        setCreationPage(result);
        setCreationReadStale(false);
      }
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted || !sessionCurrent()) return;
      handleSessionError(caught);
      setCreationError(errorMessage(caught, "暂时无法读取我的作品。请稍后重试。"));
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) {
        setCreationPage(null); setSelectedCreation(null); hasCreationSnapshot.current = false;
      }
      setCreationReadStale(hasCreationSnapshot.current);
    } finally {
      if (!controller.signal.aborted && sessionCurrent() && creationsController.current === controller) setLoadingCreations(false);
    }
  }, [creationPageNumber, handleSessionError, sessionCurrent, token]);

  useEffect(() => {
    void refreshCreations();
    return () => creationsController.current?.abort();
  }, [refreshCreations]);

  const updateCreationCard = useCallback((detail: CreationDetail) => {
    setCreationPage((current) => current ? {
      ...current, items: current.items.map((item) => item.creationId === detail.creationId ? detail : item),
    } : current);
  }, []);

  const startPolling = useCallback((creationId: string, target: "current" | "history", epoch: number) => {
    if (!token) return;
    const slot = target === "current" ? pollController : historyPollController;
    slot.current?.abort();
    const controller = new AbortController();
    slot.current = controller;
    const valid = () => sessionCurrent() && !controller.signal.aborted
      && slot.current === controller && editorEpoch.current === epoch;
    const setTargetState = target === "current" ? setPollState : setHistoryPollState;
    setTargetState("polling");
    void pollCreation({
      signal: controller.signal,
      getDetail: async (signal) => {
        const response = await api.creation(creationId, token, signal);
        // Poll termination must use the same reconciled attempt/status as the
        // UI; an older retry's terminal response must not stop a newer run.
        return valid() && !signal.aborted && response.creationId === creationId
          ? observeCreation(response) : response;
      },
      onUpdate: (response) => {
        if (!valid() || response.creationId !== creationId) return;
        const detail = observeCreation(response);
        // Refresh an existing ACK association only; browsing history cannot
        // create a current execution association from workflow/node IDs.
        const current = executionRef.current;
        if (current?.creationId === creationId && current.epoch === epoch) {
          const updated = { ...current, detail };
          executionRef.current = updated;
          setCurrentExecution(updated);
        }
        if (target === "history") {
          setSelectedCreation((current) => current?.creationId === creationId ? detail : current);
        }
        updateCreationCard(detail);
      },
    }).then((outcome: PollOutcome) => {
      if (!valid() || outcome.kind === "aborted") return;
      slot.current = null;
      setTargetState(outcome.kind === "terminal" ? "idle" : outcome.kind);
      if (outcome.kind === "terminal") { void refreshCreations(); return; }
      const message = outcome.kind === "error"
        ? errorMessage(outcome.error, "暂时无法读取创作状态。请重新读取详情。")
        : outcome.kind === "timeout" ? "状态等待已结束；后台创作不会因此取消，请稍后读取详情。"
          : "作品状态暂时无法识别，已停止自动刷新。";
      if (outcome.kind === "error") handleSessionError(outcome.error);
      setDetailError(message);
    });
  }, [handleSessionError, observeCreation, refreshCreations, sessionCurrent, token, updateCreationCard]);

  const openCreation = useCallback(async (creationId: string) => {
    if (!token) return;
    historyPollController.current?.abort();
    setHistoryPollState("idle");
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    const epoch = editorEpoch.current;
    const valid = () => sessionCurrent() && !controller.signal.aborted
      && detailController.current === controller && editorEpoch.current === epoch;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await api.creation(creationId, token, controller.signal);
      if (!valid() || response.creationId !== creationId) return;
      const detail = observeCreation(response);
      const current = executionRef.current;
      if (current?.creationId === creationId && current.epoch === epoch) {
        const updated = { ...current, detail };
        executionRef.current = updated;
        setCurrentExecution(updated);
        if (["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(detail.status)) {
          pollController.current?.abort();
          pollController.current = null;
          setPollState("idle");
        }
      }
      setSelectedCreation(detail);
      if (classifyCreationStatus(detail.status) === "active") startPolling(creationId, "history", epoch);
    } catch (caught) {
      if (!valid()) return;
      handleSessionError(caught);
      setDetailError(errorMessage(caught, "暂时无法读取创作详情；保留上次已读取的历史记录。"));
    } finally {
      if (valid()) setDetailLoading(false);
    }
  }, [handleSessionError, observeCreation, sessionCurrent, startPolling, token]);

  const refreshWorkflowList = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    workflowListController.current?.abort();
    const controller = new AbortController();
    workflowListController.current = controller;
    setLoadingWorkflows(true);
    const valid = () => sessionCurrent() && !controller.signal.aborted && workflowListController.current === controller;
    try {
      const result = await api.workflows(0, 100, token, controller.signal);
      if (!valid()) return false;
      setWorkflows(result);
      setWorkflowListError(null);
      // A list response (even empty) cannot resolve a lost save acknowledgement.
      return true;
    } catch (caught) {
      if (valid()) {
        handleSessionError(caught);
        if (caught instanceof ApiError && [401, 403].includes(caught.status)) setWorkflows(null);
        setWorkflowListError(errorMessage(caught, "流程列表暂时无法刷新。"));
      }
      return false;
    } finally {
      if (valid()) setLoadingWorkflows(false);
    }
  }, [handleSessionError, sessionCurrent, token]);

  const updateEditor = useCallback((next: WorkflowEditorState) => {
    abortForInputChange();
    if (next.sourceModality !== workflowEditor.sourceModality) resetSourceInputs();
    setWorkflowEditor(next);
    setWorkflowDirty(true);
    setWorkflowSaveError(null);
  }, [abortForInputChange, resetSourceInputs, workflowEditor.sourceModality]);

  const newWorkflow = useCallback(() => {
    abortForInputChange();
    workflowController.current?.abort();
    setSelectedWorkflowId("");
    setSelectedWorkflow(null);
    setWorkflowEditor(emptyWorkflowEditor());
    resetSourceInputs();
    setLoadingWorkflows(false);
    // Clearing edits must not discard an unresolved save or submission. Only an
    // explicit read of a chosen workflow can resolve a missing save response.
    if (!workflowSaveUncertain) {
      setWorkflowLoadState("ready");
      setWorkflowSaveError(null);
    }
    setWorkflowDirty(false);
    setShowNamePrompt(false);
  }, [abortForInputChange, resetSourceInputs, workflowSaveUncertain]);

  const recoverWorkflow = useCallback(async (workflowId: string) => {
    if (!token || !workflowSaveUncertain) return;
    abortForInputChange();
    workflowController.current?.abort();
    const controller = new AbortController();
    workflowController.current = controller;
    const epoch = editorEpoch.current;
    const valid = () => sessionCurrent() && !controller.signal.aborted
      && workflowController.current === controller && editorEpoch.current === epoch;
    setWorkflowLoadState("loading");
    setLoadingWorkflows(true);
    setWorkflowSaveError(null);
    setShowNamePrompt(false);
    try {
      const result = await api.workflow(workflowId, token, controller.signal);
      if (!valid()) return;
      if (result.workflowId !== workflowId) throw new Error("返回的流程身份不匹配，请重新核对。");
      const restored = editorFromWorkflow(result, capabilities);
      if (!restored) throw new Error("此流程定义不能读取，请重新选择流程。");
      setSelectedWorkflow(result);
      setSelectedWorkflowId(result.workflowId);
      // Recovery explicitly selects a stored definition, but it is not a new
      // submission and need not discard a compatible local text/file input.
      if (restored.sourceModality !== workflowEditor.sourceModality) resetSourceInputs();
      setWorkflowEditor(restored);
      setWorkflowDirty(false);
      setWorkflowSaveUncertain(false);
      setWorkflowLoadState("ready");
      setWorkflowSaveError(result.conversionRequired ? "这个流程含有不兼容节点，请调整后再执行。" : null);
      setWorkflows(null);
      setWorkflowListError(null);
    } catch (caught) {
      if (!valid()) return;
      handleSessionError(caught);
      setWorkflowLoadState("error");
      setWorkflowSaveError(`暂时无法核对流程，请稍后重新读取。${errorMessage(caught)}`);
    } finally {
      if (valid()) setLoadingWorkflows(false);
    }
  }, [abortForInputChange, capabilities, handleSessionError, resetSourceInputs, sessionCurrent, token, workflowEditor.sourceModality, workflowSaveUncertain]);

  const saveExecutionWorkflow = useCallback(async (name: string): Promise<WorkflowDetail | null> => {
    if (!token || workflowLoadState !== "ready" || workflowSaveUncertain
        || (selectedWorkflowId && !selectedWorkflow) || !workflowSaveGuard.current.enter()) return null;
    const controller = new AbortController();
    workflowSaveController.current?.abort();
    workflowSaveController.current = controller;
    const epoch = editorEpoch.current;
    const valid = () => sessionCurrent() && !controller.signal.aborted
      && workflowSaveController.current === controller && editorEpoch.current === epoch;
    setWorkflowSaveError(null);
    let requestStarted = false;
    let acknowledged = false;
    try {
      const payload = workflowDefinitionFromEditor(workflowEditor, capabilities, name, "", "ACTIVE");
      setActionPhase("savingWorkflow");
      requestStarted = true;
      const saved = selectedWorkflow
        ? await api.replaceWorkflow(selectedWorkflow.workflowId, payload, token, controller.signal)
        : await api.createWorkflow(payload, token, controller.signal);
      acknowledged = true;
      if (!valid()) return null;
      setSelectedWorkflow(saved);
      setSelectedWorkflowId(saved.workflowId);
      setWorkflowSaveUncertain(false);
      setWorkflowDirty(false);
      // The acknowledged definition is enough to submit. A separate workflow
      // list refresh is neither required nor proof of a lost acknowledgement.
      return saved;
    } catch (caught) {
      if (!valid()) return null;
      // These validation codes are returned before Core persists a workflow.
      const rejected = caught instanceof ApiError && ([400, 401, 403, 404].includes(caught.status)
        || (caught.status === 422 && ["WORKFLOW_INVALID", "WORKFLOW_SCHEMA_UNSUPPORTED", "WORKFLOW_GRAPH_TOO_LARGE"].includes(caught.code ?? "")));
      if (requestStarted && !acknowledged && !rejected) {
        setWorkflowSaveUncertain(true);
        setWorkflows(null);
        setWorkflowListError(null);
        setWorkflowSaveError("流程准备结果未确认，尚未提交创作。请核对已保存的流程后继续，暂不重复提交。");
      } else {
        handleSessionError(caught);
        setWorkflowSaveError(errorMessage(caught));
      }
      return null;
    } finally {
      if (workflowSaveController.current === controller) {
        workflowSaveController.current = null;
      }
      workflowSaveGuard.current.leave();
    }
  }, [capabilities, handleSessionError, selectedWorkflow, selectedWorkflowId, sessionCurrent, token, workflowEditor, workflowLoadState, workflowSaveUncertain]);

  const sourceIssue = sourceIssueFor(workflowEditor, textSource, imageFile, paintingInput);
  const executionDisabledReason = submissionStatus !== "idle"
    ? submissionUncertain ? "上次创作提交结果未确认，本登录会话暂不能再次提交。" : "创作提交正在处理中。"
    : currentExecution && (!currentExecution.detail || !["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(currentExecution.detail.status))
      ? "本次提交已确认，执行终态尚未确认；不会重复提交同一轮。更改输入或流程可准备下一轮。"
    : workflowLoadState !== "ready" ? "流程尚未核对完成，请使用下方核对入口。"
    : workflowSaveUncertain ? "流程准备结果尚未确认，请先核对。"
    : userFacingAvailability(workflowEditor, capabilities, sourceIssue, paintingInput);

  const createSource = async (
    controller: AbortController,
    sourceModality: WorkflowEditorState["sourceModality"],
    valid: () => boolean,
  ): Promise<CreationSource> => {
    if (!token || !sourceModality) throw new Error("请先选择一种输入。");
    if (sourceModality === "TEXT_DESCRIPTION" || sourceModality === "POEM") {
      return { modality: sourceModality, text: textSource };
    }
    if (sourceModality === "IMAGE") {
      if (!imageFile) throw new Error("请选择一张图像。");
      if (imageFile.size > MAX_UPLOAD_BYTES) throw new Error("图像超过允许的 10 MiB 上限。");
      let asset = uploadedImage?.file === imageFile ? uploadedImage.asset : null;
      if (!asset) {
        setActionPhase("uploading");
        asset = await api.uploadImage(imageFile, "IMAGE", token, controller.signal);
        if (!valid()) throw new DOMException("Editor changed", "AbortError");
        setUploadedImage({ file: imageFile, asset });
      }
      return { modality: "IMAGE", assetId: asset.assetId };
    }
    if (!paintingInput) throw new Error("请选择一幅国画。");
    if (paintingInput.kind === "catalog") {
      return { modality: "PAINTING", paintingId: paintingInput.painting.paintingId };
    }
    if (paintingInput.file.size > MAX_UPLOAD_BYTES) throw new Error("国画图片超过允许的 10 MiB 上限。");
    let asset = uploadedPainting?.file === paintingInput.file ? uploadedPainting.asset : null;
    if (!asset) {
      setActionPhase("uploading");
      asset = await api.uploadImage(paintingInput.file, "PAINTING", token, controller.signal);
      if (!valid()) throw new DOMException("Editor changed", "AbortError");
      setUploadedPainting({ file: paintingInput.file, asset });
    }
    return { modality: "PAINTING", assetId: asset.assetId };
  };

  const requestExecution = () => {
    if (!token || !sessionCurrent() || submissionGate.snapshot() !== "idle" || actionPhase !== "idle") return;
    if (executionDisabledReason) { setActionError(executionDisabledReason); return; }
    setActionError(null);
    setShowNamePrompt(true);
  };

  async function executeWorkflow(nameInput: string) {
    const name = nameInput.trim();
    if (!name || name.length > 120 || /[\u0000-\u001f\u007f-\u009f]/.test(nameInput)) return;
    // The synchronous session gate protects the handler as well as the button.
    if (!token || !sessionCurrent() || submissionGate.snapshot() !== "idle") return;
    const existing = executionRef.current;
    if (existing?.epoch === editorEpoch.current
        && (!existing.detail || !["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(existing.detail.status))) return;
    if (executionDisabledReason) { setActionError(executionDisabledReason); return; }
    const operation = submissionGate.begin();
    if (operation === null) return;
    setShowNamePrompt(false);
    const epoch = editorEpoch.current;
    const controller = new AbortController();
    actionController.current = controller;
    const valid = () => sessionCurrent() && !controller.signal.aborted
      && actionController.current === controller && editorEpoch.current === epoch;
    setActionError(null);
    let creationPostStarted = false;
    try {
      const saved = await saveExecutionWorkflow(name);
      if (!saved || !valid()) return;
      const source = await createSource(controller, workflowEditor.sourceModality, valid);
      if (!valid()) return;
      const graph = workflowDefinitionFromEditor(workflowEditor, capabilities, name, "", "ACTIVE").graph;
      setActionPhase("submitting");
      creationPostStarted = true;
      submissionGate.markDispatched(operation);
      const acknowledgement = await api.submitCreation({ workflowId: saved.workflowId, source }, token, controller.signal);
      // A real ACK resolves this submission even if the editor changed. Never bind
      // its results to a different context, and never use a history list as an ACK.
      if (isCurrentSession(sessionIdentity)) submissionGate.acknowledge(operation);
      if (!valid()) return;
      const acknowledged: AcknowledgedExecution = { creationId: acknowledgement.creationId, workflowId: saved.workflowId, epoch, graph, source, detail: null };
      executionRef.current = acknowledged;
      setCurrentExecution(acknowledged);
      startPolling(acknowledgement.creationId, "current", epoch);
      void refreshCreations();
    } catch (caught) {
      const rejected = caught instanceof ApiError && creationAdmissionRejected(caught);
      if (creationPostStarted && rejected) submissionGate.rejectBeforeAdmission(operation);
      if (!valid()) return;
      if (creationPostStarted && !rejected) {
        setActionError("创作提交结果暂时无法确认。不会自动重试；切换流程或刷新作品列表也不能证明请求被拒绝。");
      } else {
        handleSessionError(caught);
        setActionError(errorMessage(caught));
      }
    } finally {
      submissionGate.finishWithoutAcknowledgement(operation);
      if (actionController.current === controller) actionController.current = null;
      if (sessionCurrent()) setActionPhase("idle");
    }
  }

  const requestClear = () => {
    const meaningful = Boolean(workflowDirty || textSource || imageFile || paintingInput);
    if (meaningful && !window.confirm("清空当前流程和输入内容？已有作品不会被删除，也不会取消已提交的创作。")) return;
    newWorkflow();
  };

  const loadGalleryChoices = useCallback(async () => {
    galleryController.current?.abort();
    const controller = new AbortController();
    galleryController.current = controller;
    const epoch = editorEpoch.current;
    const valid = () => sessionCurrent() && !controller.signal.aborted
      && galleryController.current === controller && editorEpoch.current === epoch;
    setGalleryLoading(true);
    setGalleryError(null);
    try {
      const result = await api.paintings({ keyword: gallerySearch, page: 0, size: 12 }, token, controller.signal);
      if (valid()) setGalleryChoices(result);
    } catch (caught) {
      if (!valid()) return;
      handleSessionError(caught);
      setGalleryError(errorMessage(caught));
    } finally {
      if (valid()) setGalleryLoading(false);
    }
  }, [gallerySearch, handleSessionError, sessionCurrent, token]);

  const selectedRunStep = useCallback((index: number) =>
    executionStep(currentExecution, editorEpoch.current, `step${index + 1}`), [currentExecution]);

  const sourceBody = useMemo(() => {
    const disabled = actionPhase !== "idle" || workflowSaveUncertain || workflowLoadState !== "ready";
    if (workflowEditor.sourceModality === "TEXT_DESCRIPTION") {
      return <label className="workflow-input-label"><span>画面描述</span><textarea
        value={textSource}
        maxLength={20_000}
        disabled={disabled}
        onChange={(event) => { abortForInputChange(); setTextSource(event.target.value); }}
        placeholder="例如：暮春江岸，远山隐约，渔舟停在松影与薄雾之间。"
      /><small>{textSource.length} / 20,000</small></label>;
    }
    if (workflowEditor.sourceModality === "POEM") {
      return <label className="workflow-input-label"><span>古诗内容</span><textarea
        value={textSource}
        maxLength={20_000}
        disabled={disabled}
        onChange={(event) => { abortForInputChange(); setTextSource(event.target.value); }}
        placeholder={"明月松间照，\n清泉石上流。"}
      /><small>会保留换行；文件不会写入流程定义。</small></label>;
    }
    if (workflowEditor.sourceModality === "IMAGE") {
      return <div className="workflow-image-input">
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png" hidden disabled={disabled}
          onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; abortForInputChange(); setImageFile(file); setUploadedImage(null); }} />
        {imagePreview ? <>
          <img src={imagePreview} alt="待使用的图像输入预览" />
          <a href={imagePreview} target="_blank" rel="noreferrer">放大查看</a>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => imageInputRef.current?.click()}>更换图像</button>
        </> : <button className="workflow-drop-zone" type="button" disabled={disabled}
          onClick={() => imageInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0] ?? null;
            if (file) { abortForInputChange(); setImageFile(file); setUploadedImage(null); }
          }}
        >点击或拖放图像<br /><small>JPEG / PNG，执行时才会上传</small></button>}</div>;
    }
    if (workflowEditor.sourceModality === "PAINTING") {
      const catalog = paintingInput?.kind === "catalog" ? paintingInput.painting : null;
      return <div className="workflow-painting-input">
        <input ref={paintingUploadRef} type="file" accept="image/jpeg,image/png" hidden disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (!file) return;
            abortForInputChange();
            setPaintingInput({ kind: "upload", file });
            setUploadedPainting(null);
            setShowGalleryPicker(false);
          }} />
        {catalog ? <>
          {catalog.image?.contentUrl ? <img src={resolveMediaUrl(catalog.image.contentUrl) || ""} alt={catalog.title || "已选国画"} /> : null}
          <strong>{catalog.title || "未题画作"}</strong><small>{catalog.authorName || "作者信息暂无"}</small>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => { abortForInputChange(); setPaintingInput(null); }}>更换国画</button>
        </> : paintingPreview ? <>
          <img src={paintingPreview} alt="待使用的本地国画预览" />
          <a href={paintingPreview} target="_blank" rel="noreferrer">放大查看</a>
          <small>这幅国画会在执行时作为你的私有输入上传。</small>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => paintingUploadRef.current?.click()}>更换国画</button>
        </> : <div className="workflow-painting-actions">
          <button className="button" type="button" disabled={disabled} onClick={() => paintingUploadRef.current?.click()}>上传国画</button>
          <button className="button button-quiet" type="button" disabled={disabled} onClick={() => { setShowGalleryPicker(true); void loadGalleryChoices(); }}>从画廊选择</button>
        </div>}
        {showGalleryPicker ? <div className="gallery-picker">
          <form onSubmit={(event) => { event.preventDefault(); void loadGalleryChoices(); }}>
            <label><span className="sr-only">搜索画廊</span><input value={gallerySearch} onChange={(event) => setGallerySearch(event.target.value)} placeholder="搜索画作或作者" /></label>
            <button className="button" type="submit" disabled={galleryLoading}>搜索</button>
          </form>
          {galleryLoading ? <LoadingStatus label={galleryChoices ? "正在检索，以下仍为上次查询结果" : "正在检索画廊"} /> : null}
          {galleryError ? <p className="inline-error" role="alert">{galleryError}</p> : null}
          <div className="gallery-picker-results">
            {galleryChoices?.items.map((painting) => <button key={painting.paintingId} type="button" disabled={galleryLoading || !!galleryError} onClick={() => {
              abortForInputChange(); setPaintingInput({ kind: "catalog", painting }); setShowGalleryPicker(false);
            }}><span>{painting.title || "未题画作"}</span><small>{painting.authorName || "作者信息暂无"}</small></button>)}
          </div>
        </div> : null}
      </div>;
    }
    return null;
  }, [abortForInputChange, actionPhase, galleryChoices, galleryError, galleryLoading, gallerySearch, imagePreview, loadGalleryChoices, paintingInput, paintingPreview, showGalleryPicker, textSource, workflowEditor.sourceModality, workflowLoadState, workflowSaveUncertain]);

  const operationBody = useCallback((operation: WorkflowOperationCapability, index: number) => {
    const result = selectedRunStep(index);
    if (operation.code === "PAINTING_TO_MUSIC") {
      const duration = musicDurationForEditor(workflowEditor, index);
      return <><label className="workflow-duration"><span>设定音乐时长 <output>{duration} 秒</output></span><input
        type="range" min="3" max="30" step="1" value={duration}
        disabled={actionPhase !== "idle" || workflowSaveUncertain}
        onChange={(event) => {
          try { updateEditor(setEditorMusicDuration(workflowEditor, index, Number(event.target.value))); }
          catch (caught) { setWorkflowSaveError(errorMessage(caught)); }
        }}
      /><small>下一次执行的设定：3–30 秒。历史结果保留原时长。</small></label>
        {result?.status === "SUCCEEDED" ? <div aria-label="当前执行结果"><small>本次已确认执行的结果</small><CreationStepOutput step={result} /></div> : null}</>;
    }
    if (result?.status === "SUCCEEDED") return <div aria-label="当前执行结果"><CreationStepOutput step={result} /></div>;
    if (operation.code === "PAINTING_TO_VIDEO") return <p className="workflow-node-waiting">暂未开放</p>;
    if (operation.code === "PAINTING_TO_POEM") return <p className="workflow-node-waiting">完成后将在这里显示本轮生成的诗词。</p>;
    return <p className="workflow-node-waiting">完成后将在这里显示本轮生成的国画。</p>;
  }, [actionPhase, selectedRunStep, updateEditor, workflowEditor, workflowSaveUncertain]);


  return (
    <div className="studio-layout studio-layout-redesigned">
      {loadingDiscovery ? <LoadingStatus label="正在确认创作能力，暂不能执行" onRetry={() => setDiscoveryAttempt(value => value + 1)} /> : discoveryError ? <StatePanel compact kind="error" title="创作能力暂时无法确认" description={discoveryError} actionLabel="重新读取能力" onAction={() => setDiscoveryAttempt(value => value + 1)} /> : null}
      <WorkflowDesigner
        capabilities={capabilities}
        value={workflowEditor}
        disabled={actionPhase !== "idle"}
        editingDisabled={!capabilities || loadingDiscovery || workflowSaveUncertain || workflowLoadState !== "ready"}
        executing={actionPhase !== "idle"}
        executionDisabledReason={executionDisabledReason}
        sourceBody={sourceBody}
        operationBody={operationBody}
        onChange={updateEditor}
        onExecute={requestExecution}
        onClear={requestClear}
      />

      {workflowSaveUncertain ? <section className="workflow-small-panel glass-panel" aria-label="核对流程状态">
        <header><h3>核对流程状态</h3><button className="button" type="button" disabled={loadingWorkflows} onClick={() => void refreshWorkflowList()}>读取待核对流程</button></header>
        <p>只有确认已有记录后才能继续；读取列表不会再次提交创作。请选择与本次名称和步骤相符的流程，同类型的输入内容会保留。</p>
        {loadingWorkflows ? <LoadingSection label="正在核对流程"><SkeletonRows /></LoadingSection> : null}
        {workflows?.items.length ? <ul>{workflows.items.map((workflow) => <li key={workflow.workflowId}>
          <button type="button" disabled={loadingWorkflows} onClick={() => void recoverWorkflow(workflow.workflowId)}>
            <strong>{workflow.name}</strong><span>{modalityLabels[workflow.sourceModality]} → {modalityLabels[workflow.terminalModality]} · {displayTime(workflow.updatedAt)}</span><span>使用此流程继续</span>
          </button>
        </li>)}</ul> : !loadingWorkflows && !workflowListError && workflows ? <p>暂未找到可核对的记录。空列表不能确认上次请求失败，请稍后再核对。</p> : null}
        {workflowListError ? <p className="inline-error" role="alert">暂时无法读取待核对流程：{workflowListError}</p> : null}
      </section> : null}

      {showNamePrompt ? <StudioExecutionDialog onCancel={() => setShowNamePrompt(false)} onConfirm={(name) => void executeWorkflow(name)} /> : null}

      {workflowSaveError ? <p className="inline-error studio-wide-error" role="alert">{workflowSaveError}</p> : null}
      {actionError ? <p className="inline-error studio-wide-error" role="alert">{actionError}</p> : null}
      {submissionUncertain ? <p className="studio-reason studio-wide-error" role="status">提交结果未确认：本登录会话已暂停新的创作提交，编辑、新建和读取历史不会解除保护。现有接口不能凭空列表确认请求失败。离开页面只停止等待，不会取消后台创作；刷新或其他标签页尚无跨页幂等保证，请勿据此重发。</p> : null}

      <section className="studio-creations" aria-labelledby="my-creations-title">
        <div className="section-heading section-heading-left studio-list-heading">
          <div><h2 id="my-creations-title">我的作品</h2><p>每一条记录保存本轮输入和每一步实际产出的结果。</p></div>
          <button className="button" type="button" disabled={loadingCreations} onClick={() => void refreshCreations()}>{loadingCreations ? <PendingIndicator /> : null}刷新</button>
        </div>
        {creationError ? <p className="inline-error" role="alert">{creationError}</p> : null}
        {creationReadStale ? <p className="studio-reason" role="status">当前卡片与详情展示的是上次成功读取的状态，可能已经更新；请使用“刷新”或“刷新详情”核对。</p> : null}
        {loadingCreations && !creationPage ? <LoadingSection label="正在读取我的作品" onRetry={() => void refreshCreations()}><CreationGridSkeleton /></LoadingSection> : null}
        {loadingCreations && creationPage ? <LoadingStatus label={creationPage.page === creationPageNumber ? "正在更新本页作品，暂保留已读取状态" : `正在读取第 ${creationPageNumber + 1} 页，以下仍为第 ${creationPage.page + 1} 页作品`} /> : null}
        {creationPage?.items.length ? <>
          <div className="creation-grid">
            {creationPage.items.map((creation) => <button className="creation-card glass-panel" type="button" key={creation.creationId} onClick={() => void openCreation(creation.creationId)}>
              <span className={`creation-status status-${creation.status.toLowerCase()}`}>{statusLabels[creation.status] || "状态待确认"}</span>
              <h3>{creation.workflowName || "未命名创作"}</h3>
              <p>{modalityLabels[creation.sourceModality] || "输入"} → {modalityLabels[creation.finalModality || ""] || "等待结果"}</p>
              <time>{displayTime(creation.updatedAt)}</time>
            </button>)}
          </div>
          <nav className="pagination" aria-label="我的作品分页">
            <button className="button" type="button" disabled={loadingCreations || creationPage.first} onClick={() => setCreationPageNumber((current) => Math.max(0, current - 1))}>上一页</button>
            <span>第 {creationPage.page + 1} / {Math.max(creationPage.totalPages, 1)} 页</span>
            <button className="button" type="button" disabled={loadingCreations || creationPage.last} onClick={() => setCreationPageNumber((current) => current + 1)}>下一页</button>
          </nav>
        </> : !loadingCreations && !creationError && creationPage ? <StatePanel kind="empty" title="还没有作品" description="配置流程并填写输入后，点击“执行流程”开始创作。每次提交的结果都会在这里显示。" /> : null}
      </section>

      {detailLoading ? <LoadingStatus label="正在读取历史详情" /> : null}
      {detailError ? <p className="inline-error" role="alert">{detailError}</p> : null}
      {currentExecution ? <p className="studio-reason" role="status">本次提交已确认{pollState === "polling" ? "，正在读取执行状态" : ""}。<button className="button" type="button" onClick={() => void openCreation(currentExecution.creationId)}>在历史区查看本次执行</button></p> : null}
      {selectedCreation ? <section className="creation-detail glass-panel" aria-labelledby="creation-detail-title">
        <header className="studio-section-header">
          <div><span>历史创作（独立查看，不改变当前流程）</span><h2 id="creation-detail-title">{selectedCreation.workflowName || "创作详情"}</h2><p>{displayTime(selectedCreation.createdAt)}</p></div>
          <span className={`creation-status status-${selectedCreation.status.toLowerCase()}`}>{statusLabels[selectedCreation.status] || "状态待确认"}</span>
        </header>
        {historyPollState === "polling" ? <p className="polling-note" aria-live="polite">正在等待本轮步骤状态更新。</p> : null}
        <CreationRunHistory creation={selectedCreation} />
        {selectedCreation.errorMessage ? <p className="inline-error" role="alert">{selectedCreation.errorMessage}</p> : null}
        <div className="creation-detail-actions"><button className="button" type="button" onClick={() => void openCreation(selectedCreation.creationId)}>刷新详情</button></div>
      </section> : null}
    </div>
  );
}
