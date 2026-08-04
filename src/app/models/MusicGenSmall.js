import config from '@/config';

export default async function MusicGenSmall(prompt, options = {}) {
  const { baseUrl, apiKey } = config.musicgen;

  const body = {
    prompt,
    model: 'small',
    duration: options.duration ?? 30,
    temperature: options.temperature ?? 1,
    top_k: options.top_k ?? 250,
    top_p: options.top_p ?? 0,
    cfg_coef: options.cfg_coef ?? 3,
    use_sampling: options.use_sampling ?? true,
    two_step_cfg: options.two_step_cfg ?? false,
  };

  const resp = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new Error(`音乐生成请求失败: ${resp.status}`);
  }

  const data = await resp.json();
  if (data.success && data.data && data.data.audio_data) {
    return `data:audio/wav;base64,${data.data.audio_data}`;
  }

  throw new Error(data.message || '音乐生成失败');
}
