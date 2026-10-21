"use client";

import type { ReactNode } from "react";

import {
  allowedNextOperations,
  appendEditorOperation,
  repeatedWorkflowNodeTypeMessage,
  removeEditorTransform,
  setEditorSource,
  workflowNodeTypes,
  type WorkflowEditorState,
} from "@/lib/workflow-editor";
import type {
  WorkflowCapabilities,
  WorkflowModality,
  WorkflowOperationCapability,
} from "@/lib/types";

type ToolbarItem = {
  id: "TEXT_DESCRIPTION" | "POEM" | "PAINTING" | "IMAGE" | "AUDIO" | "VIDEO";
  label: string;
};

const TOOLBAR: ToolbarItem[] = [
  { id: "TEXT_DESCRIPTION", label: "文字节点" },
  { id: "POEM", label: "古诗节点" },
  { id: "PAINTING", label: "国画节点" },
  { id: "IMAGE", label: "图像节点" },
  { id: "AUDIO", label: "音乐节点" },
  { id: "VIDEO", label: "视频节点" },
];

const SOURCE_LABELS: Record<WorkflowModality, string> = {
  TEXT_DESCRIPTION: "文字描述",
  POEM: "古诗输入",
  IMAGE: "图像输入",
  PAINTING: "国画输入",
  AUDIO: "音频",
  VIDEO: "视频",
};

const OUTPUT_LABELS: Record<string, string> = {
  TEXT_TO_PAINTING: "生成国画",
  POEM_TO_PAINTING: "生成国画",
  IMAGE_TO_PAINTING: "生成国画",
  PAINTING_TO_MUSIC: "生成音乐",
  PAINTING_TO_POEM: "生成诗词",
  PAINTING_TO_VIDEO: "生成视频",
};

type Props = {
  capabilities: WorkflowCapabilities | null;
  value: WorkflowEditorState;
  disabled?: boolean;
  editingDisabled?: boolean;
  dirty: boolean;
  saving: boolean;
  executionDisabledReason: string | null;
  sourceBody: ReactNode;
  operationBody: (operation: WorkflowOperationCapability, index: number) => ReactNode;
  onChange: (value: WorkflowEditorState) => void;
  onSave: () => void;
  onOpen: () => void;
  onExecute: () => void;
  onClear: () => void;
};

type ToolbarAction = {
  enabled: boolean;
  hint: string;
  run: () => void;
};

/**
 * The Studio surface deliberately models an ordered chain, not an arbitrary
 * canvas.  The pure workflow-editor helpers remain the source of truth for
 * legal transitions and dependent-node removal.
 */
export function WorkflowDesigner({
  capabilities,
  value,
  disabled = false,
  editingDisabled = false,
  dirty,
  saving,
  executionDisabledReason,
  sourceBody,
  operationBody,
  onChange,
  onSave,
  onOpen,
  onExecute,
  onClear,
}: Props) {
  const next = allowedNextOperations(value, capabilities);
  const maximum = capabilities?.maxVisibleCards ?? 3;
  const usedNodeTypes = workflowNodeTypes(value);

  const append = (code: string) => {
    const operation = next.find((candidate) => candidate.code === code);
    if (operation) onChange(appendEditorOperation(value, operation, capabilities));
  };

  const actionFor = (item: ToolbarItem): ToolbarAction => {
    const source = value.sourceModality;
    const current = value.operations.at(-1)?.outputModality ?? source;
    const hasRoom = (value.operations.length + (source ? 1 : 0)) < maximum;
    const appendable = (code: string) => next.some((operation) => operation.code === code);

    if (item.id === "PAINTING") {
      const transform = source === "TEXT_DESCRIPTION"
        ? "TEXT_TO_PAINTING"
        : source === "POEM"
          ? "POEM_TO_PAINTING"
          : source === "IMAGE"
            ? "IMAGE_TO_PAINTING"
            : null;
      if (transform && appendable(transform) && hasRoom) {
        return { enabled: true, hint: "追加生成国画", run: () => append(transform) };
      }
      if (!source) {
        return { enabled: true, hint: "设为国画输入", run: () => onChange(setEditorSource("PAINTING")) };
      }
      if (current === "PAINTING") {
        return { enabled: false, hint: "当前链路已位于国画节点", run: () => undefined };
      }
      return { enabled: true, hint: "更换为国画输入", run: () => onChange(setEditorSource("PAINTING")) };
    }

    if (item.id === "POEM") {
      if (source && current === "PAINTING" && appendable("PAINTING_TO_POEM") && hasRoom) {
        return { enabled: true, hint: "追加生成诗词", run: () => append("PAINTING_TO_POEM") };
      }
      if (source && current === "PAINTING" && usedNodeTypes.has("POEM")) {
        return {
          enabled: false,
          hint: repeatedWorkflowNodeTypeMessage("POEM"),
          run: () => undefined,
        };
      }
      return { enabled: true, hint: "设为古诗输入", run: () => onChange(setEditorSource("POEM")) };
    }

    if (item.id === "AUDIO") {
      if (source && current === "PAINTING" && appendable("PAINTING_TO_MUSIC") && hasRoom) {
        const available = next.find((operation) => operation.code === "PAINTING_TO_MUSIC")?.executionAvailable;
        return { enabled: true, hint: available === true ? "追加音乐节点" : "追加音乐草稿节点；当前执行能力不可用", run: () => append("PAINTING_TO_MUSIC") };
      }
      return { enabled: false, hint: outputUnavailableHint("AUDIO", "PAINTING_TO_MUSIC"), run: () => undefined };
    }

    if (item.id === "VIDEO") {
      if (source && current === "PAINTING" && appendable("PAINTING_TO_VIDEO") && hasRoom) {
        return { enabled: true, hint: "追加视频草稿节点", run: () => append("PAINTING_TO_VIDEO") };
      }
      return { enabled: false, hint: outputUnavailableHint("VIDEO", "PAINTING_TO_VIDEO"), run: () => undefined };
    }

    const modality = item.id as WorkflowModality;
    return {
      enabled: true,
      hint: source === modality ? "当前输入类型" : `设为${SOURCE_LABELS[modality]}`,
      run: () => onChange(setEditorSource(modality)),
    };
  };

  const outputUnavailableHint = (output: "AUDIO" | "VIDEO", code: string): string => {
    const label = output === "AUDIO" ? "音乐" : "视频";
    if (!capabilities) return "节点能力尚未读取，暂时无法确认可添加的步骤。";
    if (usedNodeTypes.has(output)) return repeatedWorkflowNodeTypeMessage(output);
    const last = value.operations.at(-1);
    if (last?.terminalOutput === true) return `当前${SOURCE_LABELS[last.outputModality as WorkflowModality] || "输出"}是终点，不能继续追加节点。`;
    if (value.operations.length >= (capabilities.maxTransformSteps ?? 2)
      || value.operations.length + (value.sourceModality ? 1 : 0) >= maximum) {
      return "当前流程已达到节点数量上限。";
    }
    if ((last?.outputModality ?? value.sourceModality) !== "PAINTING") return `${label}节点需要前一步国画。`;
    const operation = capabilities.operations.find((candidate) => candidate.code === code);
    if (!operation || operation.draftEnabled !== true) return `当前能力未开放${label}节点的草稿定义。`;
    return `当前链路不能追加${label}节点，请检查输入与已用节点。`;
  };

  return (
    <section className="workflow-designer glass-panel" aria-labelledby="workflow-designer-title">
      <header className="workflow-designer-header">
        <div>
          <span className="studio-eyebrow">创作路径</span>
          <h2 id="workflow-designer-title">工作流设计器</h2>
          <p>{value.sourceModality ? "按顺序组合输入与创作步骤。" : "先从下方选择一种输入开始。"}</p>
        </div>
        <div className="workflow-designer-actions">
          <button className="button button-quiet" type="button" disabled={disabled} onClick={onOpen}>打开流程</button>
          <button className="button" type="button" disabled={disabled || editingDisabled || !value.sourceModality} onClick={onSave}>
            {saving ? "正在保存…" : "保存流程"}
          </button>
          <button
            className="button button-clear"
            type="button"
            disabled={disabled || !value.sourceModality}
            onClick={onClear}
          >清空工作流</button>
          <button
            className="button button-primary"
            type="button"
            disabled={disabled || !value.sourceModality || Boolean(executionDisabledReason)}
            onClick={onExecute}
          >执行全流程</button>
        </div>
      </header>

      {dirty ? <p className="workflow-unsaved" role="status">当前编辑尚未保存。</p> : null}
      {executionDisabledReason ? <p className="workflow-context-note" role="status">{executionDisabledReason}</p> : null}
      {value.sourceModality && value.operations.at(-1)?.outputModality === "PAINTING"
        && usedNodeTypes.has("POEM") ? (
          <p className="workflow-context-note" role="status">{repeatedWorkflowNodeTypeMessage("POEM")}</p>
        ) : null}

      <div className="workflow-chain" aria-label="当前工作流顺序">
        {!value.sourceModality ? (
          <div className="workflow-chain-empty">选择节点后，这里会显示你的创作路径。</div>
        ) : (
          <>
            <article className="workflow-node-card workflow-node-source">
              <header>
                <span className="workflow-node-badge">输入</span>
                <button
                  className="workflow-node-delete"
                  type="button"
                  disabled={disabled || editingDisabled}
                  onClick={() => onChange(setEditorSource(null))}
                  aria-label="删除输入节点并清空工作流"
                >×</button>
              </header>
              <h3>{SOURCE_LABELS[value.sourceModality]}</h3>
              <div className="workflow-node-body">{sourceBody}</div>
            </article>
            {value.operations.map((operation, index) => (
              <div className="workflow-node-wrap" key={`step${index + 1}`}>
                <div className="workflow-connector" aria-hidden="true"><span>→</span></div>
                <article className="workflow-node-card workflow-node-output">
                  <header>
                    <span className="workflow-node-badge">输出</span>
                    <button
                      className="workflow-node-delete"
                      type="button"
                      disabled={disabled || editingDisabled}
                      onClick={() => onChange(removeEditorTransform(value, index))}
                      aria-label={`删除${OUTPUT_LABELS[operation.code] || "此节点"}及其后续节点`}
                    >×</button>
                  </header>
                  <h3>{OUTPUT_LABELS[operation.code] || operation.displayName}</h3>
                  <div className="workflow-node-body">{operationBody(operation, index)}</div>
                  {operation.executionAvailable !== true ? (
                    <p className="workflow-node-unavailable">此步骤可保存为流程，当前暂不能执行。</p>
                  ) : null}
                </article>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="workflow-toolbar" aria-label="添加工作流节点">
        {TOOLBAR.map((item) => {
          const action = actionFor(item);
          return (
            <button
              key={item.id}
              type="button"
              className="workflow-toolbar-button"
              disabled={disabled || editingDisabled || !action.enabled}
              title={action.hint}
              aria-describedby={`workflow-toolbar-${item.id}`}
              onClick={action.run}
            >{item.label}<span id={`workflow-toolbar-${item.id}`} className="sr-only">{action.hint}</span></button>
          );
        })}
      </div>
    </section>
  );
}
