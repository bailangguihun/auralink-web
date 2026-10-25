"use client";

import { StatePanel } from "@/components/state-panel";
import type { GuideState } from "@/lib/painting-insights";
import type { PaintingGuide } from "@/lib/types";

const sectionLabels: Record<keyof PaintingGuide["sections"], string> = {
  artistAndEra: "画家与时代",
  subjectAndScene: "题材与场景",
  composition: "构图",
  brushworkAndInk: "笔墨",
  colorAndMaterial: "设色与材质",
  artisticConception: "艺术意境",
  culturalMeaning: "文化意涵",
  musicAssociation: "音乐联想",
};

type GuidePanelProps = GuideState & {
  onGenerate: () => void;
  onRetry: () => void;
};

export function GuidePanel({ guide, state, error, onGenerate, onRetry }: GuidePanelProps) {
  if (state === "loading") return <StatePanel compact kind="loading" title="正在查找已生成导览" />;
  if (state === "missing") {
    return <StatePanel compact kind="empty" title="这幅作品尚无导览" description="点击生成后，可阅读作品的构图、笔墨与文化意涵。" actionLabel="生成作品导览" onAction={onGenerate} />;
  }
  if (state === "generating") return <StatePanel compact kind="pending" title="正在生成作品导览" description="请稍候；离开页面后可重新进入查看已保存的结果。" />;
  const readError = state === "error" ? <StatePanel compact kind="error" title="作品导览读取未完成" description={error || undefined} actionLabel="重试读取" onAction={onRetry} /> : null;
  if (!guide) return readError;

  const sections = Object.entries(guide.sections).filter(
    (entry): entry is [keyof PaintingGuide["sections"], string] => Boolean(entry[1]),
  );

  return (
    <div className="guide-result">
      {readError}
      {"resultScope" in guide ? (
        <div className="state-panel state-pending state-compact"><div>
          <h3>历史导览</h3><p>此导览基于早期资料生成，与当前作品资料的一致性尚未核实。</p>
          {state === "historical" ? <button className="button" type="button" onClick={onGenerate}>依据当前资料生成导览</button> : null}
        </div></div>
      ) : null}
      <div className="guide-summary"><span>{"cacheStatus" in guide && guide.cacheStatus === "GENERATED" ? "新生成" : "作品导览"}</span><p>{guide.summary}</p></div>
      {guide.highlights.length ? <ul className="guide-highlights">{guide.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}
      <div className="guide-sections">
        {sections.map(([key, value]) => <article key={key}><h3>{sectionLabels[key]}</h3><p>{value}</p></article>)}
      </div>
      {guide.knowledgeReferences.length ? (
        <div className="guide-references"><h3>知识依据</h3><ul>{guide.knowledgeReferences.map((reference) => <li key={`${reference.sourceType}:${reference.sourceId}`}>{reference.title} <span>{reference.sourceType}</span></li>)}</ul></div>
      ) : null}
      <p className="guide-time">更新于 {new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(guide.updatedAt))}</p>
      <button className="button" type="button" onClick={onRetry}>刷新导览</button>
    </div>
  );
}
