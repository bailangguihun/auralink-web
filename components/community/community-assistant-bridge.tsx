"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/session-provider";
import { communityApi } from "@/lib/community";
import { assistantImageFingerprint } from "@/lib/assistant-api";
import type { Attachment } from "@/lib/assistant-contracts";
import { errorMessage } from "@/lib/api";
import { communityHandoffKey, readCommunityHandoff, saveCommunityHandoff, type CommunityHandoff } from "@/lib/community-draft";

function useIncoming() {
  const { user } = useSession(); const actorId = String(user?.id || "");
  const [handoff, setHandoff] = useState<CommunityHandoff | null>(null);
  useEffect(() => {
    const read = () => {
      try { const saved = readCommunityHandoff(sessionStorage.getItem(communityHandoffKey(actorId)), actorId); setHandoff(saved?.target === "assistant" ? saved : null); }
      catch { /* Browser storage cannot authorize an import. */ }
    };
    read(); window.addEventListener("artlive:community-handoff", read);
    return () => window.removeEventListener("artlive:community-handoff", read);
  }, [actorId]);
  return { handoff, actorId, dismiss: () => { sessionStorage.removeItem(communityHandoffKey(actorId)); setHandoff(null); window.dispatchEvent(new Event("artlive:community-handoff")); } };
}
export function CommunityAssistantBanner({ onNew, buttonClassName }: { onNew: () => void; buttonClassName: string }) {
  const { handoff } = useIncoming();
  return handoff ? <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", color: "var(--text-soft)", fontSize: ".8rem", lineHeight: 1.9 }}>社区作品《{handoff.title || "未命名作品"}》已准备好。选择会话后，可以导入作品与问题。<button type="button" className={buttonClassName} style={{ marginLeft: 14 }} onClick={onNew}>新建一个对话 ↗</button></div> : null;
}
async function assistantFile(blob: Blob, filename: string) {
  if (blob.type !== "image/webp") return new File([blob], filename, { type: blob.type });
  const bitmap = await createImageBitmap(blob); const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close();
  const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!converted) throw new Error("图片格式转换失败，请从社区下载原图后再选择。");
  return new File([converted], filename.replace(/\.webp$/i, "") + ".png", { type: "image/png" });
}
export function CommunityAssistantImport({ disabled, textPresent, onText, onImage, readImages, onReference, run, className, buttonClassName }: {
  disabled: boolean; textPresent: boolean; onText: (text: string) => void;
  onImage: (file: File) => Promise<void>; readImages: () => Promise<Attachment[]>; onReference: (id: string) => Promise<void>; run: (work: () => Promise<void>) => Promise<void>; className: string; buttonClassName: string;
}) {
  const { token, sessionIdentity, isCurrentSession } = useSession(); const { handoff, dismiss } = useIncoming();
  const [selected, setSelected] = useState<string[] | null>(null), [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (!handoff) return null;
  // Keep the user's selection stable as successful imports change the draft.
  const ids = handoff.imageIds || [], chosen = selected ?? (ids.length <= 4 ? ids : []);
  const importWork = async () => {
    if (!token || disabled || !handoff.postId) return;
    const identity = sessionIdentity;
    const current = () => alive.current && isCurrentSession(identity);
    if (chosen.length > 4) { setError("助手每次最多四张待发送图片，请减少选择。"); return; }
    setError("");
    await run(async () => {
      try {
        const post = await communityApi.post(token, handoff.postId!);
        if (!current()) return;
        const available = new Set(post.images.map(image => image.id));
        if (chosen.some(id => !available.has(id))) throw new Error("社区作品的图片已发生变化，请返回原帖重新准备。");
        let existing = await readImages();
        if (!current()) return;
        const prepared: { file: File; sha256: string }[] = [];
        for (const assetId of chosen) {
          const image = post.images.find(image => image.id === assetId)!;
          // Original JPEG/PNG hashes can be compared before fetching bytes.
          if (image.mimeType !== "image/webp" && existing.some(item => item.sha256 === image.sha256)) continue;
          const blob = await communityApi.imageBlob(token, assetId, true);
          if (!current()) return;
          const file = await assistantFile(blob, image.filename);
          if (!current()) return;
          const sha256 = await assistantImageFingerprint(file);
          if (!current()) return;
          if (!existing.some(item => item.sha256 === sha256) && !prepared.some(item => item.sha256 === sha256)) prepared.push({ file, sha256 });
        }
        if (prepared.length > 4 - existing.length) throw new Error("助手每次最多四张待发送图片，请减少选择或先移除已有图片。");
        for (const { file, sha256 } of prepared) {
          if (!current()) return;
          await onImage(file);
          if (!current()) return;
          existing = await readImages();
          if (!current()) return;
          if (!existing.some(item => item.sha256 === sha256)) throw new Error("图片尚未获服务器确认，请核对附件状态后再导入。");
        }
        if (!current()) return;
        if (post.galleryReference?.state === "AVAILABLE") await onReference(post.galleryReference.paintingId);
        if (!current()) return;
        onText(handoff.text + `\n\n社区来源：${window.location.origin}/community/posts/${post.id}`);
        dismiss();
      } catch (error) { if (current()) setError(error instanceof Error ? error.message : errorMessage(error)); }
    });
  };
  return <section className={className} aria-label="社区作品导入"><p>从社区带来的《{handoff.title || "未命名作品"}》</p><p>导入后可编辑问题、检查图片，再主动发送给模型。WebP 图片会转为 PNG。</p>
    {ids.length ? <fieldset style={{ border: 0, padding: 0, display: "flex", gap: 12, flexWrap: "wrap" }}><legend>选择要分析的图片（最多四张）</legend>{ids.map((id, index) => <label key={id}><input type="checkbox" checked={chosen.includes(id)} disabled={disabled} onChange={event => setSelected(event.target.checked ? [...chosen, id] : chosen.filter(value => value !== id))} /> 第 {index + 1} 张</label>)}</fieldset> : null}
    {error ? <p role="alert">{error}</p> : null}<button type="button" className={buttonClassName} disabled={disabled || chosen.length > 4} onClick={() => void importWork()}>{textPresent ? "导入作品并替换文字草稿" : "导入作品与问题"}</button><button type="button" className={buttonClassName} disabled={disabled} style={{ marginLeft: 18 }} onClick={dismiss}>暂不导入</button>
  </section>;
}
export function CommunityShareReply({ text, className }: { text: string; className: string }) {
  const { user } = useSession(); const router = useRouter(); const [error, setError] = useState("");
  if (!text.trim()) return null;
  return <><button type="button" className={className} onClick={() => {
    try { saveCommunityHandoff(sessionStorage, String(user?.id), { target: "community", text, title: "与国画助手的一次讨论" }); router.push("/community?from=assistant"); }
    catch { setError("浏览器暂时无法准备社区草稿，请稍后再试。"); }
  }}>整理为社区草稿 ↗</button>{error ? <p role="status">{error}</p> : null}</>;
}
