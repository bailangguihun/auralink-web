"use client";

import { useEffect, useState } from "react";

import { MediaLoading } from "@/components/loading";
import { useSession } from "@/components/session-provider";
import { api, ApiError, errorMessage, isAbortError } from "@/lib/api";
import { poemTitleLabel } from "@/lib/creation-poem";
import type { CreationDetail } from "@/lib/types";

export function CreationResult({ creation }: { creation: CreationDetail }) {
  const { token, sessionIdentity, signOutIfCurrent } = useSession();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !creation.finalAssetContentUrl) {
      setObjectUrl(null);
      setMediaError(null);
      return;
    }
    const controller = new AbortController();
    let url: string | null = null;
    setObjectUrl(null);
    setMediaError(null);
    void api.mediaBlob(creation.finalAssetContentUrl, token, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch((caught) => {
        if (isAbortError(caught) || controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.kind === "unauthorized") signOutIfCurrent(sessionIdentity);
        setMediaError(caught instanceof ApiError && caught.kind === "not_found"
          ? "这张历史作品图片暂不可用；作品记录和登录状态已保留。"
          : errorMessage(caught, "暂时无法读取本轮私有媒体；其他创作信息已保留，请稍后重试。"));
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [creation.finalAssetContentUrl, sessionIdentity, signOutIfCurrent, token]);

  if (creation.finalPoem) {
    return (
      <article className="creation-poem">
        <span>诗歌结果</span>
        <h3>{poemTitleLabel(creation.finalPoem.title)}</h3>
        {creation.finalPoem.lines.map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
      </article>
    );
  }
  if (creation.finalText) {
    return <article className="creation-text-result"><span>文本结果</span><p>{creation.finalText}</p></article>;
  }
  if (!creation.finalAssetContentUrl) return null;
  if (mediaError) return <p className="inline-error" role="alert">{mediaError}</p>;
  if (!objectUrl) return <MediaLoading audio={creation.finalModality === "AUDIO"} />;
  if (creation.finalModality === "AUDIO") {
    return <audio className="creation-audio" src={objectUrl} controls preload="metadata">浏览器无法播放此音频。</audio>;
  }
  if (creation.finalModality === "PAINTING" || creation.finalModality === "IMAGE") {
    return <img className="creation-result-image" src={objectUrl} alt={`${creation.workflowName || "创作"}结果`} />;
  }
  return <p className="creation-result-loading">结果资源已生成，但当前媒体类型暂不支持内嵌预览。</p>;
}
