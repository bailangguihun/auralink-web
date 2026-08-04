import config from '@/config';

export default async function Moyuqingyi(imageContent) {
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
  const { baseUrl, token, workflowId, uploadUrl } = config.Moyuqingyi;

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
    console.log('[Moyuqingyi] 开始调用工作流:', { workflowId, fileId });
    
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
    console.log('[Moyuqingyi] 收到响应:', { status: resp.status, ok: resp.ok, hasBody: !!resp.body });

    if (!resp.ok || !resp.body) {
      const errorText = await resp.text();
      console.error('[Moyuqingyi] 请求失败详情:', errorText);
      throw new Error(`请求失败: ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let result = '';

    // 读取超时控制
    const readTimeout = 30000; // 30秒读取超时
    let lastReadTime = Date.now();
    let chunkCount = 0;

    console.log('[Moyuqingyi] 开始读取流式数据...');

    while (true) {
      if (Date.now() - lastReadTime > readTimeout) {
        reader.cancel();
        throw new Error('流式读取超时');
      }

      const { value, done } = await reader.read();
      lastReadTime = Date.now();

      if (done) {
        console.log('[Moyuqingyi] 流式读取完成，共处理', chunkCount, '个数据块，结果长度:', result.length);
        break;
      }

      chunkCount++;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      
      console.log('[Moyuqingyi] 收到数据块', chunkCount, '，行数:', lines.length);

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.slice(6);
            const message = JSON.parse(jsonStr);
            
            // 打印接收到的消息结构（只打印第一条）
            if (chunkCount === 1) {
              console.log('[Moyuqingyi] 消息结构示例:', JSON.stringify(message, null, 2));
            }
            
            // 支持多种可能的输出字段：content, output, reasoning_content
            const content = message.content || message.output || message.reasoning_content;
            
            if (content) {
              let decodedContent = content;
              try {
                // 尝试Base64解码
                if (/^[A-Za-z0-9+/=]+$/.test(content)) {
                  decodedContent = new TextDecoder('utf-8').decode(
                    Uint8Array.from(atob(content), c => c.charCodeAt(0))
                  );
                }
              } catch (_) {
                // 解码失败则使用原始内容
              }
              result += decodedContent;
              
              console.log('[Moyuqingyi] 累积内容长度:', result.length, '本次添加:', decodedContent.length);
            } else {
              console.log('[Moyuqingyi] 消息中无内容字段:', Object.keys(message));
            }
          } catch (err) {
            console.error('[Moyuqingyi] 解析错误:', err, '原始数据:', trimmed.substring(0, 100));
          }
        }
      }
    }

    console.log('[Moyuqingyi] 最终返回结果长度:', result.length);
    console.log('[Moyuqingyi] 结果预览:', result.substring(0, 200));
    
    if (!result || result.length === 0) {
      console.warn('[Moyuqingyi] 警告：返回结果为空！');
    }
    
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('[Moyuqingyi] 执行出错:', error);
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试');
    }
    throw error;
  }
}

