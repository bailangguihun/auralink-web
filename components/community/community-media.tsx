"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/components/session-provider";
import { errorMessage } from "@/lib/api";
import { communityApi, type CommunityImage } from "@/lib/community";
import type { CommunityActions } from "./use-community-actions";

export function CommunityDialog({ title, close, children, wide = false }: { title: string; close: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current, previous = document.activeElement as HTMLElement | null;
    element?.showModal(); return () => { element?.close(); previous?.focus(); };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<dialog ref={ref} className={`community-dialog${wide ? " is-wide" : ""}`} onCancel={event => { event.preventDefault(); close(); }} aria-label={title}>
    <header><h2>{title}</h2><button className="community-icon-button" type="button" aria-label="关闭" onClick={close}>×</button></header>{children}
  </dialog>, document.body);
}

function Photo({ image, original = false, alt }: { image: CommunityImage; original?: boolean; alt: string }) {
  const { token } = useSession();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(original), [source, setSource] = useState(""), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (visible) return;
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "240px" });
    observer.observe(element); return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !token) return;
    const controller = new AbortController(); let url = "";
    setSource(""); setError("");
    void communityApi.imageBlob(token, image.id, original, controller.signal).then(blob => {
      if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setSource(url); }
    }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [token, image.id, original, visible, attempt]);
  return <div ref={ref} className={`community-photo${original ? " is-original" : ""}`} style={{ aspectRatio: `${image.width} / ${image.height}` }}>
    {source ? <img src={source} alt={alt} width={image.width} height={image.height} decoding="async" data-testid="community-image" onError={() => setError("图片暂时无法显示。")} /> : null}
    {error ? <div className="community-photo-state"><span>{error}</span><button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>重新读取图片</button></div> : !source ? <span className="community-photo-placeholder" aria-label="正在读取图片">画</span> : null}
  </div>;
}
export function CommunityImages({ images, title = "社区作品" }: { images: CommunityImage[]; title?: string }) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!images.length) return null;
  return <><div className={`community-image-grid count-${Math.min(images.length, 3)}`}>
    {images.map((image, index) => <div className="community-image-open" key={image.id}>
      <Photo image={image} alt={`${title} · ${index + 1}`} /><button type="button" className="community-image-trigger" aria-label={`查看${title}第 ${index + 1} 张原图`} onClick={() => setSelected(index)}><span>查看原图 ↗</span></button>
    </div>)}
  </div>{selected !== null && images[selected] ? <CommunityDialog title={title} wide close={() => setSelected(null)}>
    <Photo image={images[selected]} original alt={`${title}第 ${selected + 1} 张原图`} />
    <footer className="community-dialog-actions"><button className="button" disabled={selected === 0} onClick={() => setSelected(value => (value ?? 0) - 1)}>上一张</button><span>{selected + 1} / {images.length}</span><button className="button" disabled={selected === images.length - 1} onClick={() => setSelected(value => (value ?? 0) + 1)}>下一张</button></footer>
  </CommunityDialog> : null}</>;
}
export function CommunityUploader({ images, onChange, actions, disabled = false }: { images: CommunityImage[]; onChange: (images: CommunityImage[]) => void; actions: CommunityActions; disabled?: boolean }) {
  const { token, sessionIdentity, isCurrentSession } = useSession(); const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [uploading, setUploading] = useState(false), [error, setError] = useState("");
  const imagesRef = useRef(images), changeRef = useRef(onChange); imagesRef.current = images; changeRef.current = onChange;
  const recovered = actions.lastResult?.kind === "upload" ? actions.lastResult.assetId : undefined;
  useEffect(() => {
    if (!recovered || !token || imagesRef.current.some(image => image.id === recovered)) return;
    const controller = new AbortController();
    void communityApi.image(token, recovered, controller.signal).then(image => {
      if (!controller.signal.aborted && !imagesRef.current.some(value => value.id === image.id) && imagesRef.current.length < 9) changeRef.current([...imagesRef.current, image]);
    }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [recovered, token]);
  const upload = useCallback(async (files: FileList | null) => {
    if (!files || uploading || actions.busy) return;
    const batch = [...files]; setError("");
    if (batch.length + imagesRef.current.length > 9) { setError("最多选择 9 张图片。"); return; }
    if (batch.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024)) { setError("请选择不超过 10 MB 的 JPG、PNG 或 WebP 图片。"); return; }
    setUploading(true); actions.setTransferring(true);
    const identity = sessionIdentity;
    const current = () => alive.current && isCurrentSession(identity);
    try {
      for (const file of batch) {
        if (!current()) break;
        const result = await actions.execute("upload", (token, requestId) => communityApi.upload(token, file, requestId));
        if (!current() || !result?.assetId || !token) break;
        const image = await communityApi.image(token, result.assetId);
        if (!current()) break;
        if (!imagesRef.current.some(value => value.id === image.id)) { const next = [...imagesRef.current, image]; imagesRef.current = next; changeRef.current(next); }
      }
    } catch (error) { setError(errorMessage(error)); } finally { setUploading(false); actions.setTransferring(false); if (input.current) input.current.value = ""; }
  }, [uploading, actions, token, sessionIdentity, isCurrentSession]);
  return <section className="community-upload" aria-label="作品图片">
    <div className="community-upload-heading"><strong>作品图片 <small>{images.length} / 9</small></strong><label className={`community-add-image${disabled || uploading || actions.busy || images.length >= 9 ? " is-disabled" : ""}`}>
      ＋ 添加图片<input ref={input} type="file" aria-label="添加作品图片" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || uploading || actions.busy || images.length >= 9} onChange={event => void upload(event.target.files)} />
    </label></div>
    {images.length ? <div className="community-upload-thumbs">{images.map((image, index) => <div key={image.id}><Photo image={image} alt={`待发布作品 ${index + 1}`} /><button type="button" aria-label={`移除第 ${index + 1} 张图片`} disabled={actions.busy || uploading} onClick={() => onChange(images.filter(value => value.id !== image.id))}>×</button></div>)}</div> : <p className="community-upload-empty">把你的笔墨带到这里。原图会完整保留。</p>}
    <p className="community-field-hint">JPG / PNG / WebP · 每张最多 10 MB · 发布前仅自己可见{uploading ? " · 正在上传…" : ""}</p>
    {error ? <p role="alert" className="community-error">{error}</p> : null}
  </section>;
}
