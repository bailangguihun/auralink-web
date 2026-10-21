"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/session-provider";
import { api, ApiError, errorMessage, isAbortError } from "@/lib/api";
import { poemTitleLabel } from "@/lib/creation-poem";
import type { SessionIdentity } from "@/lib/session-identity";
import type { CreationDetail, CreationStep, WorkflowModality } from "@/lib/types";

const operationLabels: Record<string, string> = {
  TEXT_TO_PAINTING: "生成国画",
  POEM_TO_PAINTING: "生成国画",
  IMAGE_TO_PAINTING: "生成国画",
  PAINTING_TO_MUSIC: "生成音乐",
  PAINTING_TO_POEM: "生成诗词",
  PAINTING_TO_VIDEO: "生成视频",
};

const modalityLabels: Record<string, string> = {
  TEXT_DESCRIPTION: "文字描述",
  POEM: "古诗输入",
  IMAGE: "图像输入",
  PAINTING: "国画输入",
  AUDIO: "音乐",
  VIDEO: "视频",
};

const statusLabels: Record<string, string> = {
  PENDING: "等待执行",
  RUNNING: "正在生成",
  SUCCEEDED: "已完成",
  FAILED: "未完成",
  QUEUED: "已排队",
  PARTIAL_SUCCESS: "部分完成",
};

type PrivateMediaPreviewProps = {
  url: string | null;
  modality: WorkflowModality | string | null;
  alt: string;
  className?: string;
};

/** Owner-scoped media is fetched with the current session and never exposed as a storage path. */
export function PrivateMediaPreview({ url, modality, alt, className = "" }: PrivateMediaPreviewProps) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const requestGeneration = useRef(0);
  const [media, setMedia] = useState<{
    source: string;
    modality: typeof modality;
    identity: SessionIdentity;
    objectUrl: string | null;
    error: string | null;
  } | null>(null);
  const mediaLabel = modality === "AUDIO" ? "音频" : modality === "VIDEO" ? "视频"
    : modality === "IMAGE" || modality === "PAINTING" ? "图片" : "媒体";

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setMedia(null);
    if (!token || !url) {
      return;
    }
    const controller = new AbortController();
    let generatedUrl: string | null = null;
    const current = () => !controller.signal.aborted
      && requestGeneration.current === generation && isCurrentSession(sessionIdentity);
    void api.mediaBlob(url, token, controller.signal)
      .then((blob) => {
        if (!current()) return;
        generatedUrl = URL.createObjectURL(blob);
        setMedia({ source: url, modality, identity: sessionIdentity, objectUrl: generatedUrl, error: null });
      })
      .catch((caught) => {
        if (isAbortError(caught) || !current()) return;
        if (caught instanceof ApiError && caught.kind === "unauthorized") {
          signOutIfCurrent(sessionIdentity);
          return;
        }
        setMedia({ source: url, modality, identity: sessionIdentity, objectUrl: null,
          error: caught instanceof ApiError && caught.kind === "not_found"
            ? `此历史作品${mediaLabel}暂不可用；作品记录和登录状态已保留。`
            : errorMessage(caught, `暂时无法读取本轮私有${mediaLabel}；其他创作信息已保留，请稍后重试。`),
        });
      });
    return () => {
      controller.abort();
      if (generatedUrl) URL.revokeObjectURL(generatedUrl);
    };
  }, [isCurrentSession, mediaLabel, modality, sessionIdentity, signOutIfCurrent, token, url]);

  if (!url) return null;
  // Do not render a previous URL for even one frame while the replacement
  // effect is still pending (including a login-generation change).
  const visibleMedia = media?.source === url && media.modality === modality
    && media.identity === sessionIdentity && isCurrentSession(sessionIdentity) ? media : null;
  const objectUrl = visibleMedia?.objectUrl;
  const reportDecodeFailure = () => {
    if (!visibleMedia || !isCurrentSession(sessionIdentity)) return;
    setMedia((previous) => previous === visibleMedia
      ? { ...previous, error: `此${mediaLabel}暂时无法${modality === "AUDIO" || modality === "VIDEO" ? "播放" : "显示"}；作品记录已保留。` }
      : previous);
  };
  if (visibleMedia?.error) return <p className="inline-error" role="alert">{visibleMedia.error}</p>;
  if (!objectUrl) return <p className="creation-result-loading" aria-live="polite">正在读取媒体…</p>;
  if (modality === "AUDIO") {
    return <audio className={`creation-audio ${className}`} controls preload="metadata" src={objectUrl} onError={reportDecodeFailure}>浏览器无法播放此音频。</audio>;
  }
  if (modality === "PAINTING" || modality === "IMAGE") {
    return (
      <figure className={`creation-media-preview ${className}`}>
        <img src={objectUrl} alt={alt} onError={reportDecodeFailure} />
        <a href={objectUrl} target="_blank" rel="noreferrer">放大查看</a>
      </figure>
    );
  }
  return <a className="button button-quiet" href={objectUrl} target="_blank" rel="noreferrer">查看生成资源</a>;
}

function PoemOutput({ title, lines }: { title: string | null; lines: string[] }) {
  return (
    <article className="creation-poem">
      <span>本步结果</span>
      <h4>{poemTitleLabel(title)}</h4>
      {lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
    </article>
  );
}

export function CreationStepOutput({ step }: { step: CreationStep }) {
  if (step.outputPoem) return <PoemOutput title={step.outputPoem.title} lines={step.outputPoem.lines} />;
  if (step.outputText) return <p className="creation-text-result">{step.outputText}</p>;
  return <>
    {step.operation === "PAINTING_TO_MUSIC" && typeof step.requestedDurationSeconds === "number" ? (
      <p className="creation-history-pending">本次结果记录时长：{step.requestedDurationSeconds} 秒</p>
    ) : null}
    {step.status === "SUCCEEDED" && !step.outputAssetContentUrl ? (
      <p className="inline-error" role="alert">此{step.outputModality === "AUDIO" ? "音频" : step.outputModality === "PAINTING" || step.outputModality === "IMAGE" ? "图片" : "媒体"}结果未提供可读取的媒体链接；历史记录已保留。</p>
    ) : null}
    <PrivateMediaPreview
      url={step.outputAssetContentUrl}
      modality={step.outputModality}
      alt={`${operationLabels[step.operation] || "创作"}结果`}
    />
  </>;
}

export function CreationRunHistory({ creation }: { creation: CreationDetail }) {
  const sourceText = creation.sourceText?.trim();
  return (
    <div className="creation-run-history">
      <article className="creation-history-source">
        <span>本轮输入</span>
        <h3>{modalityLabels[creation.sourceModality] || "本轮输入"}</h3>
        {sourceText ? <p className="creation-history-source-text">{creation.sourceText}</p> : null}
        {creation.sourcePaintingContentUrl ? (
          <>
            {creation.sourcePaintingTitle ? <p>{creation.sourcePaintingTitle}</p> : null}
            <PrivateMediaPreview
              url={creation.sourcePaintingContentUrl}
              modality="PAINTING"
              alt={creation.sourcePaintingTitle || "本轮选择的国画"}
            />
          </>
        ) : null}
        {creation.sourceAssetContentUrl ? (
          <PrivateMediaPreview
            url={creation.sourceAssetContentUrl}
            modality={creation.sourceModality}
            alt="本轮上传的输入"
          />
        ) : null}
        {!sourceText && !creation.sourcePaintingContentUrl && !creation.sourceAssetContentUrl ? (
          <p className="creation-history-pending">该历史输入未包含可预览内容。</p>
        ) : null}
      </article>

      <ol className="creation-step-history">
        {creation.steps.map((step) => (
          <li key={step.stepId}>
            <article>
              <header>
                <span className="creation-step-number">{step.stepIndex + 1}</span>
                <div>
                  <p>转换步骤</p>
                  <h3>{operationLabels[step.operation] || "创作步骤"}</h3>
                </div>
                <span className={`creation-status status-${step.status.toLowerCase()}`}>
                  {statusLabels[step.status] || "状态待确认"}
                </span>
              </header>
              <CreationStepOutput step={step} />
              {step.status !== "SUCCEEDED" && !step.errorMessage ? (
                <p className="creation-history-pending">此步骤尚未产生可展示的结果。</p>
              ) : null}
              {step.errorMessage ? <p className="inline-error" role="alert">{step.errorMessage}</p> : null}
            </article>
          </li>
        ))}
      </ol>
    </div>
  );
}
