"use client";
import { useCallback, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useReadResource } from "@/components/use-read-resource";
import { StatePanel } from "@/components/state-panel";
import { LoadingStatus } from "@/components/loading";
import { communityApi } from "@/lib/community";
import { CommunityDialog } from "./community-media";

function SourceDialog({ commentId, close }: { commentId: string; close: () => void }) {
  const { token } = useSession();
  const loader = useCallback((signal: AbortSignal) => communityApi.comment(token!, commentId, signal), [token, commentId]);
  const read = useReadResource("community-source-comment:" + commentId, loader);
  return <CommunityDialog title="原始点评" close={close}>{read.loading ? <LoadingStatus label="正在读取原始点评" /> : null}{read.error ? <StatePanel compact kind="error" title="原点评暂不可读" description={read.error} actionLabel="重新读取" onAction={read.retry} /> : null}{read.data ? <article><strong>{read.data.authorName}</strong><p className="community-field-hint">{read.data.dimension} · {new Date(read.data.createdAt).toLocaleString("zh-CN")}</p><p className="community-content">{read.data.content}</p>{read.data.suggestion ? <blockquote className="community-reference">{read.data.suggestion}</blockquote> : null}</article> : null}</CommunityDialog>;
}
export function CommunitySourceLink({ commentId, children }: { commentId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <><a href={`#comment-${commentId}`} onClick={event => {
    if (document.getElementById(`comment-${commentId}`)) return;
    event.preventDefault(); setOpen(true);
  }}>{children}</a>{open ? <SourceDialog commentId={commentId} close={() => setOpen(false)} /> : null}</>;
}
