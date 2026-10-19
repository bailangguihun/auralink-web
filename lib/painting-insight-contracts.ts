import type {
  CritiqueCapability, CritiqueReport, GuideSections, HistoricalPaintingGuide,
  PaintingCritiqueTask, PaintingGuide,
} from "./types.ts";

export class PaintingInsightContractError extends Error {
  constructor() { super("作品解读返回格式不完整，请重新读取已有结果。"); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PaintingInsightContractError();
  return value as Record<string, unknown>;
}
function string(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) throw new PaintingInsightContractError();
  return value;
}
function nullableString(value: unknown): string | null { return (value === null || value === undefined) ? null : string(value, true); }
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new PaintingInsightContractError();
  return value.map((entry) => string(entry));
}
// The Critic schema accepts list[str], including blank entries. Omit empty
// bullets without rejecting the otherwise valid persisted report.
function critiqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new PaintingInsightContractError();
  return value.map((entry) => string(entry, true)).filter((entry) => entry.trim().length > 0);
}
function timestamp(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new PaintingInsightContractError();
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new PaintingInsightContractError();
  return value;
}
function paintingIdentity(value: unknown, expected: string): string {
  const id = string(value);
  if (id !== expected) throw new PaintingInsightContractError();
  return id;
}

function guideBase(value: unknown, paintingId: string) {
  const row = record(value);
  const source = record(row.sections);
  const sections = Object.fromEntries([
    "artistAndEra", "subjectAndScene", "composition", "brushworkAndInk",
    "colorAndMaterial", "artisticConception", "culturalMeaning", "musicAssociation",
  ].map((key) => [key, nullableString(source[key])])) as GuideSections;
  if (!Array.isArray(row.knowledgeReferences)) throw new PaintingInsightContractError();
  return {
    paintingId: paintingIdentity(row.paintingId, paintingId), schemaVersion: string(row.schemaVersion),
    summary: string(row.summary), sections, highlights: strings(row.highlights),
    knowledgeReferences: row.knowledgeReferences.map((entry) => {
      const ref = record(entry);
      return { sourceId: string(ref.sourceId), sourceType: string(ref.sourceType), title: string(ref.title) };
    }),
    generatedAt: timestamp(row.generatedAt), updatedAt: timestamp(row.updatedAt),
  };
}

export function parsePaintingGuide(value: unknown, paintingId: string): PaintingGuide {
  const row = record(value);
  if (row.cacheStatus !== "HIT" && row.cacheStatus !== "GENERATED") throw new PaintingInsightContractError();
  return { ...guideBase(value, paintingId), cacheStatus: row.cacheStatus };
}

export function parseHistoricalPaintingGuide(value: unknown, paintingId: string): HistoricalPaintingGuide {
  const row = record(value);
  if (row.resultScope !== "HISTORICAL_LEGACY" || row.inputProvenance !== "LEGACY_PARTIAL" || row.currentApplicability !== "UNVERIFIED") {
    throw new PaintingInsightContractError();
  }
  return { ...guideBase(value, paintingId), resultScope: row.resultScope, inputProvenance: row.inputProvenance, currentApplicability: row.currentApplicability };
}

export function parseCritiqueCapability(value: unknown): CritiqueCapability {
  const row = record(value);
  return { submissionAvailable: boolean(row.submissionAvailable), reason: string(row.reason) };
}

const dimensionNames = {
  qiyun_yijing: "气韵与意境", bimo_se_cai_zaoxing: "笔墨、设色与造型",
  style_tradition_innovation: "风格、传统与创变", composition_space: "章法与空间经营",
  work_quality: "作品质量", painting_technique: "绘画技法", style: "风格", composition: "构图",
};

function parseReport(value: unknown, profile: PaintingCritiqueTask["profile"]): CritiqueReport {
  const response = record(value);
  const meta = record(response.meta);
  if (meta.scoring_used !== false || meta.profile !== profile) throw new PaintingInsightContractError();
  const report = record(response.report);
  const expected = profile === "authoritative_four"
    ? ["qiyun_yijing", "bimo_se_cai_zaoxing", "style_tradition_innovation", "composition_space"]
    : ["work_quality", "painting_technique", "style", "composition"];
  if (!Array.isArray(report.dimension_assessments) || report.dimension_assessments.length !== 4) throw new PaintingInsightContractError();
  const byId = new Map(report.dimension_assessments.map((entry) => {
    const dimension = record(entry);
    return [string(dimension.dimension_id), dimension] as const;
  }));
  if (byId.size !== 4 || expected.some((id) => !byId.has(id))) throw new PaintingInsightContractError();
  return {
    workOverview: string(report.work_overview, true),
    dimensions: expected.map((id) => {
      const dimension = byId.get(id)!;
      return {
        dimensionId: id, dimensionName: dimensionNames[id as keyof typeof dimensionNames],
        conclusion: string(dimension.conclusion), evidence: critiqueStrings(dimension.evidence),
        strengths: critiqueStrings(dimension.strengths), limitations: critiqueStrings(dimension.limitations),
      };
    }),
    consensus: critiqueStrings(report.consensus), disagreements: critiqueStrings(report.disagreements),
    holisticAssessment: string(report.holistic_assessment, true),
    improvementSuggestions: critiqueStrings(report.improvement_suggestions), viewingLimitations: critiqueStrings(report.viewing_limitations),
    partial: (meta.partial === null || meta.partial === undefined) ? false : boolean(meta.partial),
  };
}

export function parsePaintingCritiqueTask(value: unknown, paintingId: string, critiqueId?: string): PaintingCritiqueTask {
  const row = record(value);
  if (row.profile !== "authoritative_four" && row.profile !== "requested_four") throw new PaintingInsightContractError();
  const id = string(row.critiqueId);
  if (critiqueId !== undefined && id !== critiqueId) throw new PaintingInsightContractError();
  const status = string(row.status);
  if (status === "SUCCEEDED" && (row.result === null || row.result === undefined)) throw new PaintingInsightContractError();
  return {
    critiqueId: id, paintingId: paintingIdentity(row.paintingId, paintingId), profile: row.profile, status,
    legacyOriginalStatus: nullableString(row.legacyOriginalStatus), reused: boolean(row.reused),
    result: (row.result === null || row.result === undefined) ? null : parseReport(row.result, row.profile),
    errorCode: nullableString(row.errorCode), errorMessage: nullableString(row.errorMessage),
    createdAt: timestamp(row.createdAt), startedAt: (row.startedAt === null || row.startedAt === undefined) ? null : timestamp(row.startedAt),
    finishedAt: (row.finishedAt === null || row.finishedAt === undefined) ? null : timestamp(row.finishedAt),
  };
}
