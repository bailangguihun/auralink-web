import config from '@/config';

export default async function ProseToPoetry(inputText, modelId) {
  let cfg;

  // 根据 modelId 选择对应的配置
  if (modelId === 'prose-to-poetry-ds') {
    cfg = config.proseToPoetryDS;
  } else if (modelId === 'prose-to-poetry-kimi') {
    cfg = config.proseToPoetryKIMI;
  } else if (modelId === 'prose-to-poetry-doubao') {
    cfg = config.proseToPoetryDOUBAO;
  } else {
    throw new Error(`未知的 modelId: ${modelId}`);
  }

  const { baseUrl, token, workflowId, appId, taskType } = cfg;

  // 创建AbortController用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时

  try {
    const resp = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        app_id: appId,
        parameters: {
          input_text: inputText,
          task_type: taskType
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

    // 添加读取超时控制
    const readTimeout = 30000; // 30秒读取超时
    let lastReadTime = Date.now();

    while (true) {
      // 检查读取超时
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
              // 如果是 base64，就解码；否则直接用
              try {
                if (/^[A-Za-z0-9+/=]+$/.test(content)) {
                  content = new TextDecoder('utf-8').decode(
                    Uint8Array.from(atob(content), c => c.charCodeAt(0))
                  );
                }
              } catch (_) {
                // 不是 base64，忽略错误
              }
              result += content;
            }
          } catch (e) {
            // 忽略解析错误
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
