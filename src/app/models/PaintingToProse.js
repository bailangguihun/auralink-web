import config from '@/config';

export default async function PaintingToProse(imageContent) {
  let file = null;

  // 将输入的图像内容转换为 File 对象
  if (typeof imageContent === 'string') {
    const response = await fetch(imageContent);
    const blob = await response.blob();
    const ext = blob.type.split('/').pop() || 'png';
    file = new File([blob], `uploaded-image.${ext}`, { type: blob.type });


  }

  if (!file) {
    throw new Error('无法获取有效的图片文件');
  }

  // 上传文件到 Coze 获取 file_id
  const { baseUrl, token, workflowId, uploadUrl } = config.paintingToProse;

  const cozeFormData = new FormData();
  cozeFormData.append('file', file);

  const cozeResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: cozeFormData,
  });

  if (!cozeResp.ok) {
    throw new Error(`Coze 上传失败: ${cozeResp.status}`);
  }

  const cozeData = await cozeResp.json();
  if (cozeData.code !== 0) {
    throw new Error('Coze 上传失败');
  }

  const fileId = cozeData.data?.id;
  if (!fileId) {
    throw new Error('获取 Coze 文件ID失败');
  }

  // 创建AbortController用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        parameters: {
          input: JSON.stringify({ file_id: fileId }),
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok || !resp.body) {
      throw new Error(`请求失败: ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result = '';

    // 读取超时控制
    const readTimeout = 30000; // 30秒读取超时
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
              let content = message.content;
              try {
                if (/^[A-Za-z0-9+/=]+$/.test(content)) {
                  content = new TextDecoder('utf-8').decode(
                    Uint8Array.from(atob(content), c => c.charCodeAt(0))
                  );
                }
              } catch (_) {
                // ignore decode errors
              }
              result += content;
            }
          } catch (_) {
            // ignore parse errors
          }
        }
      }
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  }
}

