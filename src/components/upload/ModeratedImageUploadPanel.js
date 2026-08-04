'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import uploadModerationConfig from '@/config/uploadModeration';

const MODEL_CACHE_NAME = 'upload-moderation-model-v1';
const UPLOAD_TEXT = {
  ZH: {
    privatePart: '私密部位',
    armpits: '腋下',
    belly: '腹部',
    exposedBelly: '大片裸露的腹部',
    buttocks: '臀部',
    exposedButtocks: '裸露的臀部',
    feet: '脚部',
    exposedFeet: '裸露的脚部',
    breast: '胸部',
    exposedBreast: '裸露的胸部',
    vagina: '阴部',
    exposedVagina: '裸露的阴部',
    maleBreast: '男性胸部',
    exposedPenis: '裸露的生殖器',
    sensitivePart: '色情敏感部位',
    violationWithParts: (parts) => `您的图片中可能存在${parts.join('、')}等违规内容。`,
    violationGeneric: '您的图片中可能存在色情等违规内容。',
    backendInitFailed: (errors) => `审核后端初始化失败：${errors.join(' | ')}`,
    unmounted: '页面已卸载，取消审核模型初始化',
    initFailed: '系统初始化失败，请刷新后重试。',
    imageOnly: '仅支持图片文件，请重新选择。',
    processing: '图片处理中，请稍候...',
    blocked: '图片涉嫌违规，已自动移除，请重新上传。',
    blockedLine: '图片涉嫌违规，已自动移除。',
    blockedRetry: '请重新选择图片后再上传。',
    approved: '图片审核通过，请继续上传',
    moderationFailed: '图片审核失败，请稍后重试。',
    missingSession: '缺少会话参数，请重新扫码。',
    missingFile: '请先选择一张图片。',
    systemUnavailable: '系统暂不可用，请稍后重试。',
    uploading: '上传中，请稍候...',
    uploadFailed: '上传失败',
    uploadSuccess: '上传成功，请返回展台继续体验',
    uploadFailedRetry: '上传失败，请稍后重试。',
    title: '展台图片上传',
    desc: '请选择一张图片上传到展台设备。',
    sessionLabel: '会话 ID：',
    noSession: '未提供',
    chooseImage: '选择图片',
    previewAlt: '预览图',
    reviewing: '正在处理并审核图片...',
    uploadingShort: '上传中...',
    completed: '上传已完成',
    uploadButton: '上传到展台',
    modalTitle: '上传提示',
    confirm: '确定',
  },
  EN: {
    privatePart: 'private body area',
    armpits: 'armpits',
    belly: 'abdomen',
    exposedBelly: 'large exposed abdomen area',
    buttocks: 'buttocks',
    exposedButtocks: 'exposed buttocks',
    feet: 'feet',
    exposedFeet: 'exposed feet',
    breast: 'chest area',
    exposedBreast: 'exposed chest area',
    vagina: 'private body area',
    exposedVagina: 'exposed private body area',
    maleBreast: 'male chest area',
    exposedPenis: 'exposed genital area',
    sensitivePart: 'sensitive content',
    violationWithParts: (parts) => `The image may contain restricted content such as ${parts.join(', ')}.`,
    violationGeneric: 'The image may contain restricted sensitive content.',
    backendInitFailed: (errors) => `Image review backend failed to initialize: ${errors.join(' | ')}`,
    unmounted: 'The page was closed, so image review initialization was cancelled.',
    initFailed: 'The system is not ready. Refresh and try again.',
    imageOnly: 'Only image files are supported. Please choose another file.',
    processing: 'Processing image. Please wait...',
    blocked: 'The image may violate upload rules and was removed. Please choose another image.',
    blockedLine: 'The image may violate upload rules and was removed.',
    blockedRetry: 'Please choose another image before uploading.',
    approved: 'Image review passed. Continue to upload.',
    moderationFailed: 'Image review failed. Please try again later.',
    missingSession: 'Missing session parameter. Please scan the QR code again.',
    missingFile: 'Please choose an image first.',
    systemUnavailable: 'The system is temporarily unavailable. Please try again later.',
    uploading: 'Uploading. Please wait...',
    uploadFailed: 'Upload failed',
    uploadSuccess: 'Upload complete. Return to the kiosk to continue.',
    uploadFailedRetry: 'Upload failed. Please try again later.',
    title: 'Kiosk Image Upload',
    desc: 'Choose an image to send to the kiosk.',
    sessionLabel: 'Session ID: ',
    noSession: 'Not provided',
    chooseImage: 'Choose image',
    previewAlt: 'Preview image',
    reviewing: 'Processing and reviewing image...',
    uploadingShort: 'Uploading...',
    completed: 'Upload complete',
    uploadButton: 'Upload to Kiosk',
    modalTitle: 'Upload Notice',
    confirm: 'OK',
  },
};

const getUploadText = (language) => UPLOAD_TEXT[language === 'EN' ? 'EN' : 'ZH'];
let tfRuntimePromise = null;

function loadTfRuntime() {
  if (!tfRuntimePromise) {
    tfRuntimePromise = import('@tensorflow/tfjs');
  }
  return tfRuntimePromise;
}

function getMockReviewDelay() {
  const minDelay = uploadModerationConfig.mockReviewDelayMs?.min ?? 2000;
  const maxDelay = uploadModerationConfig.mockReviewDelayMs?.max ?? 4000;
  const lower = Math.max(0, Math.min(minDelay, maxDelay));
  const upper = Math.max(lower, maxDelay);
  return lower + Math.random() * (upper - lower);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getAbsoluteAssetUrl(path) {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

async function openModelCache() {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    return await caches.open(MODEL_CACHE_NAME);
  } catch {
    return null;
  }
}

async function cacheFirstFetch(cacheStore, input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  if (cacheStore) {
    const cached = await cacheStore.match(url);
    if (cached) return cached;
  }

  const response = await fetch(input, { cache: 'force-cache', ...init });
  if (!response.ok) {
    throw new Error(`模型资源下载失败：${response.status} ${response.statusText}`);
  }

  if (cacheStore) {
    try {
      await cacheStore.put(url, response.clone());
    } catch {
      // Ignore cache put errors and continue with runtime response.
    }
  }
  return response;
}

async function prefetchModelAssetsSequentially(modelPath) {
  const modelUrl = getAbsoluteAssetUrl(modelPath);
  const cacheStore = await openModelCache();
  const modelResponse = await cacheFirstFetch(cacheStore, modelUrl);
  const modelJson = await modelResponse.clone().json();

  const shardUrls = (modelJson.weightsManifest || [])
    .flatMap((manifest) => manifest.paths || [])
    .map((relativePath) => new URL(relativePath, modelUrl).toString());

  for (const shardUrl of shardUrls) {
    // Download every shard one-by-one so refresh/network interruption keeps completed progress.
    await cacheFirstFetch(cacheStore, shardUrl);
  }

  return { cacheStore };
}

function getTopScore(parts) {
  if (!parts.length) return 0;
  return Math.max(...parts.map((item) => item.score));
}

function getReadablePartName(partClass, text) {
  const nameMap = {
    'exposed anus': text.privatePart,
    'exposed armpits': text.armpits,
    'belly': text.belly,
    'exposed belly': text.exposedBelly,
    'buttocks': text.buttocks,
    'exposed buttocks': text.exposedButtocks,
    'feet': text.feet,
    'exposed feet': text.exposedFeet,
    'breast': text.breast,
    'exposed breast': text.exposedBreast,
    'vagina': text.vagina,
    'exposed vagina': text.exposedVagina,
    'male breast': text.maleBreast,
    'exposed penis': text.exposedPenis,
  };
  return nameMap[partClass] || text.sensitivePart;
}

function buildViolationSummary(nudeParts, sexyParts, text) {
  const lines = [];
  const merged = [...nudeParts, ...sexyParts]
    .sort((a, b) => b.score - a.score)
    .slice(0, uploadModerationConfig.thresholds.maxReasonItems);

  const uniquePartNames = [...new Set(merged.map((part) => getReadablePartName(part.class, text)))].slice(0, 3);

  if (uniquePartNames.length > 0) {
    lines.push(text.violationWithParts(uniquePartNames));
  } else {
    lines.push(text.violationGeneric);
  }

  // if (topPart) {
  //   lines.push(`其中最明显的疑似区域为“${topPartName}”。`);
  // }

  // if (nudeParts.length > 0) {
  //   lines.push(`系统检测到较高风险的裸露区域（最高置信度 ${(getTopScore(nudeParts) * 100).toFixed(1)}%）。`);
  // } else if (sexyParts.length > 0) {
  //   lines.push(`系统检测到较高风险的敏感区域（最高置信度 ${(getTopScore(sexyParts) * 100).toFixed(1)}%）。`);
  // }

  return lines;
}

async function processPrediction(tf, boxesTensor, scoresTensor, classesTensor, inputTensor) {
  const boxes = await boxesTensor.array();
  const scores = await scoresTensor.data();
  const classes = await classesTensor.data();
  const nmsTensor = await tf.image.nonMaxSuppressionAsync(
    boxes[0],
    scores,
    uploadModerationConfig.maxResults,
    uploadModerationConfig.iouThreshold,
    uploadModerationConfig.minScore,
  );
  const nms = await nmsTensor.data();
  tf.dispose(nmsTensor);

  const parts = [];
  for (const boxIndex of nms) {
    const classId = classes[boxIndex];
    const box = boxes[0][boxIndex];
    parts.push({
      score: scores[boxIndex],
      id: classId,
      class: uploadModerationConfig.labels[classId] || `class-${classId}`,
      box: [
        Math.trunc(box[0]),
        Math.trunc(box[1]),
        Math.trunc(box[3] - box[1]),
        Math.trunc(box[2] - box[0]),
      ],
    });
  }

  return {
    input: { width: inputTensor.shape[2], height: inputTensor.shape[1] },
    person: parts.some((item) => uploadModerationConfig.composite.person.includes(item.id)),
    sexy: parts.some((item) => uploadModerationConfig.composite.sexy.includes(item.id)),
    nude: parts.some((item) => uploadModerationConfig.composite.nude.includes(item.id)),
    parts,
  };
}

export default function ModeratedImageUploadPanel({ sessionId, apiBaseUrl, language = 'ZH' }) {
  const text = useMemo(() => getUploadText(language), [language]);
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef('');
  const modelRef = useRef(null);
  const tfRef = useRef(null);
  const initPromiseRef = useRef(null);
  const unmountedRef = useRef(false);
  const moderationTaskIdRef = useRef(0);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [prechecking, setPrechecking] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [modelState, setModelState] = useState('loading');
  const [sessionLocked, setSessionLocked] = useState(false);
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [violationLines, setViolationLines] = useState([]);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
  }, []);

  const releaseModel = useCallback(() => {
    if (modelRef.current) {
      modelRef.current.dispose();
      modelRef.current = null;
    }
  }, []);

  const clearSelection = useCallback(() => {
    setFile(null);
    setPreviewUrl('');
    revokePreview();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [revokePreview]);

  const resolveBackend = useCallback(async (tf) => {
    const errors = [];
    const hasWebGpu =
      uploadModerationConfig.backend.preferWebGPU &&
      typeof navigator !== 'undefined' &&
      !!navigator.gpu &&
      !!tf.engine().registryFactory?.webgpu;

    if (hasWebGpu) {
      try {
        await tf.setBackend('webgpu');
        await tf.ready();
        return 'webgpu';
      } catch (error) {
        errors.push(`webgpu: ${error?.message || text.initFailed}`);
      }
    }

    try {
      if (uploadModerationConfig.backend.enableWebglShapesUniforms) {
        tf.env().set('WEBGL_USE_SHAPES_UNIFORMS', true);
      }
      await tf.setBackend('webgl');
      await tf.ready();
      return 'webgl';
    } catch (error) {
      errors.push(`webgl: ${error?.message || text.initFailed}`);
    }

    if (uploadModerationConfig.backend.allowWasmFallback) {
      try {
        const wasmBackend = await import('@tensorflow/tfjs-backend-wasm');
        if (uploadModerationConfig.backend.wasmPath) {
          wasmBackend.setWasmPaths(uploadModerationConfig.backend.wasmPath);
        }
        await tf.setBackend('wasm');
        await tf.ready();
        return 'wasm';
      } catch (error) {
        errors.push(`wasm: ${error?.message || text.initFailed}`);
      }
    }

    throw new Error(text.backendInitFailed(errors));
  }, [text]);

  const initModel = useCallback(async () => {
    if (modelRef.current) return modelRef.current;
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = (async () => {
      try {
        setModelState('loading');
        const tf = await loadTfRuntime();
        tfRef.current = tf;
        await resolveBackend(tf);
        const { cacheStore } = await prefetchModelAssetsSequentially(uploadModerationConfig.modelPath);
        const model = await tf.loadGraphModel(uploadModerationConfig.modelPath, {
          fetchFunc: (input, init) => cacheFirstFetch(cacheStore, input, init),
        });
        if (unmountedRef.current) {
          model.dispose();
        throw new Error(text.unmounted);
        }
        modelRef.current = model;
        setModelState('ready');
        return model;
      } catch (error) {
        setModelState('error');
        setMessageType('error');
        setMessage(text.initFailed);
        throw error;
      }
    })();

    try {
      return await initPromiseRef.current;
    } finally {
      initPromiseRef.current = null;
    }
  }, [resolveBackend, text.initFailed, text.unmounted]);

  const moderateFile = useCallback(async (selectedFile) => {
    if (uploadModerationConfig.disableFrontendModerationModel) {
      await sleep(getMockReviewDelay());
      return {
        blocked: false,
        result: null,
        reasons: [],
      };
    }

    const model = await initModel();
    let tf = tfRef.current;
    if (!tf) {
      tf = await loadTfRuntime();
      tfRef.current = tf;
    }
    const imageBitmap = await createImageBitmap(selectedFile);

    const tensors = {};
    let outputTensors = null;

    try {
      tensors.buffer = await tf.browser.fromPixelsAsync(imageBitmap);
      const [targetWidth, targetHeight] = uploadModerationConfig.resolution;
      const shouldResize =
        targetWidth > 0 &&
        targetHeight > 0 &&
        (targetWidth !== imageBitmap.width || targetHeight !== imageBitmap.height);

      tensors.resize = shouldResize
        ? tf.image.resizeNearestNeighbor(tensors.buffer, [targetHeight, targetWidth])
        : tensors.buffer;
      tensors.cast = tf.cast(tensors.resize, 'float32');
      tensors.batch = tf.expandDims(tensors.cast, 0);

      outputTensors = await model.executeAsync(tensors.batch, uploadModerationConfig.outputNodes);
      const [boxesTensor, scoresTensor, classesTensor] = outputTensors;
      const result = await processPrediction(tf, boxesTensor, scoresTensor, classesTensor, tensors.cast);

      const nudeParts = result.parts.filter(
        (item) =>
          uploadModerationConfig.composite.nude.includes(item.id) &&
          item.score >= uploadModerationConfig.thresholds.nudeScore,
      );
      const sexyParts = result.parts.filter(
        (item) =>
          uploadModerationConfig.composite.sexy.includes(item.id) &&
          item.score >= uploadModerationConfig.thresholds.sexyScore,
      );
      const criticalParts = result.parts.filter(
        (item) =>
          uploadModerationConfig.composite.critical?.includes(item.id) &&
          item.score >= uploadModerationConfig.thresholds.criticalPartScore,
      );
      const reasonNudeParts = Array.from(
        new Map(
          [...nudeParts, ...criticalParts].map((item) => [
            `${item.id}-${item.box.join(',')}`,
            item,
          ]),
        ).values(),
      );
      const blocked =
        criticalParts.length > 0 ||
        nudeParts.length > 0 ||
        sexyParts.length >= uploadModerationConfig.thresholds.minSexyPartsForBlock;

      return {
        blocked,
        result,
        reasons: buildViolationSummary(reasonNudeParts, sexyParts, text),
      };
    } finally {
      if (Array.isArray(outputTensors)) {
        outputTensors.forEach((tensor) => tf.dispose(tensor));
      } else if (outputTensors) {
        tf.dispose(outputTensors);
      }
      const uniqueTensors = new Set(Object.values(tensors).filter(Boolean));
      uniqueTensors.forEach((tensor) => tf.dispose(tensor));
      imageBitmap.close();
    }
  }, [initModel, text]);

  useEffect(() => {
    unmountedRef.current = false;
    if (uploadModerationConfig.disableFrontendModerationModel) {
      setModelState('ready');
    } else {
      void initModel();
    }

    return () => {
      unmountedRef.current = true;
      releaseModel();
      revokePreview();
    };
  }, [initModel, releaseModel, revokePreview]);

  const onFileChange = useCallback(async (event) => {
    if (sessionLocked) return;

    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith('image/')) {
      clearSelection();
      setMessageType('error');
      setMessage(text.imageOnly);
      return;
    }

    const currentTaskId = moderationTaskIdRef.current + 1;
    moderationTaskIdRef.current = currentTaskId;

    setPrechecking(true);
    setMessageType('info');
    setMessage(text.processing);

    const nextPreviewUrl = URL.createObjectURL(selected);

    try {
      const moderation = await moderateFile(selected);
      if (unmountedRef.current || moderationTaskIdRef.current !== currentTaskId) {
        URL.revokeObjectURL(nextPreviewUrl);
        return;
      }

      if (moderation.blocked) {
        URL.revokeObjectURL(nextPreviewUrl);
        clearSelection();
        setMessageType('error');
        setMessage(text.blocked);
        setViolationLines([
          text.blockedLine,
          ...moderation.reasons,
          text.blockedRetry,
        ]);
        setViolationModalOpen(true);
        return;
      }

      revokePreview();
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
      setFile(selected);
      setMessageType('success');
      setMessage(text.approved);
    } catch (error) {
      URL.revokeObjectURL(nextPreviewUrl);
      clearSelection();
      setMessageType('error');
      setMessage(text.moderationFailed);
    } finally {
      if (moderationTaskIdRef.current === currentTaskId) {
        setPrechecking(false);
      }
    }
  }, [clearSelection, moderateFile, revokePreview, sessionLocked, text.approved, text.blocked, text.blockedLine, text.blockedRetry, text.imageOnly, text.moderationFailed, text.processing]);

  const submitUpload = useCallback(async () => {
    if (sessionLocked) return;

    if (!sessionId) {
      setMessageType('error');
      setMessage(text.missingSession);
      return;
    }

    if (!file) {
      setMessageType('error');
      setMessage(text.missingFile);
      return;
    }

    if (modelState !== 'ready') {
      setMessageType('error');
      setMessage(text.systemUnavailable);
      return;
    }

    setUploading(true);
    setMessage(text.uploading);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBaseUrl}/upload-session/${encodeURIComponent(sessionId)}/image`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || text.uploadFailed);
      }

      setSessionLocked(true);
      if (fileInputRef.current) {
        fileInputRef.current.disabled = true;
      }
      releaseModel();
      setMessageType('success');
      setMessage(text.uploadSuccess);
    } catch (error) {
      setMessageType('error');
      setMessage(text.uploadFailedRetry);
    } finally {
      setUploading(false);
    }
  }, [apiBaseUrl, file, modelState, releaseModel, sessionId, sessionLocked, text.missingFile, text.missingSession, text.systemUnavailable, text.uploadFailed, text.uploadFailedRetry, text.uploadSuccess, text.uploading]);

  const interactionDisabled = useMemo(
    () => sessionLocked || uploading || prechecking,
    [prechecking, sessionLocked, uploading],
  );

  const uploadDisabled =
    interactionDisabled || !sessionId || !file || modelState !== 'ready';

  return (
    <>
      <section className="w-full max-w-2xl border border-amber-700/40 bg-zinc-900/80 backdrop-blur p-6 md:p-8 space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold text-amber-300">{text.title}</h1>
        <p className="text-zinc-300 text-base md:text-lg">
          {text.desc}
        </p>
        <p className="text-zinc-500 text-sm break-all">{text.sessionLabel}{sessionId || text.noSession}</p>
      </header>

      <div className="space-y-4">
        <label className="block text-sm text-zinc-400">{text.chooseImage}</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          disabled={interactionDisabled || modelState === 'error' || !sessionId}
          className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded-none file:border file:border-amber-700/50 file:bg-zinc-800 file:px-4 file:py-2 file:text-zinc-100 hover:file:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {previewUrl ? (
        <div className="border border-zinc-700 p-3 bg-zinc-950/80">
          <Image
            src={previewUrl}
            alt={text.previewAlt}
            width={1280}
            height={720}
            unoptimized
            className="w-full max-h-[360px] object-contain"
          />
        </div>
      ) : null}

      {message ? (
        <div
          className={`border px-4 py-3 text-sm ${
            messageType === 'success'
              ? 'border-emerald-600/60 text-emerald-300 bg-emerald-950/20'
              : messageType === 'error'
                ? 'border-red-600/60 text-red-300 bg-red-950/20'
                : 'border-zinc-600 text-zinc-300 bg-zinc-800/40'
          }`}
        >
          {message}
        </div>
      ) : null}

        <button
          type="button"
          onClick={submitUpload}
          disabled={uploadDisabled}
          className="w-full h-14 bg-amber-500 text-zinc-900 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {prechecking
            ? text.reviewing
            : uploading
              ? text.uploadingShort
              : sessionLocked
                ? text.completed
                : text.uploadButton}
        </button>
      </section>

      {violationModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 px-4">
          <div className="w-full max-w-xl border border-amber-700/50 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-700 px-5 py-4">
              <h2 className="text-xl font-semibold text-amber-300">{text.modalTitle}</h2>
            </div>
            <div className="space-y-2 px-5 py-4 text-zinc-200">
              {violationLines.map((line, index) => (
                <p key={`${line}-${index}`} className="text-sm md:text-base leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
            <div className="flex justify-end border-t border-zinc-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setViolationModalOpen(false)}
                className="h-10 min-w-24 bg-amber-500 px-4 text-sm font-semibold text-zinc-900 hover:bg-amber-400"
              >
                {text.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
