"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useReadResource } from "@/components/use-read-resource";
import { PendingIndicator } from "@/components/loading";
import { StatePanel } from "@/components/state-panel";
import { communityApi, type CommunityFilters } from "@/lib/community";
import { communityFilters, communityHref } from "@/lib/community-filters";
import { CommunityLoading } from "./community-loading";
import { CommunityComposer } from "./community-compose";
import { CommunityCases, CommunityFeed, CommunityNotifications, CommunitySidebar } from "./community-feed";
import { CommunityDetail } from "./community-detail";
import { useCommunityActions } from "./use-community-actions";
import "./community.css";

export function CommunityScreen({ postId, initialPaintingId = null, initialSearch = "" }: { postId?: string; initialPaintingId?: string | null; initialSearch?: string }) {
  const { token, user } = useSession(); const actions = useCommunityActions();
  const [filters, setFilters] = useState(() => communityFilters(initialSearch));
  const loader = useCallback((signal: AbortSignal) => communityApi.capabilities(token!, signal), [token]);
  const capability = useReadResource("community-capabilities", loader, Boolean(token));
  const enabled = capability.data?.posts === true && capability.data.actor.id === String(user?.id) && !capability.error;
  useEffect(() => {
    const restore = () => setFilters(communityFilters(window.location.search));
    window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore);
  }, []);
  const update = (value: Partial<CommunityFilters>) => {
    const next = { ...filters, ...value }; setFilters(next);
    window.history.replaceState(window.history.state, "", communityHref(next));
  };
  const props = capability.data ? { capabilities: capability.data, actions, filters, update } : null;
  return <>
    {actions.message ? <p role="status" className="community-notice">{actions.message}</p> : null}
    {actions.pending ? <div className="community-notice">{actions.sending ? <span><PendingIndicator />正在保存，请稍候。</span> : <><span>有一项操作需要核对结果。</span><button className="text-button" type="button" onClick={() => void actions.check()}>核对操作结果</button></>}</div> : null}
    {capability.loading && !capability.data ? <CommunityLoading /> : capability.error ? <StatePanel kind="unavailable" title="社区暂时不可用" description={capability.error} actionLabel="重新连接社区" onAction={capability.retry} /> : !enabled || !props ? <StatePanel kind="unavailable" title="社区暂未开放" description="暂时无法确认当前账号的社区访问能力。" /> : postId ? <CommunityDetail key={postId} postId={postId} actions={actions} capabilities={props.capabilities} /> : <>
      <div className="community-layout"><CommunitySidebar {...props} />
        {filters.tab === "notifications" && props.capabilities.notifications ? <CommunityNotifications {...props} /> : filters.tab === "cases" && props.capabilities.cases ? <CommunityCases {...props} /> : <CommunityFeed {...props} />}
        <CommunityComposer actions={actions} capabilities={props.capabilities} initialPaintingId={initialPaintingId} />
      </div>
    </>}
  </>;
}
