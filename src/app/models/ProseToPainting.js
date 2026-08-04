import config from '@/config';

const API_BASE_URL = config.api.baseUrl;

// 文生图：白话生成国画
export default async function ProseToPainting(inputText, modelId) {
  let cfg;

  // 根据 modelId 选择对应的配置
  if (modelId === 'moyundanqing1') {
    cfg = config.moyundanqing1;
  } else if (modelId === 'moyundanqing2') {
    cfg = config.moyundanqing2;
  } else if (modelId === 'moyundanqing3') {
    cfg = config.moyundanqing3;
  } else {
    throw new Error(`未知的 modelId: ${modelId}`);
  }

  const { baseUrl, token, workflowId, appId, taskType } = cfg;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: {
          input: inputText
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!resp.ok || !resp.body) {
      throw new Error(`请求失败: ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result = '';

    const readTimeout = 30000;
    let lastReadTime = Date.now();

    while (true) {
      if (Date.now() - lastReadTime > readTimeout) {
        reader.cancel();
        throw new Error('流式读取超时');
      }

      const { value, done } = await reader.read();
      lastReadTime = Date.now();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.slice(6);
            const message = JSON.parse(jsonStr);
            if (message.content) {
              result += message.content;
            }
          } catch (_) {
            // ignore parse errors
          }
        }
      }
    }

    // 解析返回结果中的链接
    let link = result.trim();
    try {
      const parsed = JSON.parse(link);
      if (typeof parsed === 'string') {
        link = parsed;
      } else if (parsed) {
        link = parsed.output || parsed.url || parsed.data || parsed.link || link;
      }
    } catch (_) {
      // 如果不是JSON格式则尝试直接解析URL
      const directMatch = link.match(/https?:\/\/[^"'\s]+/);
      if (directMatch) {
        link = directMatch[0];
      }
    }

    if (!/^https?:\/\//.test(link)) {
      const fallbackMatch = result.match(/https?:\/\/[^"'\s]+/);
      if (fallbackMatch) {
        link = fallbackMatch[0];
      }
    }

    // 从链接获取实际图像并上传到后端
    const uploadToBackend = async (blob) => {
      const authToken = localStorage.getItem('auth_token');
      const ext = blob.type.split('/').pop() || 'png';
      const file = new File([blob], `generated-image.${ext}`, { type: blob.type });
      const formData = new FormData();
      formData.append('file', file);

      const uploadResp = await fetch(`${API_BASE_URL}/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData
      });

      if (!uploadResp.ok) {
        throw new Error(`图片上传失败: ${uploadResp.status}`);
      }

      const uploadData = await uploadResp.json();
      const filePath = uploadData.filepath || uploadData.data?.filepath;
      if (!filePath) {
        throw new Error('图片上传失败');
      }
      const fileName = filePath.split('/').pop();
      return `${API_BASE_URL}/files/${fileName}`;
    };

    try {
      let imageUrl = link;
      const resp1 = await fetch(link);
      if (resp1.ok) {
        const contentType = resp1.headers.get('content-type') || '';
        if (contentType.includes('image')) {
          const blob = await resp1.blob();
          return await uploadToBackend(blob);
        }

        // 尝试从文本响应中提取链接
        const text = await resp1.text();
        const match = text.match(/https?:\/\/[^"'\s]+/);
        if (match) {
          imageUrl = match[0];
        }
      }

      const imageResp = await fetch(imageUrl);
      if (imageResp.ok) {
        const blob = await imageResp.blob();
        return await uploadToBackend(blob);
      }
    } catch (_) {
      // 忽略错误，返回原始链接
    }

    return link;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  }
}

