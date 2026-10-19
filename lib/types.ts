export type LegacyApiResponse<T> = {
  success: boolean;
  message?: string | null;
  data?: T | null;
};

export type AuthRequest = {
  username: string;
  password: string;
};

export type RegisterRequest = AuthRequest & {
  fullName: string;
  email: string;
};

export type AuthResponse = {
  token: string;
  userId: number;
  username: string;
  fullName: string | null;
};

export type UserProfile = {
  id: number;
  username: string;
  fullName: string | null;
  email: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PaintingImage = {
  assetId: string;
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  contentUrl: string;
  downloadUrl: string;
};

export type PaintingSummary = {
  paintingId: string;
  title: string | null;
  authorName: string | null;
  creationDynastyRaw: string | null;
  creationDynastyNormalized: string | null;
  category: string | null;
  subject: string | null;
  paintingSchool: string | null;
  style: string | null;
  artisticConception: string | null;
  imageAvailable: boolean;
  image: PaintingImage | null;
  favorited: boolean;
};

export type PaintingDetail = PaintingSummary & {
  sourceSequence: string | null;
  imageStorageName: string | null;
  authorBirthYear: string | null;
  authorBirthPlace: string | null;
  authorSchool: string | null;
  creationYear: string | null;
  actualSize: string | null;
  collectionInstitution: string | null;
  color: string | null;
  composition: string | null;
  brushwork: string | null;
  inkMethod: string | null;
  paintingMaterial: string | null;
  pigment: string | null;
  seal: string | null;
  culturalSymbol: string | null;
  generatedText: string | null;
  musicSceneDescription: string | null;
  collectionPlatform: string | null;
  visibleInGallery: boolean;
  status: string;
};

export type PaintingPage = {
  items: PaintingSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  hasNext: boolean;
  orderDate?: string | null;
};

export type GuideSections = {
  artistAndEra: string | null;
  subjectAndScene: string | null;
  composition: string | null;
  brushworkAndInk: string | null;
  colorAndMaterial: string | null;
  artisticConception: string | null;
  culturalMeaning: string | null;
  musicAssociation: string | null;
};

export type GuideKnowledgeReference = {
  sourceId: string;
  sourceType: string;
  title: string;
};

export type PaintingGuide = {
  paintingId: string;
  schemaVersion: string;
  summary: string;
  sections: GuideSections;
  highlights: string[];
  knowledgeReferences: GuideKnowledgeReference[];
  cacheStatus: "HIT" | "GENERATED";
  generatedAt: string;
  updatedAt: string;
};

export type HistoricalPaintingGuide = Omit<PaintingGuide, "cacheStatus"> & {
  resultScope: "HISTORICAL_LEGACY";
  inputProvenance: "LEGACY_PARTIAL";
  currentApplicability: "UNVERIFIED";
};

export type CritiqueCapability = { submissionAvailable: boolean; reason: string };
export type CritiqueDimension = {
  dimensionId: string;
  dimensionName: string;
  conclusion: string;
  evidence: string[];
  strengths: string[];
  limitations: string[];
};
export type CritiqueReport = {
  workOverview: string;
  dimensions: CritiqueDimension[];
  consensus: string[];
  disagreements: string[];
  holisticAssessment: string;
  improvementSuggestions: string[];
  viewingLimitations: string[];
  partial: boolean;
};
export type PaintingCritiqueTask = {
  critiqueId: string;
  paintingId: string;
  profile: "authoritative_four" | "requested_four";
  status: string;
  legacyOriginalStatus: string | null;
  reused: boolean;
  result: CritiqueReport | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type PaintingQuery = {
  keyword?: string;
  dynasty?: string;
  category?: string;
  author?: string;
  subject?: string;
  page?: number;
  size?: number;
  sort?: "source" | "title" | "author" | "dynasty" | "daily";
  direction?: "asc" | "desc";
  orderDate?: string;
};

export type WorkflowModality =
  | "TEXT_DESCRIPTION"
  | "POEM"
  | "IMAGE"
  | "PAINTING"
  | "AUDIO"
  | "VIDEO";

export type WorkflowOperation =
  | "TEXT_TO_PAINTING"
  | "POEM_TO_PAINTING"
  | "IMAGE_TO_PAINTING"
  | "PAINTING_TO_MUSIC"
  | "PAINTING_TO_POEM"
  | "PAINTING_TO_VIDEO";

export type WorkflowLifecycleStatus = "DRAFT" | "ACTIVE";

export type WorkflowGraphNode = {
  id: string;
  kind: "SOURCE" | "TRANSFORM";
  operation?: WorkflowOperation;
  providerCode?: string;
  inputModality?: WorkflowModality;
  outputModality: WorkflowModality;
  parameters?: Record<string, unknown>;
};

export type WorkflowGraphEdge = { from: string; to: string };

export type WorkflowGraph = {
  schemaVersion: number;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowDefinitionInput = {
  name: string;
  description: string | null;
  status?: WorkflowLifecycleStatus;
  graph: WorkflowGraph;
};

export type WorkflowProviderCapability = {
  code: string;
  displayName: string;
  definitionEnabled: boolean | null;
  executionAvailable: boolean | null;
  parameterSchema: unknown;
};

export type WorkflowOperationCapability = {
  code: string;
  displayName: string;
  inputModality: string;
  outputModality: string;
  definitionEnabled: boolean | null;
  draftEnabled: boolean | null;
  executionAvailable: boolean | null;
  terminalOutput: boolean | null;
  availabilityReason: string | null;
  /** Optional server-declared product scope beyond the graph's structural rules. */
  executionConstraint?: string | null;
  providers: WorkflowProviderCapability[];
};

export type WorkflowCapabilities = {
  workflowSchemaVersion: number | null;
  featureEnabled: boolean | null;
  maxVisibleCards: number | null;
  maxTransformSteps: number | null;
  maxExecutionTransformSteps: number | null;
  sourceModalities: string[];
  operations: WorkflowOperationCapability[];
};

export type WorkflowSummary = {
  workflowId: string;
  name: string;
  description: string | null;
  schemaVersion: number;
  sourceModality: WorkflowModality;
  terminalModality: WorkflowModality;
  nodeCount: number;
  status: WorkflowLifecycleStatus;
  conversionRequired: boolean;
  updatedAt: string;
  createdAt: string;
};

export type WorkflowPage = {
  items: WorkflowSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  hasNext: boolean;
};

export type WorkflowDetail = WorkflowSummary & {
  graph: WorkflowGraph;
  edgeCount: number;
  operationSequence: string[];
};

export type MediaAsset = {
  assetId: string;
  originalFilename: string | null;
  mimeType: string;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  assetType: string;
  semanticType: string;
  sourceType: string;
  visibility: string;
  status: string;
  contentUrl: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type CreationStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL_SUCCESS" | "FAILED";

export type CreationSource = {
  modality: WorkflowModality;
  text?: string;
  assetId?: string;
  paintingId?: string;
};

export type CreationSubmission = {
  workflowId: string;
  source: CreationSource;
};

export type CreationQueued = {
  creationId: string;
  status: string;
};

export type CreationPoem = {
  schemaVersion: string;
  /** A valid structured poem may deliberately be untitled. */
  title: string | null;
  lines: string[];
  text: string;
};

export type CreationStep = {
  stepId: string;
  stepIndex: number;
  nodeId: string;
  operation: string;
  inputModality: string;
  outputModality: string;
  status: string;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  outputAssetId: string | null;
  outputAssetContentUrl: string | null;
  outputAssetDownloadUrl: string | null;
  outputText: string | null;
  outputPoem: CreationPoem | null;
  /** Exact server-validated request duration for a PAINTING_TO_MUSIC step. */
  requestedDurationSeconds?: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type CreationSummary = {
  creationId: string;
  workflowId: string | null;
  workflowName: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  recoveryState: string;
  sourceModality: string;
  sourcePaintingId: string | null;
  sourceAssetId: string | null;
  finalModality: string | null;
  finalAssetId: string | null;
  finalAssetContentUrl: string | null;
  finalAssetDownloadUrl: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  retryVersion: number;
  retryAvailable: boolean;
  retryBlockedReason: string | null;
  executionAttemptCount: number;
};

export type CreationDetail = CreationSummary & {
  sourcePaintingTitle: string | null;
  sourcePaintingContentUrl: string | null;
  sourceText: string | null;
  sourceAssetContentUrl: string | null;
  sourceAssetDownloadUrl: string | null;
  finalText: string | null;
  finalPoem: CreationPoem | null;
  steps: CreationStep[];
};

export type CreationPage = {
  items: CreationSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  hasNext: boolean;
};

export type CreationRetry = {
  creationId: string;
  status: string;
  retryVersion: number;
  executionAttemptNumber: number;
  acceptedAt: string;
  idempotentReplay: boolean;
};
