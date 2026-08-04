const uploadModerationConfig = {
  // Demo switch: when true, skip frontend moderation model loading and use a fake 2-4s review delay.
  disableFrontendModerationModel: true,
  mockReviewDelayMs: {
    min: 2000,
    max: 4000,
  },
  modelPath: '/models/default-f16/model.json',
  outputNodes: ['output1', 'output2', 'output3'],
  resolution: [1280, 720],
  minScore: 0.2,
  maxResults: 50,
  iouThreshold: 0.5,
  thresholds: {
    nudeScore: 0.38,
    sexyScore: 0.75,
    criticalPartScore: 0.25,
    minSexyPartsForBlock: 2,
    maxReasonItems: 4,
  },
  backend: {
    preferWebGPU: true,
    enableWebglShapesUniforms: true,
    allowWasmFallback: true,
    wasmPath: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist/',
  },
  labels: [
    'exposed anus',
    'exposed armpits',
    'belly',
    'exposed belly',
    'buttocks',
    'exposed buttocks',
    'female face',
    'male face',
    'feet',
    'exposed feet',
    'breast',
    'exposed breast',
    'vagina',
    'exposed vagina',
    'male breast',
    'exposed penis',
  ],
  composite: {
    person: [6, 7],
    sexy: [1, 2, 3, 4, 8, 9, 10, 14],
    nude: [0, 5, 11, 12, 13, 15],
    critical: [12, 13, 15],
  },
};

export default uploadModerationConfig;
