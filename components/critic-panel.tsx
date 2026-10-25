"use client";

import { StatePanel } from "@/components/state-panel";
import type { CritiqueState } from "@/lib/painting-insights";

function TextList({ title, items }: { title: string; items: string[] }) {
  return items.length ? <div><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null;
}

export function CriticPanel({ state, imageAvailable, onSubmit, onRead }: {
  state: CritiqueState;
  imageAvailable: boolean;
  onSubmit: () => void;
  onRead: () => void;
}) {
  const busy = state.state === "loading" || state.state === "submitting";
  const canSubmit = imageAvailable && state.capability?.submissionAvailable === true
    && (state.state === "missing" || state.state === "failure");
  const report = state.task?.result;
  return (
    <div className="guide-result">
      {state.state === "loading" ? <StatePanel compact kind="loading" title="正在读取已有评析" /> : null}
      {state.state === "submitting" ? <StatePanel compact kind="pending" title="正在提交评析" /> : null}
      {state.state === "active" ? <StatePanel compact kind="pending" title={state.task?.status === "QUEUED" ? "评析正在排队" : "正在评析这幅作品"} description="可离开页面后重新进入查看进度，不需要重复提交。" /> : null}
      {state.state === "missing" ? <p>这幅作品尚未保存你的智能评析。</p> : null}
      {state.state === "failure" ? <StatePanel compact kind="error" title="本次评析未完成" description={state.task?.errorMessage || "请查看任务状态，或手动重新发起评析。"} /> : null}
      {state.state === "unknown" ? <StatePanel compact kind="pending" title="评析状态尚未确认" description="保留已有记录，请稍后重新读取。" /> : null}
      {state.error ? <p className="inline-error" role="alert">{state.error}</p> : null}
      {state.capabilityError ? <p className="inline-error" role="alert">暂时无法确认生成能力：{state.capabilityError}</p> : null}
      {!imageAvailable ? <p>当前作品没有可供评析的有效图像。</p> : null}
      {state.capability?.submissionAvailable === false ? <p>当前无法发起新的评析，已有结果仍可查看。</p> : null}
      {state.task?.legacyOriginalStatus ? <p>此任务来自历史记录；其原始状态为 {state.task.legacyOriginalStatus}。</p> : null}
      {report ? (
        <div>
          {report.partial ? <p>本次结果包含部分评析，请结合观看限制阅读。</p> : null}
          {report.workOverview ? <p>{report.workOverview}</p> : null}
          <div className="guide-sections">{report.dimensions.map((dimension) => (
            <article key={dimension.dimensionId}>
              <h3>{dimension.dimensionName}</h3><p>{dimension.conclusion}</p>
              <TextList title="画面依据" items={dimension.evidence} />
              <TextList title="特点与长处" items={dimension.strengths} />
              <TextList title="局限" items={dimension.limitations} />
            </article>
          ))}</div>
          {report.holisticAssessment ? <div className="detail-section"><h3>综合评价</h3><p>{report.holisticAssessment}</p></div> : null}
          <TextList title="共识" items={report.consensus} />
          <TextList title="不同观点" items={report.disagreements} />
          <TextList title="改进建议" items={report.improvementSuggestions} />
          <TextList title="观看限制" items={report.viewingLimitations} />
        </div>
      ) : null}
      <div className="detail-actions">
        {canSubmit ? <button className="button button-primary" type="button" onClick={onSubmit}>{state.state === "failure" ? "重新发起评析" : "开始智能评析"}</button> : null}
        <button className="button" type="button" disabled={busy} onClick={onRead}>读取已有评析</button>
      </div>
    </div>
  );
}
