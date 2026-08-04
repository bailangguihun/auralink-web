'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, CardFooter, Button, Select, SelectItem, Spinner, Divider, Textarea, Slider, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Switch, Input } from "@heroui/react";
import { toast } from 'sonner';
import ReactPlayer from 'react-player';
import Navbar from '@/components/Navbar';
import ImagePreviewModal from '@/components/ImagePreviewModal';
import { motion } from 'framer-motion';
import { Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { IconPlayerPlay, IconMusic, IconPlus, IconTrash, IconFileText, IconPhoto, IconHeadphones, IconArrowRight, IconSettings, IconX, IconEdit, IconRotateClockwise, IconClearAll, IconClock, IconTool, IconChevronDown, IconChevronUp, IconAdjustments } from '@tabler/icons-react';
import Image from 'next/image';
import config from '@/config';
import { 
  getConfigForModel, 
  hasAdvancedSettings, 
  getDefaultSettings, 
  validateSettingValue, 
  validateAllSettings 
} from '@/config/advancedSettings';
import MoyinYinsheng from '../models/MoyinYinsheng';
import MoyinXiansi from '../models/MoyinXiansi';
import MusicGenSmall from '../models/MusicGenSmall';
import MusicGenMedium from '../models/MusicGenMedium';
import MusicGenLarge from '../models/MusicGenLarge';
import PoetryToProse from '../models/PoetryToProse';
import ProseToPoetry from '../models/ProseToPoetry';
import PaintingToProse from '../models/PaintingToProse';
import ProseToPainting from '../models/ProseToPainting';
import Moyuqingyi from '../models/moyuqingyi';
import Huaxufanyan from '../models/huaxufanyan';
import Mojuanjieyu from '../models/mojuanjieyu';

const { Dragger } = Upload;

// 后端API地址
const API_BASE_URL = config.api.baseUrl;

// 根据模型ID获取API提供商名称
const getAPIProviderFromModelId = (modelId) => {
  const providerMap = {
    'blip2-base': 'BLIP',
    'llava-7b': 'Meta',
    'stable-diffusion-xl': 'StabilityAI',
    'stable-diffusion-3': 'StabilityAI', 
    'midjourney-v6': 'Midjourney',
    'whisper-base': 'OpenAI',
    'wav2vec2-base': 'Meta',
    'music-tagging': 'Generic',
    'controlnet-canny': 'ControlNet',
    'controlnet-depth': 'ControlNet', 
    'controlnet-pose': 'ControlNet',
    'ip-adapter': 'IPAdapter',
    'instructpix2pix': 'InstructPix2Pix',
    'gpt4-turbo': 'OpenAI',
    'claude-3.5-sonnet': 'Anthropic',
    'claude-3.5-haiku': 'Anthropic',
    'gemini-pro': 'Google',
    'llama-3-7b': 'Meta',
    'qwen-7b': 'Alibaba',
    'poetry-to-prose-ds': 'Coze',
    'prose-to-poetry-ds': 'Coze',
    'poetry-to-prose-kimi': 'Coze',
    'prose-to-poetry-kimi': 'Coze',
    'poetry-to-prose-doubao': 'Coze',
    'prose-to-poetry-doubao': 'Coze',
    'painting-to-prose': 'Coze',
    'moyundanqing1': 'Coze',
    'moyundanqing2': 'Coze',
    'moyundanqing3': 'Coze',
    'moyuqingyi': 'Coze',
    'huaxufanyan': 'Coze',
    'mojuanjieyu': 'Coze',
    'musicgen-small': '画音智链团队自建',
    'musicgen-medium': '画音智链团队自建',
    'musicgen-large': '画音智链团队自建',
  };
  return providerMap[modelId] || 'Unknown';
};

// 处理API返回结果并上传文件的通用方法
const inferExtensionFromMime = (mimeType, fallback = '.txt') => {
  if (!mimeType) return fallback;
  if (mimeType.startsWith('image/')) {
    const subtype = mimeType.split('/')[1]?.split(';')[0] || 'png';
    return `.${subtype === 'jpeg' ? 'jpg' : subtype}`;
  }
  if (mimeType.startsWith('audio/')) {
    const subtype = mimeType.split('/')[1]?.split(';')[0] || 'mp3';
    return `.${subtype}`;
  }
  if (mimeType.startsWith('text/')) {
    return '.txt';
  }
  if (mimeType === 'application/pdf') {
    return '.pdf';
  }
  return fallback;
};

const processAndUploadResult = async (result, logId, apiProvider, taskType, processingTime) => {
  if (typeof result !== 'string') {
    return;
  }
  
  // 对于文生文和图生文任务，即使是纯文本也需要上传同步
  const isTextOutputTask = taskType === 'TEXT_TO_TEXT' || taskType === 'MULTIMODAL_CHAT' || taskType === 'IMAGE_TO_TEXT';
  const isImageToTextTask = taskType === 'IMAGE_TO_TEXT';
  
  const isPlainText = !result.includes('/') && 
                     !result.startsWith('data:') && 
                     !result.includes('.') &&
                     !/^[A-Za-z0-9+/]+=*$/.test(result); 
  
  // 如果是纯文本但不是文本输出任务，则跳过上传
  if (isPlainText && !isTextOutputTask) {
    return;
  }
  
  // 对于文本输出任务的纯文本，强制设置为文档类型
  if (isTextOutputTask && isPlainText) {
    // 直接处理为文本文档，不需要额外判断
  }
  
  let contentType = 'document';
  let fileExtension = '.txt';
  let base64Data = '';
  const fileNameBase = `${apiProvider.toLowerCase()}_generated_${Date.now()}`;
  
  try {
    if (result.startsWith('data:')) {
      const [headerPart, dataPart] = result.split(',');
      const mimeMatch = headerPart.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      
      if (mimeType.startsWith('audio/')) {
        contentType = 'audio';
        fileExtension = mimeType.includes('wav') ? '.wav' : '.mp3';
      } else if (mimeType.startsWith('image/')) {
        contentType = 'image';
        fileExtension = mimeType.includes('png') ? '.png' : '.jpg';
      } else if (mimeType.startsWith('text/')) {
        contentType = 'document';
        fileExtension = '.txt';
      }
      
      base64Data = dataPart;
      fileExtension = inferExtensionFromMime(mimeType, fileExtension);

      // 图生文结果应作为文本记录，避免误判为图片
      if (isImageToTextTask && contentType !== 'audio') {
        contentType = 'document';
        fileExtension = '.txt';
      }
    }
    else if (result.startsWith('/')) {
      if (result.includes('/audios/') || result.includes('.mp3') || result.includes('.wav')) {
        contentType = 'audio';
        fileExtension = result.includes('.wav') ? '.wav' : '.mp3';
      } else if (result.includes('/images/') || result.includes('.png') || result.includes('.jpg')) {
        contentType = 'image';
        fileExtension = result.includes('.png') ? '.png' : '.jpg';
      }
      
      const fileResponse = await fetch(result);
      if (fileResponse.ok) {
        const responseContentType = fileResponse.headers.get('content-type') || '';
        if ((!responseContentType && fileExtension === '.txt') || responseContentType) {
          const inferredExt = inferExtensionFromMime(responseContentType, fileExtension);
          if (inferredExt && inferredExt !== fileExtension) {
            fileExtension = inferredExt;
            if (responseContentType.startsWith('image/')) {
              contentType = 'image';
            } else if (responseContentType.startsWith('audio/')) {
              contentType = 'audio';
            }
          }
        }

        const blob = await fileResponse.blob();
        if (blob.type && (fileExtension === '.txt' || fileExtension === '.bin')) {
          const inferredExtFromBlob = inferExtensionFromMime(blob.type, fileExtension);
          if (inferredExtFromBlob !== fileExtension) {
            fileExtension = inferredExtFromBlob;
            if (blob.type.startsWith('image/')) {
              contentType = 'image';
            } else if (blob.type.startsWith('audio/')) {
              contentType = 'audio';
            }
          }
        }

        base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });
      } else {
        return;
      }
    }
    else if (result.startsWith('http://') || result.startsWith('https://')) {
      let responseContentType = '';
      if (result.includes('.mp3') || result.includes('.wav')) {
        contentType = 'audio';
        fileExtension = result.includes('.wav') ? '.wav' : '.mp3';
      } else if (result.includes('.png') || result.includes('.jpg') || result.includes('.jpeg') || result.includes('.webp')) {
        contentType = 'image';
        fileExtension = result.includes('.png') ? '.png' : result.includes('.webp') ? '.webp' : '.jpg';
      } else {
        fileExtension = '.bin';
      }

      const fileResponse = await fetch(result, { headers: { Accept: 'application/octet-stream,image/*,audio/*' } });
      if (fileResponse.ok) {
        responseContentType = fileResponse.headers.get('content-type') || '';
        if (responseContentType) {
          fileExtension = inferExtensionFromMime(responseContentType, fileExtension);
          if (responseContentType.startsWith('image/')) {
            contentType = 'image';
          } else if (responseContentType.startsWith('audio/')) {
            contentType = 'audio';
          } else if (responseContentType.startsWith('text/')) {
            contentType = 'document';
            fileExtension = '.txt';
          }
        }

        const blob = await fileResponse.blob();
        if (blob.type && blob.type !== 'application/octet-stream') {
          const blobExt = inferExtensionFromMime(blob.type, fileExtension);
          if (blobExt !== fileExtension) {
            fileExtension = blobExt;
            if (blob.type.startsWith('image/')) {
              contentType = 'image';
            } else if (blob.type.startsWith('audio/')) {
              contentType = 'audio';
            }
          }
        }

        base64Data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(blob);
        });
      } else {
        return;
      }
    }
    else if (/^[A-Za-z0-9+/]+=*$/.test(result)) {
      if (isImageToTextTask) {
        contentType = 'document';
        fileExtension = '.txt';
      } else if (taskType === 'MUSIC_GENERATION' || taskType.includes('MUSIC')) {
        contentType = 'audio';
        fileExtension = '.mp3';
      } else if (taskType === 'TEXT_TO_IMAGE' || taskType.includes('IMAGE')) {
        contentType = 'image';
        fileExtension = '.png';
      }
      
      base64Data = result;
    }
    else {
      contentType = 'document';
      fileExtension = '.txt';
      base64Data = btoa(unescape(encodeURIComponent(result)));
    }

    if (base64Data) {
      if (contentType === 'document') {
        const isImageTask = (taskType === 'TEXT_TO_IMAGE' || taskType.includes('IMAGE')) && !isImageToTextTask;
        if (isImageTask) {
          contentType = 'image';
          if (fileExtension === '.txt' || fileExtension === '.bin') {
            fileExtension = '.png';
          }
        } else if (taskType === 'TEXT_TO_MUSIC' || taskType.includes('MUSIC')) {
          contentType = 'audio';
          if (fileExtension === '.txt' || fileExtension === '.bin') {
            fileExtension = '.mp3';
          }
        }
      }

      const finalFileName = `${fileNameBase}${fileExtension}`;
      const uploadResponse = await authenticatedFetch(`${API_BASE_URL}/upload-result`, {
        method: 'POST',
        body: JSON.stringify({
          logId: logId,
          contentType: contentType,
          fileExtension: fileExtension,
          fileName: finalFileName,
          base64Data: base64Data,
          description: `${apiProvider} API生成的${contentType === 'audio' ? '音频' : contentType === 'image' ? '图像' : '文档'}内容`,
          metadata: JSON.stringify({
            processingTimeMs: processingTime,
            taskType: taskType,
            originalDataType: result.startsWith('data:') ? 'dataURL' :
                            result.startsWith('/') ? 'filePath' :
                            (result.startsWith('http://') || result.startsWith('https://')) ? 'url' :
                            /^[A-Za-z0-9+/]+=*$/.test(result) ? 'base64' : 'text'
          })
        })
      });
      
      if (uploadResponse.ok) {
        const uploadData = await uploadResponse.json();
        return uploadData.data?.relativePath; 
      } else {
        await uploadResponse.text();
      }
    }
    
  } catch (error) {
    throw error;
  }
};


// 通用第三方API使用记录方法
const recordThirdPartyAPIUsage = async (taskType, apiProvider, inputData, apiCall) => {
  const startTime = Date.now();
  let logId = null;

  // 输出数据截断，避免过长的base64或文本撑爆日志
  const buildOutputSnapshot = (result, finalResult) => {
    const toPreview = (val, limit = 500) => {
      if (typeof val !== 'string') return val;
      return val.length > limit ? `${val.slice(0, limit)}...[截断]` : val;
    };

    return {
      type: typeof result,
      preview: toPreview(result),
      finalResult: toPreview(finalResult),
    };
  };

  const updateRecordWithOutput = async ({ processingTimeMs, resultUrl, outputData }) => {
    if (!logId) return;
    try {
      await authenticatedFetch(`${API_BASE_URL}/record`, {
        method: 'POST',
        body: JSON.stringify({
          logId,
          success: true,
          processingTimeMs,
          resultUrl: resultUrl || undefined,
          outputData: outputData ? JSON.stringify(outputData) : undefined,
        }),
      });
    } catch (_) {
      // 记录输出失败不阻断主流程
    }
  };
  
  try {
    // 构建详细的输入数据记录
    const detailedInputData = {
      ...inputData,
      // 如果有实际的输入内容，也记录下来
      actualInput: typeof inputData.actualInput === 'string' ? 
        (inputData.actualInput.length > 1000 ? 
          inputData.actualInput.substring(0, 1000) + '...[截断]' : 
          inputData.actualInput) : 
        inputData.actualInput,
      inputTimestamp: new Date().toISOString(),
      taskDetails: {
        taskType: taskType,
        modelId: inputData.modelId,
        inputType: inputData.inputType || 'unknown'
      }
    };
    
    const recordResponse = await authenticatedFetch(`${API_BASE_URL}/record`, {
      method: 'POST',
      body: JSON.stringify({
        taskType: taskType,
        apiSource: 'THIRD_PARTY',
        apiProvider: apiProvider,
        inputData: JSON.stringify(detailedInputData),
        success: true,
        processingTimeMs: 0,
        metadata: JSON.stringify({
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          inputDataSize: JSON.stringify(detailedInputData).length
        })
      })
    });
    
    if (!recordResponse.ok) {
      await recordResponse.text();
    } else {
      const recordData = await recordResponse.json();
      logId = recordData.data?.logId;
    }
    
    const result = await apiCall();
    const processingTime = Date.now() - startTime;
    
    let finalResult = result;
    if (logId && result) {
      try {
        // 对于文生文和图生文任务，我们仍然需要上传文件用于记录，但返回原始文本内容
        const isTextOutputTask = taskType === 'TEXT_TO_TEXT' || taskType === 'MULTIMODAL_CHAT' || taskType === 'IMAGE_TO_TEXT';
        
        if (isTextOutputTask && typeof result === 'string') {
          // 上传文件用于记录，但不改变返回值
          await processAndUploadResult(result, logId, apiProvider, taskType, processingTime);
          // 直接返回文本内容，不返回文件路径
          finalResult = result;
        } else {
          // 对于其他任务类型，按原逻辑处理
          const uploadedPath = await processAndUploadResult(result, logId, apiProvider, taskType, processingTime);
          if (uploadedPath) {
            finalResult = uploadedPath;
          }
        }

        // 将生成结果补充回日志，便于前端展示输出
        await updateRecordWithOutput({
          processingTimeMs: processingTime,
          resultUrl: typeof finalResult === 'string' ? finalResult : undefined,
          outputData: buildOutputSnapshot(result, finalResult),
        });
      } catch (uploadError) {
        // Handle upload error silently
      }
    }
    
    return finalResult;
    
  } catch (error) {
    const processingTime = Date.now() - startTime;

    if (logId) {
      try {
        await authenticatedFetch(`${API_BASE_URL}/record`, {
          method: 'POST',
          body: JSON.stringify({
            taskType: taskType,
            apiSource: 'THIRD_PARTY',
            apiProvider: apiProvider,
            inputData: JSON.stringify(inputData),
            success: false,
            processingTimeMs: processingTime,
            errorMessage: error.message,
            metadata: JSON.stringify({
              errorStack: error.stack,
              timestamp: new Date().toISOString(),
              logId: logId 
            })
          })
        });
      } catch (recordError) {
        // Handle record error silently
      }
    } else {
      try {
        await authenticatedFetch(`${API_BASE_URL}/record`, {
          method: 'POST',
          body: JSON.stringify({
            taskType: taskType,
            apiSource: 'THIRD_PARTY',
            apiProvider: apiProvider,
            inputData: JSON.stringify(inputData),
            success: false,
            processingTimeMs: processingTime,
            errorMessage: error.message,
            metadata: JSON.stringify({
              errorStack: error.stack,
              timestamp: new Date().toISOString()
            })
          })
        });
      } catch (recordError) {
        // Handle record error silently
      }
    }
    
    throw error;
  }
};

// 节点类型定义
const NODE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image', 
  MUSIC: 'music'
};

// 任务类型定义
const TASK_TYPES = {
  TEXT_TO_IMAGE: 'text-to-image',
  TEXT_TO_MUSIC: 'text-to-music',
  IMAGE_TO_TEXT: 'image-to-text',
  IMAGE_TO_MUSIC: 'image-to-music',
  MUSIC_TO_TEXT: 'music-to-text',
  IMAGE_TO_IMAGE: 'image-to-image',
  TEXT_TO_TEXT: 'text-to-text'
};

// 模型定义（包含真实API和MOCK）
const MODELS = {
  [TASK_TYPES.IMAGE_TO_TEXT]: [
    { id: 'moyinxiansi', name: '墨韵弦思', type: 'real', description: '画音智链团队自研图像音乐描述生成模型' },
    { id: 'moyuqingyi', name: '墨语轻译', type: 'real', description: '将国画图像转换为白话描述' },
    { id: 'huaxufanyan', name: '画叙凡言', type: 'real', description: '将国画图像转换为白话描述' },
    { id: 'mojuanjieyu', name: '墨卷解语', type: 'real', description: '将国画图像转换为白话描述' },
    { id: 'blip2-base', name: 'BLIP-2 Base', type: 'mock', description: '基础图像理解模型' },
    { id: 'llava-7b', name: 'LLaVA-7B', type: 'mock', description: 'Meta开源多模态视觉语言模型' },
  ],
  [TASK_TYPES.IMAGE_TO_MUSIC]: [
    { id: 'moyinyinsheng-small', name: '墨韵音声-small', type: 'real', description: '画音智链团队自研轻量级音乐生成模型' },
    { id: 'moyinyinsheng-medium', name: '墨韵音声-medium', type: 'real', description: '画音智链团队自研平衡性能音乐生成模型' },
    { id: 'moyinyinsheng-large', name: '墨韵音声-large', type: 'real', description: '画音智链团队自研高质量音乐生成模型' },
  ],
  [TASK_TYPES.TEXT_TO_IMAGE]: [
    { id: 'moyundanqing1', name: '墨韵丹青(1:1)', type: 'real', description: '诗词生成国画风格图像,图像比例为1:1 (2048*2048)' },
    { id: 'moyundanqing2', name: '墨韵丹青(4:3)', type: 'real', description: '诗词生成国画风格图像,图像比例为4:3 (2304x1728)' },
    { id: 'moyundanqing3', name: '墨韵丹青(9:16)', type: 'real', description: '诗词生成国画风格图像,图像比例为9:16 (1440x2560)' },
  ],
  [TASK_TYPES.TEXT_TO_MUSIC]: [
    { id: 'musicgen-small', name: 'MusicGen Small', type: 'real', description: '轻量音乐生成模型' },
    { id: 'musicgen-medium', name: 'MusicGen Medium', type: 'real', description: '中等规模音乐生成' },
    { id: 'musicgen-large', name: 'MusicGen Large', type: 'real', description: '大型音乐生成模型' },
  ],
  [TASK_TYPES.MUSIC_TO_TEXT]: [
    { id: 'whisper-base', name: 'Whisper Base', type: 'mock', description: '基础语音识别模型' },
    { id: 'wav2vec2-base', name: 'Wav2Vec 2.0 Base', type: 'mock', description: '自监督语音模型' },
    { id: 'music-tagging', name: 'Music Tagging Model', type: 'mock', description: '音乐标签识别模型' }
  ],
  [TASK_TYPES.IMAGE_TO_IMAGE]: [
    { id: 'controlnet-canny', name: 'ControlNet Canny', type: 'mock', description: '边缘控制生成' },
    { id: 'controlnet-depth', name: 'ControlNet Depth', type: 'mock', description: '深度控制生成' },
    { id: 'controlnet-pose', name: 'ControlNet Pose', type: 'mock', description: '姿态控制生成' },
    { id: 'ip-adapter', name: 'IP-Adapter', type: 'mock', description: '图像提示适配器' },
    { id: 'instructpix2pix', name: 'InstructPix2Pix', type: 'mock', description: '指令式图像编辑' }
  ],
  [TASK_TYPES.TEXT_TO_TEXT]: [
    { id: 'poetry-to-prose-ds', name: '诗映凡言（DeepSeek-V3.1）', type: 'real', description: '使用DeepSeek-V3.1将古诗词转换为白话文' },
    { id: 'prose-to-poetry-ds', name: '语化清辞（DeepSeek-V3.1）', type: 'real', description: '使用DeepSeek-V3.1将白话文转换为诗词' },
    { id: 'poetry-to-prose-kimi', name: '诗映凡言（KIMI·K2）', type: 'real', description: '使用KIMI·K2将古诗词转换为白话文' },
    { id: 'prose-to-poetry-kimi', name: '语化清辞（KIMI·K2）', type: 'real', description: '使用KIMI·K2将白话文转换为诗词' },
    { id: 'poetry-to-prose-doubao', name: '诗映凡言（豆包·1.6）', type: 'real', description: '使用豆包·1.6将古诗词转换为白话文' },
    { id: 'prose-to-poetry-doubao', name: '语化清辞（豆包·1.6）', type: 'real', description: '使用豆包·1.6将白话文转换为诗词' },
    // { id: 'gpt4-turbo', name: 'GPT-4 Turbo', type: 'mock', description: 'OpenAI最新语言模型' },
    // { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', type: 'mock', description: 'Anthropic推理模型' },
    // { id: 'claude-3.5-haiku', name: 'Claude 3.5 Haiku', type: 'mock', description: '快速响应模型' },
    // { id: 'gemini-pro', name: 'Gemini Pro', type: 'mock', description: 'Google多模态模型' },
    { id: 'llama-3-7b', name: 'Llama 3 7B', type: 'mock', description: 'Meta开源大模型' },
    { id: 'qwen-7b', name: 'Qwen 7B', type: 'mock', description: '阿里云通义千问' }
  ]
};

// 获取默认可用模型（跳过 mock 占位模型）
const getDefaultModelId = (taskType) => {
  const models = MODELS[taskType] || [];
  const usableModel = models.find(model => model.type !== 'mock');
  return usableModel ? usableModel.id : null;
};

// 根据前后节点类型确定任务类型
const getTaskType = (fromType, toType) => {
  const key = `${fromType}-to-${toType}`;
  const taskTypeKey = key.toUpperCase().replace(/-/g, '_');
  const taskType = TASK_TYPES[taskTypeKey];
  
  return taskType || null;
};

// 动画变量
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

// 判断是否为音乐生成任务
const isMusicGenerationTask = (task) => {
  return task === TASK_TYPES.TEXT_TO_MUSIC || task === TASK_TYPES.IMAGE_TO_MUSIC;
};



// 获取任务名称
const getTaskName = (taskType) => {
  const taskNames = {
    [TASK_TYPES.TEXT_TO_IMAGE]: '文生图',
    [TASK_TYPES.TEXT_TO_MUSIC]: '文生音',
    [TASK_TYPES.IMAGE_TO_TEXT]: '图生文',
    [TASK_TYPES.IMAGE_TO_MUSIC]: '图生音',
    [TASK_TYPES.MUSIC_TO_TEXT]: '音生文',
    [TASK_TYPES.IMAGE_TO_IMAGE]: '图生图',
    [TASK_TYPES.TEXT_TO_TEXT]: '文生文'
  };
  return taskNames[taskType] || '未知任务';
};

// 高级设置模态弹窗
const AdvancedSettingsModal = ({ 
  isOpen, 
  onClose, 
  currentEditingNode, 
  tempAdvancedSettings, 
  setTempAdvancedSettings, 
  updateNodeAdvancedSettings 
}) => {
  const handleSave = useCallback(() => {
    if (currentEditingNode) {
      // 验证所有设置
      const validation = validateAllSettings(currentEditingNode.model, tempAdvancedSettings);
      if (validation.isValid) {
        updateNodeAdvancedSettings(currentEditingNode.id, validation.validatedSettings);
        onClose();
      } else {
        toast.error(`设置验证失败：${validation.errors.join(', ')}`);
      }
    }
  }, [currentEditingNode, tempAdvancedSettings, updateNodeAdvancedSettings, onClose]);

  const handleCancel = useCallback(() => {
    setTempAdvancedSettings({});
    onClose();
  }, [onClose, setTempAdvancedSettings]);

  // 输入验证和边界检查
  const validateAndSetValue = useCallback((field, value) => {
    if (!currentEditingNode?.model) return;
    
    const validation = validateSettingValue(currentEditingNode.model, field, value);
    if (validation.isValid) {
      setTempAdvancedSettings(prev => ({
        ...prev,
        [field]: validation.value
      }));
    }
  }, [currentEditingNode?.model, setTempAdvancedSettings]);

  // 获取配置信息
  const config = useMemo(() => {
    return currentEditingNode ? getConfigForModel(currentEditingNode.model) : null;
  }, [currentEditingNode]);

  // 按分类分组设置
  const groupedSettings = useMemo(() => {
    if (!config) return {};
    
    const grouped = {};
    for (const [key, setting] of Object.entries(config.settings)) {
      const category = setting.category || 'general';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({ key, ...setting });
    }
    return grouped;
  }, [config]);

  // 渲染设置项
  const renderSettingField = useCallback((key, setting) => {
    const currentValue = tempAdvancedSettings[key];
    const validation = validateSettingValue(currentEditingNode.model, key, currentValue);
    
    if (setting.type === 'number') {
      return (
        <div key={key} className="space-y-2">
          <label className="text-sm text-amber-300 font-medium">
            {setting.label}
          </label>
          <Input
            type="number"
            step={setting.step}
            min={setting.min}
            max={setting.max}
            value={currentValue?.toString() || setting.default.toString()}
            onChange={(e) => validateAndSetValue(key, e.target.value)}
            className="bg-black/20 border-amber-700/30"
            size="sm"
            isInvalid={!validation.isValid}
            errorMessage={!validation.isValid ? validation.error : ""}
          />
          <p className="text-xs text-gray-400">
            {setting.description} ({setting.min}-{setting.max})
          </p>
          {setting.helpText && (
            <p className="text-xs text-gray-500 italic">
              {setting.helpText}
            </p>
          )}
        </div>
      );
    }
    
    if (setting.type === 'boolean') {
      return (
        <div key={key} className="flex items-center justify-between">
          <div>
            <label className="text-sm text-amber-300 font-medium">
              {setting.label}
            </label>
            <p className="text-xs text-gray-400">{setting.description}</p>
            {setting.helpText && (
              <p className="text-xs text-gray-500 italic">
                {setting.helpText}
              </p>
            )}
          </div>
          <Switch
            isSelected={currentValue ?? setting.default}
            onValueChange={(checked) => validateAndSetValue(key, checked)}
            classNames={{
              wrapper: "bg-black/30 border border-amber-700/30",
              thumb: "bg-amber-500"
            }}
          />
        </div>
      );
    }
    
    return null;
  }, [tempAdvancedSettings, currentEditingNode, validateAndSetValue]);

  // 避免重复渲染导致的动画问题
  if (!isOpen || !currentEditingNode || !config) {
    return null;
  }

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={handleCancel}
      size="2xl"
      backdrop="blur"
      motionProps={{
        variants: {
          enter: {
            opacity: 1,
            transition: {
              duration: 0.15,
              ease: "easeOut",
            },
          },
          exit: {
            opacity: 0,
            transition: {
              duration: 0.1,
              ease: "easeIn",
            },
          },
        }
      }}
      classNames={{
        base: "bg-black/90 border border-amber-700/30",
        header: "border-b border-amber-700/30",
        body: "py-6",
        footer: "border-t border-amber-700/30"
      }}
      isDismissable={false}
      hideCloseButton={false}
      closeButton={<></>}
      key={currentEditingNode?.id}
    >
      <ModalContent>
        <ModalHeader className="text-amber-400 text-lg">
          <div className="flex items-center gap-2">
            <IconAdjustments size={20} />
            高级设置 - {currentEditingNode?.task ? getTaskName(currentEditingNode.task) : ''}
          </div>
        </ModalHeader>
        <ModalBody className="space-y-6">
          {Object.entries(groupedSettings).map(([categoryKey, settings]) => {
            const categoryInfo = config.categories?.[categoryKey];
            return (
              <div key={categoryKey} className="space-y-4">
                {categoryInfo && (
                  <div className="border-b border-amber-700/30 pb-2">
                    <h3 className="text-amber-400 font-medium">
                      {categoryInfo.label}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {categoryInfo.description}
                    </p>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  {settings.map(setting => renderSettingField(setting.key, setting))}
                </div>
              </div>
            );
          })}
        </ModalBody>
        <ModalFooter>
          <Button 
            variant="flat" 
            onPress={handleCancel}
            className="text-gray-400"
          >
            取消
          </Button>
          <Button 
            color="warning" 
            onPress={handleSave}
            className="bg-gradient-to-r from-amber-500 to-amber-600"
          >
            保存设置
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

// 上传图像到主后端并获取可访问的URL
const uploadImageToBackend = async (imageContent) => {
  const authToken = localStorage.getItem('auth_token');
  let file = null;

  // 将输入的图像内容转换为 File 对象
  if (typeof imageContent === 'string') {
    const response = await fetch(imageContent);
    const blob = await response.blob();
    const ext = blob.type.split('/').pop() || 'png';
    file = new File([blob], `uploaded-image.${ext}`, { type: blob.type });

    // 仅在本地静态资源或用户上传时，将文件上传到后端服务器
    if (imageContent.startsWith('/images/') || imageContent.startsWith('blob:')) {
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`${API_BASE_URL}/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`图片上传失败: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      if (uploadData.success) {
        const filePath = uploadData.filepath || uploadData.data?.filepath;
        // 提取文件名并拼接正确的URL
        const fileName = filePath.split('/').pop();
        return `${API_BASE_URL}/files/${fileName}`;
      } else {
        throw new Error('图片上传失败');
      }
    }
  }

  // 如果不是需要上传的类型，直接返回原始内容
  return imageContent;
};

// 认证请求函数
const authenticatedFetch = async (url, options = {}) => {
  const token = localStorage.getItem('auth_token');
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };
  
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (response.status === 401) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login';
    throw new Error('登录已过期，请重新登录');
  }
  
  return response;
};

export default function WorkflowPlatform() {
  // 工作流状态
  const [workflow, setWorkflow] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState([]);
  const [currentExecutingStep, setCurrentExecutingStep] = useState(-1);
  const [backendStatus, setBackendStatus] = useState({
    isConnected: false,
    isReady: false
  });

  // 分步执行状态
  const [isStepByStep, setIsStepByStep] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepResults, setStepResults] = useState([]);
  const [isWorkflowLocked, setIsWorkflowLocked] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState(-1);
  const [editingText, setEditingText] = useState('');
  const [previewImage, setPreviewImage] = useState({ src: '', alt: '' });

  // 高级设置状态
  const [advancedSettings, setAdvancedSettings] = useState({});
  const [currentEditingNode, setCurrentEditingNode] = useState(null);
  const [tempAdvancedSettings, setTempAdvancedSettings] = useState({});
  const [expandedAdvancedSettings, setExpandedAdvancedSettings] = useState({});
  const {isOpen: isAdvancedOpen, onOpen: onAdvancedOpen, onClose: onAdvancedClose} = useDisclosure();

  const router = useRouter();

  // 获取节点的高级设置
  const getNodeAdvancedSettings = (nodeId) => {
    const node = workflow.find(n => n.id === nodeId);
    if (!node || !node.model) return {};
    
    const defaultSettings = getDefaultSettings(node.model);
    return advancedSettings[nodeId] || defaultSettings;
  };

  // 更新节点的高级设置
  const updateNodeAdvancedSettings = (nodeId, settings) => {
    const node = workflow.find(n => n.id === nodeId);
    if (!node || !node.model) return;
    
    const defaultSettings = getDefaultSettings(node.model);
    setAdvancedSettings(prev => ({
      ...prev,
      [nodeId]: { ...defaultSettings, ...settings }
    }));
  };

  // 渲染执行输出结果
  const renderExecutionOutput = (output, taskType) => {
    if (!output) {
      return <span className="text-gray-400">无输出内容</span>;
    }

    // 判断输出类型
    const isImageTask = taskType === '文生图' || taskType === '图生图';
    const isMusicTask = taskType === '文生音' || taskType === '图生音';
    const isTextTask = taskType === '图生文' || taskType === '音生文' || taskType === '文生文';
    
    // 对于文生文任务，不应该被判断为图像或音频内容
    const isImageContent = !isTextTask && typeof output === 'string' && (
      output.startsWith('/images/') || 
      output.startsWith('blob:') ||
      output.startsWith('data:image/') ||
      output.includes('.jpg') || output.includes('.jpeg') || 
      output.includes('.png') || output.includes('.webp') || 
      output.includes('.gif') || output.includes('.bmp') ||
      (output.includes('/') && /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(output)) ||
      (isImageTask && output.includes('/'))
    );
    
    const isAudioContent = !isTextTask && typeof output === 'string' && (
      output.startsWith('/audios/') ||
      output.startsWith('data:audio/') ||
      output.includes('.mp3') || output.includes('.wav') || 
      output.includes('.m4a') || output.includes('.ogg') ||
      output.includes('.flac') || output.includes('.aac') ||
      (output.includes('/') && /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(output)) ||
      (isMusicTask && output.includes('/'))
    );

    // 构造正确的文件访问URL
    const getFileUrl = (filePath) => {
      if (filePath.startsWith('blob:') || filePath.startsWith('http') || filePath.startsWith('data:')) {
        return filePath; 
      }
      if (filePath.startsWith('/')) {
        return filePath; 
      }
      return `${API_BASE_URL}/files/${filePath}`;
    };

    if (isImageContent || isImageTask) {
      const isInputImage = typeof output === 'string' && output.startsWith('blob:');
      const imageUrl = getFileUrl(output);

      return (
        <div className="bg-black/20 rounded-lg p-3 border border-amber-700/30">
          <div
            className="relative w-full max-w-md mx-auto cursor-zoom-in"
            onClick={() => setPreviewImage({ src: imageUrl, alt: isInputImage ? "用户上传的图像" : "AI生成的图像" })}
          >
            <div className="aspect-square relative rounded-lg overflow-hidden">
              <Image
                src={imageUrl}
                alt={isInputImage ? "用户上传的图像" : "AI生成的图像"}
                fill
                className="object-cover"
              />
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-2 text-center">
            {isInputImage ? "用户上传的图像" : "生成的图像"}（点击查看大图）
          </p>
        </div>
      );
    }
    
    if (isAudioContent || isMusicTask) {
      const audioUrl = getFileUrl(output);
      
      return (
        <div className="bg-black/20 rounded-lg p-4 border border-amber-700/30">
          <div className="flex items-center gap-3 mb-3">
            <IconMusic size={20} className="text-amber-500" />
            <span className="text-white font-medium">生成的音乐</span>
          </div>
          <div className="bg-black/50 rounded-lg overflow-hidden">
            <ReactPlayer
              url={audioUrl}
              width="100%"
              height="60px"
              controls={true}
              playing={false}
              config={{
                file: {
                  forceAudio: true,
                  attributes: {
                    controlsList: "nodownload",
                  },
                },
              }}
            />
          </div>
          <p className="text-gray-400 text-xs mt-2">
            音频文件: {output.split('/').pop()}
          </p>
        </div>
      );
    }
    
    // 默认为文本输出
    return (
      <div className="bg-black/20 rounded-lg p-3 border border-amber-700/30">
        <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">
          {output}
        </div>
        <p className="text-gray-400 text-xs mt-2">
          文本长度: {output.length} 字符
        </p>
      </div>
    );
  };

  const canAddNode = (nodeType = null) => {
    if (workflow.length >= 5) return false;
    
    if (isExecuting || isWorkflowLocked || editingStepIndex >= 0) return false;
    
    if (workflow.length > 0 && workflow[workflow.length - 1].type === NODE_TYPES.MUSIC) {
      return false;
    }
    
    if (nodeType === NODE_TYPES.MUSIC && workflow.length === 0) {
      return false;
    }
    
    return true;
  };

  // 初始化检查
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userInfo = localStorage.getItem('user_info');
    
    if (!token || !userInfo) {
      toast.warning("请先登录后再使用推理平台", {
        description: "登录后您可以享受完整的推理服务"
      });
      router.push('/login');
      return;
    }

  // 检查后端状态
    checkBackendStatus();
  }, [router]);

    const checkBackendStatus = async () => {
      try {
      const response = await fetch(`${API_BASE_URL}/health`, {
          method: 'GET',
        headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(20000)
        });
        
      setBackendStatus({
        isConnected: response.ok,
        isReady: response.ok
      });

      if (!response.ok) {
        toast.error("无法连接到后端服务，请检查服务是否启动");
      }
      } catch (error) {
        setBackendStatus({
          isConnected: false,
        isReady: false
        });
        toast.error("无法连接到后端服务，请检查服务是否启动");
    }
  };

  const addNode = (type) => {
    if (workflow.length >= 5) { 
      toast.error("工作流最多支持5个节点");
      return;
    }

    if (type === NODE_TYPES.MUSIC && workflow.length < 1) {
      toast.error("音乐节点不能作为输入节点");
      return;
    }

    if (workflow.length > 0) {
      const lastNode = workflow[workflow.length - 1];
      if (lastNode.type === NODE_TYPES.MUSIC) {
        toast.error("音乐节点只能作为工作流的最终输出，不能在其后添加其他节点");
        return;
      }
    }

    const newNode = {
      id: Date.now().toString(),
      type,
      content: null,
      task: null,
      model: null,
      isInput: workflow.length === 0,
      isOutput: false,
      duration: 10 // 添加默认音乐时长为10秒
    };

    if (workflow.length > 0) {
      const prevNode = workflow[workflow.length - 1];
      
      const taskType = getTaskType(prevNode.type, type);
      newNode.task = taskType;
      
      const defaultModelId = getDefaultModelId(taskType);
      
      if (defaultModelId) {
        newNode.model = defaultModelId;
      }
    }

    const newWorkflow = [...workflow];
    
    newWorkflow.forEach(node => node.isOutput = false);
    
    newNode.isOutput = true;
    
    if (type === NODE_TYPES.MUSIC) {
      newNode.isOutput = true;
    }

    newWorkflow.push(newNode);
    setWorkflow(newWorkflow);
    
    setExecutionResults([]);
    setStepResults([]);
    
    toast.success(`已添加${type === NODE_TYPES.TEXT ? '文字' : type === NODE_TYPES.IMAGE ? '图像' : '音乐'}节点`);
  };

  // 删除节点
  const removeNode = (nodeId) => {
    const newWorkflow = workflow.filter(node => node.id !== nodeId);
    
    if (newWorkflow.length > 0) {
      newWorkflow.forEach((node, index) => {
        node.isInput = index === 0;
        node.isOutput = index === newWorkflow.length - 1;
      });
      
      for (let i = 1; i < newWorkflow.length; i++) {
        const prevNode = newWorkflow[i - 1];
        const currentNode = newWorkflow[i];
        const taskType = getTaskType(prevNode.type, currentNode.type);
        currentNode.task = taskType;
        
        const defaultModelId = getDefaultModelId(taskType);
        if (defaultModelId) {
          currentNode.model = defaultModelId;
        } else {
          currentNode.model = null;
        }
      }
      
      if (newWorkflow.length > 0) {
        newWorkflow[0].task = null;
        newWorkflow[0].model = null;
      }
    }
    
    setWorkflow(newWorkflow);
    
    setExecutionResults([]);
    setStepResults([]);
  };

  // 清空工作流
  const clearWorkflow = () => {
    setWorkflow([]);
    setExecutionResults([]);
    setStepResults([]);
    
    // 如果处于分步执行模式，也要终止
    if (isStepByStep) {
      setIsStepByStep(false);
      setIsWorkflowLocked(false);
      setCurrentStepIndex(0);
    }
    
    // 清除编辑状态
    setEditingStepIndex(-1);
    setEditingText('');
    
    toast.success("工作流已清空");
  };

  // 更新节点内容
  const updateNodeContent = (nodeId, content) => {
    setWorkflow(prev => prev.map(node => 
      node.id === nodeId ? { ...node, content } : node
    ));
    
    setExecutionResults([]);
    setStepResults([]);
  };

  // 更新节点模型
  const updateNodeModel = (nodeId, modelId) => {
    setWorkflow(prev => prev.map(node => 
      node.id === nodeId ? { ...node, model: modelId } : node
    ));
    
    setExecutionResults([]);
    setStepResults([]);
  };

  // 更新节点时长
  const updateNodeDuration = (nodeId, duration) => {
    setWorkflow(prev => prev.map(node => 
      node.id === nodeId ? { ...node, duration } : node
    ));
    
    setExecutionResults([]);
    setStepResults([]);
  };

  // 获取节点图标
  const getNodeIcon = (type) => {
    switch (type) {
      case NODE_TYPES.TEXT:
        return IconFileText;
      case NODE_TYPES.IMAGE:
        return IconPhoto;
      case NODE_TYPES.MUSIC:
        return IconHeadphones;
      default:
        return IconFileText;
    }
  };

  // 检查是否为音乐生成任务
  const isMusicGenerationTask = (task) => {
    return task === TASK_TYPES.TEXT_TO_MUSIC || task === TASK_TYPES.IMAGE_TO_MUSIC;
  };

  // 执行工作流
  const executeWorkflow = async () => {
    if (workflow.length === 0) {
      toast.error("请先创建工作流");
      return;
    }
    
    for (let i = 0; i < workflow.length; i++) {
      const node = workflow[i];
      if (node.isInput && !node.content) {
        toast.error(`请为输入节点配置内容`);
      return;
    }
      if (!node.isInput && !node.model) {
        toast.error(`请为节点 ${i + 1} 选择模型`);
      return;
    }
    }

    setExecutionResults([]);
    setStepResults([]);
    
    setIsExecuting(true);
    setCurrentExecutingStep(0);

    try {
      let currentResult = workflow[0].content; 

      for (let i = 1; i < workflow.length; i++) {
        setCurrentExecutingStep(i);
        const node = workflow[i];
        const prevNode = workflow[i - 1];

        toast.info(`执行步骤 ${i}：${getTaskName(node.task)}`);

        let result;
        
        if (node.task === TASK_TYPES.IMAGE_TO_MUSIC) {
          result = await executeImageToMusic(currentResult, node.model, node.duration, node.id);
        } else if (node.task === TASK_TYPES.IMAGE_TO_TEXT) {
          result = await executeImageToText(currentResult, node.model);
        } else if (node.task === TASK_TYPES.TEXT_TO_IMAGE) {
          result = await executeTextToImage(currentResult, node.model, node.id);
        } else if (node.task === TASK_TYPES.TEXT_TO_MUSIC) {
          result = await executeTextToMusic(currentResult, node.model, node.duration, node.id);
        } else if (node.task === TASK_TYPES.TEXT_TO_TEXT) {
          result = await executeTextToText(currentResult, node.model);
        } else {
          // 执行第三方API任务，需要记录使用情况
          const taskTypeMap = {
            [TASK_TYPES.TEXT_TO_IMAGE]: 'TEXT_TO_IMAGE',
            [TASK_TYPES.MUSIC_TO_TEXT]: 'AUDIO_GENERATION',
            [TASK_TYPES.TEXT_TO_TEXT]: 'MULTIMODAL_CHAT',
            [TASK_TYPES.IMAGE_TO_IMAGE]: 'IMAGE_TO_VIDEO'
          };
          
          result = await recordThirdPartyAPIUsage(
            taskTypeMap[node.task] || 'MULTIMODAL_CHAT',
            getAPIProviderFromModelId(node.model),
            { 
              task: node.task,
              modelId: node.model,
              inputType: typeof currentResult,
              inputLength: typeof currentResult === 'string' ? currentResult.length : 'N/A',
              actualInput: currentResult // 添加实际输入内容
            },
            () => executeMockTask(node.task, currentResult, node.model)
          );
        }

        setExecutionResults(prev => [...prev, {
          step: i,
          task: getTaskName(node.task),
          model: node.model,
          input: currentResult,
          output: result,
          status: 'completed'
        }]);

        currentResult = result;

        // 模拟执行时间
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      toast.success("工作流执行完成！");
    } catch (error) {
      toast.error(`执行失败: ${error.message}`);
      setExecutionResults(prev => [...prev.slice(0, -1), {
        ...prev[prev.length - 1],
        status: 'error',
        error: error.message
      }]);
    } finally {
      setIsExecuting(false);
      setCurrentExecutingStep(-1);
    }
  };

  // 开始分步执行
  const startStepByStepExecution = () => {
    if (workflow.length < 2) {
      toast.error("至少需要2个节点才能执行工作流");
      return;
    }

    // 验证所有处理节点都有模型选择
    for (let i = 1; i < workflow.length; i++) {
      if (!workflow[i].model) {
        toast.error(`步骤 ${i} 需要选择模型`);
        return;
      }
    }

    // 清空之前的执行结果
    setExecutionResults([]);
    setStepResults([]);
    
    setIsStepByStep(true);
    setIsWorkflowLocked(true);
    setCurrentStepIndex(1); 
    setStepResults([{ step: 0, output: workflow[0].content, status: 'completed' }]); 
    toast.info("分步执行模式已启动，点击「下一步」开始执行");
  };

  // 终止分步执行
  const terminateStepExecution = () => {
    setIsStepByStep(false);
    setIsWorkflowLocked(false);
    setCurrentStepIndex(0);
    setIsExecuting(false);
    setCurrentExecutingStep(-1);
    setEditingStepIndex(-1);
    setEditingText('');
    toast.info("分步执行已终止");
  };

  // 执行下一步
  const executeNextStep = async () => {
    if (currentStepIndex >= workflow.length) {
      toast.success("所有步骤已执行完成！");
      terminateStepExecution();
      return;
    }

    try {
      setIsExecuting(true);
      setCurrentExecutingStep(currentStepIndex);

      const node = workflow[currentStepIndex];
      const prevResult = stepResults[stepResults.length - 1]?.output;

      toast.info(`执行步骤 ${currentStepIndex}：${getTaskName(node.task)}`);

      let result;

      // 执行任务
      if (node.task === TASK_TYPES.IMAGE_TO_MUSIC) {
        result = await executeImageToMusic(prevResult, node.model, node.duration, node.id);
      } else if (node.task === TASK_TYPES.IMAGE_TO_TEXT) {
        result = await executeImageToText(prevResult, node.model);
      } else if (node.task === TASK_TYPES.TEXT_TO_IMAGE) {
        result = await executeTextToImage(prevResult, node.model, node.id);
      } else if (node.task === TASK_TYPES.TEXT_TO_MUSIC) {
        result = await executeTextToMusic(prevResult, node.model, node.duration, node.id);
      } else if (node.task === TASK_TYPES.TEXT_TO_TEXT) {
        result = await executeTextToText(prevResult, node.model);
      } else {
        // 执行第三方API任务，需要记录使用情况
        const taskTypeMap = {
          [TASK_TYPES.TEXT_TO_IMAGE]: 'TEXT_TO_IMAGE',
          [TASK_TYPES.MUSIC_TO_TEXT]: 'MUSIC_TO_TEXT',
          [TASK_TYPES.TEXT_TO_TEXT]: 'TEXT_TO_TEXT',
          [TASK_TYPES.IMAGE_TO_IMAGE]: 'IMAGE_TO_IMAGE'
        };
        
        result = await recordThirdPartyAPIUsage(
          taskTypeMap[node.task] || 'OTHER_TASKS',
          getAPIProviderFromModelId(node.model),
          { 
            task: node.task,
            modelId: node.model,
            stepIndex: currentStepIndex,
            inputType: typeof prevResult,
            inputLength: typeof prevResult === 'string' ? prevResult.length : 'N/A',
            actualInput: prevResult // 添加实际输入内容
          },
          () => executeMockTask(node.task, prevResult, node.model)
        );
      }

      // 添加执行结果
      const newStepResult = {
        step: currentStepIndex,
        task: getTaskName(node.task),
        model: node.model,
        input: prevResult,
        output: result,
        status: 'completed'
      };

      setStepResults(prev => [...prev, newStepResult]);
      setCurrentStepIndex(prev => prev + 1);

      toast.success(`步骤 ${currentStepIndex} 执行完成`);

      if (currentStepIndex + 1 >= workflow.length) {
        toast.success("所有步骤已执行完成！");
        setIsStepByStep(false);
        setIsWorkflowLocked(false);
        setCurrentStepIndex(workflow.length); 
      }

    } catch (error) {
      toast.error(`步骤 ${currentStepIndex} 执行失败: ${error.message}`);

      setStepResults(prev => [...prev, {
        step: currentStepIndex,
        task: getTaskName(workflow[currentStepIndex].task),
        model: workflow[currentStepIndex].model,
        input: stepResults[stepResults.length - 1]?.output,
        output: null,
        status: 'error',
        error: error.message
      }]);
    } finally {
      setIsExecuting(false);
      setCurrentExecutingStep(-1);
    }
  };

  // 重新生成某个步骤
  const regenerateStep = async (stepIndex) => {
    if (stepIndex <= 0 || stepIndex >= stepResults.length) return;

    try {
      setIsExecuting(true);
      setCurrentExecutingStep(stepIndex);

      const node = workflow[stepIndex];
      const prevResult = stepResults[stepIndex - 1]?.output;

      toast.info(`重新生成步骤 ${stepIndex}：${getTaskName(node.task)}`);

      let result;
      if (node.task === TASK_TYPES.IMAGE_TO_MUSIC) {
        result = await executeImageToMusic(prevResult, node.model, node.duration, node.id);
      } else if (node.task === TASK_TYPES.IMAGE_TO_TEXT) {
        result = await executeImageToText(prevResult, node.model);
      } else if (node.task === TASK_TYPES.TEXT_TO_IMAGE) {
        result = await executeTextToImage(prevResult, node.model, node.id);
      } else if (node.task === TASK_TYPES.TEXT_TO_MUSIC) {
        result = await executeTextToMusic(prevResult, node.model, node.duration, node.id);
      } else if (node.task === TASK_TYPES.TEXT_TO_TEXT) {
        result = await executeTextToText(prevResult, node.model);
      } else {
        // 执行第三方API任务，需要记录使用情况
        const taskTypeMap = {
          [TASK_TYPES.TEXT_TO_IMAGE]: 'TEXT_TO_IMAGE',
          [TASK_TYPES.MUSIC_TO_TEXT]: 'AUDIO_GENERATION',
          [TASK_TYPES.TEXT_TO_TEXT]: 'TEXT_TO_TEXT',
          [TASK_TYPES.IMAGE_TO_IMAGE]: 'IMAGE_TO_VIDEO'
        };
        
        result = await recordThirdPartyAPIUsage(
          taskTypeMap[node.task] || 'MULTIMODAL_CHAT',
          getAPIProviderFromModelId(node.model),
          { 
            task: node.task,
            modelId: node.model,
            stepIndex: stepIndex,
            isRegenerate: true,
            inputType: typeof prevResult,
            inputLength: typeof prevResult === 'string' ? prevResult.length : 'N/A',
            actualInput: prevResult // 添加实际输入内容
          },
          () => executeMockTask(node.task, prevResult, node.model)
        );
      }

      setStepResults(prev => {
        const newResults = [...prev.slice(0, stepIndex)];
        newResults.push({
          step: stepIndex,
          task: getTaskName(node.task),
          model: node.model,
          input: prevResult,
          output: result,
          status: 'completed'
        });
        return newResults;
      });

      setCurrentStepIndex(stepIndex + 1);

      toast.success(`步骤 ${stepIndex} 重新生成完成`);
    } catch (error) {
      toast.error(`重新生成失败: ${error.message}`);
    } finally {
      setIsExecuting(false);
      setCurrentExecutingStep(-1);
    }
  };

  // 开始编辑步骤结果
  const startEditingStep = (stepIndex) => {
    const result = stepResults[stepIndex];
    if (result && typeof result.output === 'string' && !result.output.startsWith('/') && !result.output.startsWith('http')) {
      setEditingStepIndex(stepIndex);
      setEditingText(result.output);
    }
  };

  // 保存编辑的结果
  const saveEditedResult = () => {
    if (editingStepIndex <= 0) return;

    setStepResults(prev => {
      const newResults = [...prev.slice(0, editingStepIndex)];
      newResults.push({
        ...prev[editingStepIndex],
        output: editingText,
        isEdited: true
      });
      return newResults;
    });

    setCurrentStepIndex(editingStepIndex + 1);
    setEditingStepIndex(-1);
    setEditingText('');

    toast.success("编辑结果已保存");
  };

  // 取消编辑
  const cancelEditing = () => {
    setEditingStepIndex(-1);
    setEditingText('');
  };

  // 模拟描述内容
  const MOCK_DESCRIPTIONS = [
    "这是一幅充满诗意的中国传统山水画作品。画面中远山如黛，层峦叠嶂，云雾缭绕其间，营造出一种空灵飘渺的意境。近景处古树参天，枝叶繁茂，树下隐约可见小径蜿蜒。整幅画作采用传统的水墨技法，浓淡相宜，虚实相生，体现了中国画意在笔先、画尽意在的艺术境界。画风清雅淡远，给人以宁静致远的美感体验。",
    "画面呈现了一幅典雅的花鸟画景象。画中花朵盛开，色彩淡雅，花瓣层次分明，展现出自然界的勃勃生机。枝叶疏密有致，用笔洒脱自然，体现了画家深厚的艺术功底。整体构图疏朗有致，留白适当，符合中国传统绘画的审美理念。这种花鸟画不仅是对自然美的描绘，更蕴含着画家对生活的热爱和对美好事物的向往。",
    "这幅作品展现了古代文人雅士的生活情趣。画面中可能描绘了庭院一角，或书房雅室，体现了中国传统文化中对精神境界的追求。笔墨运用娴熟，线条流畅，色调古朴典雅。整幅画作散发着浓郁的文人气息，反映了中国古代知识分子寄情山水、追求精神自由的人生态度。这种艺术风格体现了中华文化的深厚底蕴和独特的美学价值。"
  ];

  // 执行图生音任务
  const executeImageToMusic = async (imageContent, modelId, duration = 10, nodeId = null) => {
    // 墨韵音声是本地模型，有自动记录功能，不需要额外记录
    if (modelId.startsWith('moyinyinsheng-')) {
      const advancedOptions = nodeId ? getNodeAdvancedSettings(nodeId) : {};
      const options = { duration, ...advancedOptions };
      return await MoyinYinsheng(imageContent, modelId, options);
    }

    // 先上传图像到主后端获取可访问的URL用于记录
    let imageUrlForRecord = imageContent;
    try {
      imageUrlForRecord = await uploadImageToBackend(imageContent);
    } catch (error) {
      console.warn('图像上传失败，使用原始内容进行记录:', error);
    }

    // 其他模型是第三方API，需要记录使用情况
    return await recordThirdPartyAPIUsage(
      'IMAGE_TO_MUSIC',
      'MockAPI',
      { 
        modelId, 
        duration,
        imageType: 'uploaded_image',
        taskType: 'image_to_music',
        actualInput: imageUrlForRecord
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return "/audios/sample-music.mp3";
      }
    );
  };

  // 执行图生文任务
  const executeImageToText = async (imageContent, modelId) => {
    // 墨韵弦思是本地模型，有自动记录功能，不需要额外记录
    if (modelId === 'moyinxiansi') {
      return await MoyinXiansi(imageContent);
    }

    // 先上传图像到主后端获取可访问的URL用于记录
    let imageUrlForRecord = imageContent;
    try {
      imageUrlForRecord = await uploadImageToBackend(imageContent);
    } catch (error) {
      console.warn('图像上传失败，使用原始内容进行记录:', error);
    }

    if (modelId === 'painting-to-prose') {
      return await recordThirdPartyAPIUsage(
        'IMAGE_TO_TEXT',
        'Coze',
        { modelId, taskType: '国画生成白话', imageType: 'uploaded_image', actualInput: imageUrlForRecord },
        () => PaintingToProse(imageContent)
      );
    }
    
if (modelId === 'moyuqingyi') {
      return await recordThirdPartyAPIUsage(
        'IMAGE_TO_TEXT',
        'Coze',
        { modelId, taskType: '国画生成白话', imageType: 'uploaded_image', actualInput: imageUrlForRecord },
        () => Moyuqingyi(imageContent)
      );
    }

    if (modelId === 'huaxufanyan') {
      return await recordThirdPartyAPIUsage(
        'IMAGE_TO_TEXT',
        'Coze',
        { modelId, taskType: '国画生成白话', imageType: 'uploaded_image', actualInput: imageUrlForRecord },
        () => Huaxufanyan(imageContent)
      );
    }

    if (modelId === 'mojuanjieyu') {
      return await recordThirdPartyAPIUsage(
        'IMAGE_TO_TEXT',
        'Coze',
        { modelId, taskType: '国画生成白话', imageType: 'uploaded_image', actualInput: imageUrlForRecord },
        () => Mojuanjieyu(imageContent)
      );
    }
    
    // 其他模型是第三方API，需要记录使用情况
    return await recordThirdPartyAPIUsage(
      'IMAGE_TO_TEXT',
      getAPIProviderFromModelId(modelId),
      { modelId, imageType: 'uploaded_image', actualInput: imageUrlForRecord },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return MOCK_DESCRIPTIONS[Math.floor(Math.random() * MOCK_DESCRIPTIONS.length)];
      }
    );
  };

  // 执行文生图任务
  const executeTextToImage = async (prompt, modelId, nodeId = null) => {
    const advancedOptions = nodeId ? getNodeAdvancedSettings(nodeId) : {};

    if (modelId === 'moyundanqing1') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_IMAGE',
        'Coze',
        { modelId, taskType: '墨韵丹青(1:1)', prompt, ...advancedOptions, actualInput: prompt },
        () => ProseToPainting(prompt,modelId)
      );
    }
    if (modelId === 'moyundanqing2') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_IMAGE',
        'Coze',
        { modelId, taskType: '墨韵丹青(4:3)', prompt, ...advancedOptions, actualInput: prompt },
        () => ProseToPainting(prompt,modelId)
      );
    }
    if (modelId === 'moyundanqing3') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_IMAGE',
        'Coze',
        { modelId, taskType: '墨韵丹青(9:16)', prompt, ...advancedOptions, actualInput: prompt },
        () => ProseToPainting(prompt,modelId)
      );
    }

    return await recordThirdPartyAPIUsage(
      'TEXT_TO_IMAGE',
      getAPIProviderFromModelId(modelId),
      { prompt, modelId, ...advancedOptions, actualInput: prompt },
      () => executeMockTask(TASK_TYPES.TEXT_TO_IMAGE, prompt, modelId)
    );
  };

  // 执行文生音任务
  const executeTextToMusic = async (prompt, modelId, duration = 10, nodeId = null) => {
    const advancedOptions = nodeId ? getNodeAdvancedSettings(nodeId) : {};
    const options = { duration, ...advancedOptions };
    
    // API记录
    if (modelId === 'musicgen-small') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_MUSIC',
        'MusicGen',
        { prompt, modelId, duration, ...advancedOptions },
        () => MusicGenSmall(prompt, options)
      );
    }
    if (modelId === 'musicgen-medium') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_MUSIC',
        'MusicGen',
        { prompt, modelId, duration, ...advancedOptions },
        () => MusicGenMedium(prompt, options)
      );
    }
    if (modelId === 'musicgen-large') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_MUSIC',
        'MusicGen',
        { prompt, modelId, duration, ...advancedOptions },
        () => MusicGenLarge(prompt, options)
      );
    }
    
    // Mock任务也视为第三方API（用于测试）
    return await recordThirdPartyAPIUsage(
      'TEXT_TO_MUSIC',
      'MockAPI',
      { prompt, modelId, duration, actualInput: prompt },
      () => executeMockTask(TASK_TYPES.TEXT_TO_MUSIC, prompt, modelId)
    );
  };

  // 执行文生文任务
  const executeTextToText = async (input, modelId) => {
    if (modelId === 'poetry-to-prose-ds') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_TEXT',
        'Coze',
        { modelId, taskType: '诗映凡言（DeepSeek-V3.1', inputLength: typeof input === 'string' ? input.length : 'N/A', actualInput: input },
        () => PoetryToProse(input, modelId)
      );
    }
    if (modelId === 'prose-to-poetry-ds') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_TEXT',
        'Coze',
        { modelId, taskType: '语化清辞（DeepSeek-V3.1', inputLength: typeof input === 'string' ? input.length : 'N/A', actualInput: input },
        () => ProseToPoetry(input, modelId)
      );
    }
    if (modelId === 'poetry-to-prose-kimi') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_TEXT',
        'Coze',
        { modelId, taskType: '诗映凡言（KIMI·K2）', inputLength: typeof input === 'string' ? input.length : 'N/A', actualInput: input },
        () => PoetryToProse(input, modelId)
      );
    }
    if (modelId === 'prose-to-poetry-kimi') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_TEXT',
        'Coze',
        { modelId, taskType: '语化清辞（KIMI·K2）', inputLength: typeof input === 'string' ? input.length : 'N/A', actualInput: input },
        () => ProseToPoetry(input, modelId)
      );
    }
        if (modelId === 'poetry-to-prose-doubao') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_TEXT',
        'Coze',
        { modelId, taskType: '诗映凡言（豆包·1.6）', inputLength: typeof input === 'string' ? input.length : 'N/A', actualInput: input },
        () => PoetryToProse(input, modelId)
      );
    }
    if (modelId === 'prose-to-poetry-doubao') {
      return await recordThirdPartyAPIUsage(
        'TEXT_TO_TEXT',
        'Coze',
        { modelId, taskType: '语化清辞（豆包·1.6）', inputLength: typeof input === 'string' ? input.length : 'N/A', actualInput: input },
        () => ProseToPoetry(input, modelId)
      );
    }

    return await recordThirdPartyAPIUsage(
      'TEXT_TO_TEXT',
      getAPIProviderFromModelId(modelId),
      { task: TASK_TYPES.TEXT_TO_TEXT, modelId, actualInput: input },
      () => executeMockTask(TASK_TYPES.TEXT_TO_TEXT, input, modelId)
    );
  };

  // 执行MOCK任务
  const executeMockTask = async (taskType, input, modelId) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 随机选择public/images中的图片用于MOCK
    const mockImages = [
      '/images/guohua (1).png',
      '/images/guohua (2).png',
      '/images/guohua (3).png',
      '/images/guohua (4).png',
      '/images/guohua (5).png',
      '/images/guohua (6).png',
      '/images/guohua (7).png',
      '/images/guohua (8).png'
    ];
    
    const randomImage = mockImages[Math.floor(Math.random() * mockImages.length)];
    
    switch (taskType) {
      case TASK_TYPES.TEXT_TO_IMAGE:
        // 对于图像生成，我们需要将本地图像转换为base64并模拟上传流程
        try {
          const response = await fetch(randomImage);
          const blob = await response.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              resolve(result); // 包含data:image/png;base64,前缀
            };
            reader.readAsDataURL(blob);
          });
          return base64; // 返回完整的data URL，这样会被processAndUploadResult处理
        } catch (error) {
          console.error('Failed to convert mock image to base64:', error);
          return randomImage; // 降级到原来的逻辑
        }
      case TASK_TYPES.TEXT_TO_MUSIC:
        // 对于音频，也可以类似处理，但这里先保持原样
        return "/audios/sample-music.mp3";
      case TASK_TYPES.MUSIC_TO_TEXT:
        return "这是一段优美的音乐作品，包含了丰富的情感表达和精妙的编曲技巧。音乐风格融合了古典与现代元素，营造出独特的音乐氛围。";
      case TASK_TYPES.TEXT_TO_TEXT:
        return "基于输入文本的智能分析与处理，我们生成了符合语境的高质量文本内容。这个结果展现了人工智能在自然语言处理方面的能力。";
      case TASK_TYPES.IMAGE_TO_IMAGE:
        // 图像到图像也使用相同的逻辑
        try {
          const response = await fetch(randomImage);
          const blob = await response.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result;
              resolve(result);
            };
            reader.readAsDataURL(blob);
          });
          return base64;
        } catch (error) {
          console.error('Failed to convert mock image to base64:', error);
          return randomImage;
        }
      default:
        return "错误：未知流程";
    }
  };

  // 渲染节点内容输入
  const renderNodeContentInput = (node) => {
    if (!node.isInput) return null;

    switch (node.type) {
      case NODE_TYPES.TEXT:
        return (
          <Textarea
            placeholder="输入文本内容..."
            value={node.content || ''}
            onChange={(e) => updateNodeContent(node.id, e.target.value)}
            minRows={3}
            className="w-full"
            isDisabled={isExecuting || isWorkflowLocked || editingStepIndex >= 0}
          />
        );
      case NODE_TYPES.IMAGE:
        const isImageDisabled = isExecuting || isWorkflowLocked || editingStepIndex >= 0;
        return (
          <div className="w-full">
            <div className={`relative ${isImageDisabled ? 'pointer-events-none opacity-50' : ''}`}>
              <Dragger
                accept="image/*"
                showUploadList={false}
                beforeUpload={() => false}
                onChange={(info) => {
                  if (!isImageDisabled) {
                    const file = info.file;
                    if (file) {
                      const imageUrl = URL.createObjectURL(file);
                      updateNodeContent(node.id, imageUrl);
                    }
                  }
                }}
                className="!bg-black/20 !border-amber-700/50"
                disabled={isImageDisabled}
              >
                {node.content ? (
                  <div className="relative w-full h-32">
                    <Image
                      src={node.content}
                      alt="上传的图片"
                      fill
                      className="object-cover rounded"
                    />
                  </div>
                ) : (
                  <div className="p-4">
                    <p className="text-amber-500"><InboxOutlined /></p>
                    <p className="text-white text-sm">
                      {isImageDisabled ? '编辑模式下禁用上传' : '点击或拖拽上传图片'}
                    </p>
                  </div>
                )}
              </Dragger>
              {isImageDisabled && (
                <div className="absolute inset-0 bg-black/20 rounded flex items-center justify-center">
                  <span className="text-gray-400 text-sm">编辑模式下禁用</span>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // 渲染音乐时长配置
  const renderDurationConfig = (node) => {
    // 只有音乐生成任务才显示时长配置
    if (!isMusicGenerationTask(node.task)) {
      return null;
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-amber-400 font-medium">
          <IconClock size={16} />
          <span>音乐时长配置</span>
        </div>
        <div className="space-y-2">
          <Slider
            label=""
            step={1}
            minValue={3}
            maxValue={30}
            value={node.duration || 10}
            onChange={(value) => updateNodeDuration(node.id, value)}
            className="w-full"
            classNames={{
              base: "max-w-full",
              track: "bg-black/20 border border-amber-700/30",
              filler: "bg-gradient-to-r from-amber-500 to-amber-600",
              thumb: "bg-amber-500 border-2 border-amber-400 hover:bg-amber-400 transition-colors",
              value: "text-amber-300 text-sm font-medium"
            }}
            isDisabled={isExecuting || isWorkflowLocked || editingStepIndex >= 0}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-400">3秒</span>
            <div className="text-center">
              <span className="text-amber-300 font-medium">{node.duration || 10}秒</span>
              <div className="text-xs text-gray-400">生成时长</div>
            </div>
            <span className="text-xs text-gray-400">30秒</span>
          </div>
        </div>
      </div>
    );
  };

  // 渲染模型选择
  const renderModelSelect = (node) => {
    // 只有非输入节点且有任务类型的节点才显示模型选择
    if (node.isInput || !node.task) {
      return null;
    }

    const availableModels = MODELS[node.task] || [];
    
    if (availableModels.length === 0) {
      return (
        <div className="text-gray-400 text-sm">
          暂无可用模型 (任务: {node.task})
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        <div className="text-sm text-amber-400 font-medium">
          模型选择
        </div>
        <Select
          label=""
          placeholder="请选择模型进行推理"
          selectedKeys={node.model ? [node.model] : []}
          onSelectionChange={(keys) => {
            const selectedModel = Array.from(keys)[0];
            const selectedModelInfo = availableModels.find((model) => model.id === selectedModel);
            if (selectedModel && selectedModelInfo?.type !== 'mock') {
              updateNodeModel(node.id, selectedModel);
            }
          }}
          size="sm"
          className="w-full"
          classNames={{
            base: "w-full",
            trigger: [
              "min-h-10 rounded-xl border border-amber-700/50",
              "bg-black/40 text-white",
              "hover:bg-black/40",
              "data-[hover=true]:bg-black/40",
              "data-[open=true]:bg-black/40",
              "data-[focus=true]:bg-black/40",
              "data-[focus-visible=true]:bg-black/40",
              "data-[pressed=true]:bg-black/40",
              "hover:border-amber-500/70",
              "data-[open=true]:border-amber-400",
              "data-[focus=true]:border-amber-400",
              "data-[focus-visible=true]:border-amber-400",
              "transition-colors",
            ].join(" "),
            innerWrapper: "text-white",
            value: "!text-white data-[has-value=true]:!text-white",
            label: "text-amber-300",
            selectorIcon: "text-white",
            popoverContent:
              "bg-[#111111] border border-amber-700/50 text-white shadow-xl shadow-black/50",
            listboxWrapper: "bg-[#111111] p-1",
            listbox: "bg-[#111111] text-white",
          }}
          isDisabled={isExecuting || isWorkflowLocked || editingStepIndex >= 0}
        >
          {availableModels.map((model) => (
            <SelectItem 
              key={model.id} 
              value={model.id}
              textValue={model.name}
              classNames={{
                base: [
                  "rounded-lg px-3 py-2 text-white",
                  "data-[hover=true]:bg-amber-500/15",
                  "data-[selectable=true]:focus:bg-amber-500/15",
                  "data-[selected=true]:bg-amber-500/20",
                  "data-[selected=true]:text-white",
                  "data-[disabled=true]:opacity-40",
                ].join(" "),
                title: "text-white font-medium",
                description: "text-gray-400 text-xs",
                selectedIcon: "text-amber-300",
              }}
              isDisabled={model.type === 'mock'}
            >
              <div className="flex flex-col gap-1 py-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{model.name}</span>
                  {model.type === 'mock' && (
                    <span className="text-[10px] text-amber-400 uppercase tracking-wide">暂不可用</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{model.description}</span>
              </div>
            </SelectItem>
          ))}
        </Select>
      </div>
    );
  };

  // 渲染高级设置
  const renderAdvancedSettings = (node) => {
    // 检查是否支持高级设置
    if (!node.model || !node.task || !hasAdvancedSettings(node.model, node.task)) {
      return null;
    }

    const settings = getNodeAdvancedSettings(node.id);
    const isExpanded = expandedAdvancedSettings[node.id] || false;

    const handleEditSettings = () => {
      setCurrentEditingNode(node);
      // 确保获取完整的设置，包括默认值
      const config = getConfigForModel(node.model);
      if (config) {
        const fullSettings = {};
        for (const [key, setting] of Object.entries(config.settings)) {
          fullSettings[key] = settings[key] ?? setting.default;
        }
        setTempAdvancedSettings(fullSettings);
      }
      onAdvancedOpen();
    };

    const toggleExpanded = () => {
      setExpandedAdvancedSettings(prev => ({
        ...prev,
        [node.id]: !prev[node.id]
      }));
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconTool size={16} className="text-amber-400" />
            <span className="text-sm text-amber-400 font-medium">高级设置</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="flat"
              color="secondary"
              onClick={handleEditSettings}
              startContent={<IconEdit size={14} />}
              isDisabled={isExecuting || isWorkflowLocked || editingStepIndex >= 0}
              className="text-xs"
            >
              修改
            </Button>
            <Button
              size="sm"
              variant="light"
              onClick={toggleExpanded}
              isIconOnly
              className="text-amber-400"
            >
              {isExpanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
            </Button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="bg-black/20 rounded-lg p-3 border border-amber-700/20">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(() => {
                const config = getConfigForModel(node.model);
                if (!config) return null;
                
                return Object.entries(config.settings).map(([key, setting]) => {
                  const value = settings[key] ?? setting.default;
                  const displayValue = setting.type === 'boolean' ? (value ? '是' : '否') : value;
                  
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-400">{setting.label}:</span>
                      <span className="text-amber-300">{displayValue}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
      <Navbar />
      
      {/* 背景装饰元素 */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[100px]"></div>
        <div className="absolute bottom-[10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-500/10 blur-[100px]"></div>
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-purple-500/10 blur-[100px]"></div>
          </div>
      
      <div className="container mx-auto pt-24 pb-20 px-6 relative z-10">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="mb-8 text-center"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-300 to-amber-600 bg-clip-text text-transparent mb-4">
            画音智链多模态推理平台
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            构建多模态AI工作流，实现文字、图像和音乐之间的智能转换与生成
          </p>
          
          {/* 编辑模式全局提示 */}
          {editingStepIndex >= 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 mx-auto max-w-md"
            >
              <div className="bg-amber-500/15 border border-amber-500/30 rounded-lg p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 justify-center">
                  <IconEdit size={18} className="text-amber-400" />
                  <span className="text-amber-300 font-medium">编辑模式激活</span>
                </div>
                <p className="text-amber-200 text-sm mt-1">
                  正在编辑步骤 {editingStepIndex} 的结果，其他操作已暂时禁用
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>
        
        {/* 工作流设计器 */}
            <motion.div
              variants={staggerChildren}
              initial="hidden"
              animate="visible"
          className="mb-8"
            >
                <Card className="bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-xl">
            <CardHeader className="flex flex-row justify-between items-center">
              <h2 className="text-xl font-semibold text-amber-400">工作流设计器</h2>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  startContent={<IconPlus size={16} />}
                  onClick={() => addNode(NODE_TYPES.TEXT)}
                  isDisabled={!canAddNode(NODE_TYPES.TEXT)}
                >
                  文字节点
                </Button>
                <Button
                        size="sm"
                  variant="flat"
                  color="warning"
                  startContent={<IconPlus size={16} />}
                  onClick={() => addNode(NODE_TYPES.IMAGE)}
                  isDisabled={!canAddNode(NODE_TYPES.IMAGE)}
                >
                  图像节点
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  startContent={<IconPlus size={16} />}
                  onClick={() => addNode(NODE_TYPES.MUSIC)}
                  isDisabled={!canAddNode(NODE_TYPES.MUSIC)}
                >
                  音乐节点
                </Button>
                
                {workflow.length > 0 && (
                  <Button
                    size="sm"
                    variant="flat"
                    color="danger"
                    startContent={<IconClearAll size={16} />}
                    onClick={clearWorkflow}
                    isDisabled={isExecuting || isWorkflowLocked || editingStepIndex >= 0}
                  >
                    清空工作流
                  </Button>
                )}
                  </div>
            </CardHeader>
            <Divider />
            <CardBody>
              {workflow.length === 0 ? (
                <div className="text-center py-12">
                  <IconSettings size={48} className="text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">开始构建您的多模态工作流</p>
                  <p className="text-gray-500 text-sm">点击上方按钮添加节点</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-4 items-center">
                  {workflow.map((node, index) => {
                    const NodeIcon = getNodeIcon(node.type);
                    return (
                      <div key={node.id} className="flex items-center">
                        <Card className="bg-black/20 border border-amber-700/30 min-w-[320px] max-w-[400px]">
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-center w-full">
                      <div className="flex items-center gap-2">
                                <NodeIcon size={20} className="text-amber-500" />
                                <div className="flex flex-col items-start">
                                  <span className="text-white font-medium">
                                    {node.isInput ? '输入' : node.isOutput ? '输出' : '处理'} - {
                                      node.type === NODE_TYPES.TEXT ? '文字' : 
                                      node.type === NODE_TYPES.IMAGE ? '图像' : '音乐'
                                    }
                        </span>
                                  {node.task && (
                                    <span className="text-amber-400 text-xs">
                                      任务：{getTaskName(node.task)}
                                    </span>
                                  )}
                  </div>
                              </div>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  color="danger"
                                  onClick={() => removeNode(node.id)}
                                  isDisabled={isExecuting || isWorkflowLocked || editingStepIndex >= 0}
                                >
                                  <IconTrash size={16} />
                                </Button>
                    </div>
                          </CardHeader>
                          <CardBody className="pt-2 space-y-4">
                            {renderNodeContentInput(node)}
                            {renderModelSelect(node)}
                            {renderDurationConfig(node)}
                            {renderAdvancedSettings(node)}
                          </CardBody>
                        </Card>
                        
                        {index < workflow.length - 1 && (
                          <IconArrowRight size={24} className="text-amber-500 mx-2" />
                        )}
                  </div>
                    );
                  })}
                      </div>
              )}
                  </CardBody>
            
                        {workflow.length > 0 && (
              <CardFooter className="gap-3">
                <Button
                  color="warning"
                  variant="shadow"
                  startContent={<IconPlayerPlay size={18} />}
                  onClick={executeWorkflow}
                  isLoading={isExecuting && !isStepByStep}
                  isDisabled={!backendStatus.isConnected || isStepByStep || isWorkflowLocked || editingStepIndex >= 0}
                  className="bg-gradient-to-r from-amber-500 to-amber-700"
                  size="lg"
                >
                  {isExecuting && !isStepByStep ? "执行中..." : "执行完整流程"}
                </Button>
                
                <Button
                  color={isStepByStep ? "danger" : "secondary"}
                  variant={isStepByStep ? "shadow" : "flat"}
                  startContent={isStepByStep ? <IconX size={18} /> : <IconSettings size={18} />}
                  onClick={isStepByStep ? terminateStepExecution : startStepByStepExecution}
                  isDisabled={!backendStatus.isConnected || (isExecuting && !isStepByStep) || editingStepIndex >= 0}
                  size="lg"
                >
                  {isStepByStep ? "终止执行" : "分步执行"}
                </Button>
                
                {isStepByStep && currentStepIndex < workflow.length && (
                  <Button
                    color="success"
                    variant="shadow"
                    startContent={<IconPlayerPlay size={18} />}
                    onClick={executeNextStep}
                    isLoading={isExecuting}
                    isDisabled={isExecuting || editingStepIndex >= 0}
                    size="lg"
                  >
                    {isExecuting ? "执行中..." : "下一步"}
                  </Button>
                )}

              </CardFooter>
            )}
                </Card>
              </motion.div>
            
                {/* 执行结果 */}
        {(isExecuting || executionResults.length > 0 || stepResults.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="bg-black/40 backdrop-blur-md border border-amber-900/30 shadow-xl">
              <CardHeader>
                <h2 className="text-xl font-semibold text-amber-400">
                  {stepResults.length > 0 ? "分步执行结果" : "执行结果"}
                </h2>
              </CardHeader>
              <Divider />
              <CardBody className="space-y-4">
                {/* 分步执行结果 */}
                {stepResults.length > 0 && stepResults.map((result, index) => (
                  <div key={index} className="border border-gray-700 rounded-lg p-4 relative">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-white font-medium">
                        {result.step === 0 ? '输入' : `步骤 ${result.step}`}
                        {result.task && `: ${result.task}`}
                        {result.isEdited && <span className="text-amber-400 text-xs ml-2">(已编辑)</span>}
                      </h3>
                      
                      {/* 分步执行操作按钮 */}
                      {result.step > 0 && result.status === 'completed' && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="flat"
                            color="warning"
                            startContent={<IconRotateClockwise size={14} />}
                            onClick={() => regenerateStep(result.step)}
                            isDisabled={isExecuting || editingStepIndex >= 0}
                          >
                            重新生成
                          </Button>
                          
                          {/* 只有文字结果才显示编辑按钮 */}
                          {typeof result.output === 'string' && 
                           !result.output.startsWith('/') && 
                           !result.output.startsWith('http') && (
                            <Button
                              size="sm"
                              variant="flat"
                              color="secondary"
                              startContent={<IconEdit size={14} />}
                              onClick={() => startEditingStep(result.step)}
                              isDisabled={isExecuting || editingStepIndex >= 0}
                            >
                              编辑
                            </Button>
                          )}
                          
                          {/* 下一步按钮 */}
                          {result.step === currentStepIndex - 1 && currentStepIndex < workflow.length && (
                            <Button
                              size="sm"
                              variant="flat"
                              color="success"
                              startContent={<IconPlayerPlay size={14} />}
                              onClick={executeNextStep}
                              isDisabled={isExecuting || editingStepIndex >= 0}
                            >
                              下一步
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {result.model && (
                      <p className="text-gray-400 text-sm mb-3">使用模型: {result.model}</p>
                    )}
                    
                     {editingStepIndex === result.step ? (
                       <div className="space-y-3">
                         <div className="flex items-center gap-2 mb-2">
                           <div className="text-amber-400 text-sm font-medium">编辑结果:</div>
                           <div className="bg-amber-500/20 text-amber-300 text-xs px-2 py-1 rounded border border-amber-500/30">
                             编辑模式：其他操作已禁用
                           </div>
                         </div>
                         <Textarea
                           value={editingText}
                           onChange={(e) => setEditingText(e.target.value)}
                           placeholder="编辑生成的文本内容..."
                           rows={6}
                           className="bg-black/20 border-amber-700/30"
                           autoFocus
                         />
                         <div className="flex gap-2">
                           <Button
                             size="sm"
                             color="success"
                             onClick={saveEditedResult}
                             isDisabled={editingText.trim() === ''}
                           >
                             保存
                           </Button>
                           <Button
                             size="sm"
                             variant="flat"
                             onClick={cancelEditing}
                           >
                             取消
                           </Button>
                         </div>
                       </div>
                    ) : (
                      result.output && (
                        <div className="space-y-3">
                          <div className="text-amber-400 text-sm font-medium">
                            {result.step === 0 ? '输入内容:' : '输出结果:'}
                          </div>
                          {renderExecutionOutput(result.output, result.task)}
                        </div>
                      )
                    )}
                    
                    {result.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <div className="text-red-400 text-sm">
                          <strong>执行错误:</strong> {result.error}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {/* 完整流程执行结果 */}
                {stepResults.length === 0 && executionResults.map((result, index) => (
                  <div key={index} className="border border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-white font-medium">
                        步骤 {result.step}: {result.task}
                      </h3>
                      <div className="flex items-center gap-2">
                        {result.status === 'executing' && (
                          <Spinner size="sm" color="warning" />
                        )}
                        <span className={`text-sm px-2 py-1 rounded ${
                          result.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                          result.status === 'error' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {result.status === 'completed' ? '完成' : 
                           result.status === 'error' ? '错误' : '执行中'}
                        </span>
                      </div>
                    </div>
                    <p className="text-gray-400 text-sm mb-3">使用模型: {result.model}</p>
                    
                    {result.output && (
                      <div className="space-y-3">
                        <div className="text-amber-400 text-sm font-medium">输出结果:</div>
                        {renderExecutionOutput(result.output, result.task)}
                      </div>
                    )}
                    
                    {result.error && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                        <div className="text-red-400 text-sm">
                          <strong>执行错误:</strong> {result.error}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {isExecuting && currentExecutingStep >= 0 && (
                  <div className="border border-amber-700/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Spinner size="sm" color="warning" />
                      <h3 className="text-amber-400 font-medium">
                        正在执行步骤 {currentExecutingStep}...
                      </h3>
                    </div>
                    <div className="flex justify-center py-4">
                      <Spinner size="lg" color="warning" />
                    </div>
                    <p className="text-center text-gray-400 text-sm">正在处理中，请稍候...</p>
                  </div>
                )}
              </CardBody>
            </Card>
          </motion.div>
        )}
      </div>
      
      {/* 高级设置模态弹窗 */}
      <AdvancedSettingsModal
        isOpen={isAdvancedOpen}
        onClose={onAdvancedClose}
        currentEditingNode={currentEditingNode}
        tempAdvancedSettings={tempAdvancedSettings}
        setTempAdvancedSettings={setTempAdvancedSettings}
        updateNodeAdvancedSettings={updateNodeAdvancedSettings}
      />

      <ImagePreviewModal
        src={previewImage.src}
        alt={previewImage.alt}
        onClose={() => setPreviewImage({ src: '', alt: '' })}
      />
    </main>
  );
}
