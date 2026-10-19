export const paintingId = "11111111-1111-4111-8111-111111111111";
export const critiqueId = "22222222-2222-4222-8222-222222222222";
export const guidePayload = {
  paintingId, schemaVersion: "1", summary: "山水景致与笔墨相映。",
  sections: {
    artistAndEra: "作者与年代待核实。", subjectAndScene: "山川与水岸。", composition: "远近相照。",
    brushworkAndInk: "淡墨。", colorAndMaterial: null, artisticConception: "清远。", culturalMeaning: null, musicAssociation: null,
  },
  highlights: ["远近层次"], knowledgeReferences: [{ sourceId: "example", sourceType: "fixture", title: "合成资料" }],
  cacheStatus: "HIT", generatedAt: "2026-10-19T00:00:00.000Z", updatedAt: "2026-10-19T00:00:00.000Z",
};
export const historicalGuidePayload = {
  ...Object.fromEntries(Object.entries(guidePayload).filter(([key]) => key !== "cacheStatus")),
  resultScope: "HISTORICAL_LEGACY", inputProvenance: "LEGACY_PARTIAL", currentApplicability: "UNVERIFIED",
};
export function critiquePayload(status = "SUCCEEDED") {
  return {
    critiqueId, paintingId, profile: "authoritative_four", status, legacyOriginalStatus: null, reused: false,
    result: status === "SUCCEEDED" ? {
      meta: { scoring_used: false, profile: "authoritative_four", partial: false },
      report: {
        work_overview: "合成山水评析。",
        dimension_assessments: ["qiyun_yijing", "bimo_se_cai_zaoxing", "style_tradition_innovation", "composition_space"].map((id) => ({
          dimension_id: id, dimension_name: id, conclusion: "结论仅用于本地测试。", evidence: ["合成画面依据"], strengths: ["层次清晰"], limitations: [],
        })),
        consensus: ["意境清远"], disagreements: [], holistic_assessment: "整体结构完整。",
        improvement_suggestions: ["加强笔墨变化"], viewing_limitations: ["本示例不代表真实模型评析"],
      },
      expert_assessments: [],
    } : null,
    errorCode: status === "FAILED" ? "INTERRUPTED" : null,
    errorMessage: status === "FAILED" ? "任务中断" : null,
    createdAt: "2026-10-19T00:00:00Z", startedAt: null, finishedAt: status === "SUCCEEDED" ? "2026-10-19T00:01:00Z" : null,
  };
}
