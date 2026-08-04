import config from '@/config';

const API_BASE_URL = config.api.baseUrl;
// 后端服务器文件根路径
const BACKEND_PATH = config.api.backendPath || '';

export default async function MoyinYinsheng(imageContent, modelId, options = {}) {
  const token = localStorage.getItem('auth_token');

  // 处理静态图片路径，需要先上传
  const isStaticImage = typeof imageContent === 'string' && imageContent.startsWith('/images/');
  if (isStaticImage) {
    try {
      const response = await fetch(imageContent);
      const blob = await response.blob();
      const file = new File([blob], 'generated-image.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`${API_BASE_URL}/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`静态图片上传失败: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      if (uploadData.success) {
        imageContent = uploadData.filepath || uploadData.data?.filepath;
      } else {
        throw new Error('静态图片上传失败');
      }
    } catch (err) {
      throw new Error(`静态图片处理失败: ${err.message}`);
    }
  }

  let imagePath = imageContent;

  // 处理blob URL（用户直接上传的图片）
  if (typeof imageContent === 'string' && imageContent.startsWith('blob:')) {
    try {
      const response = await fetch(imageContent);
      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });

      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await fetch(`${API_BASE_URL}/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error(`图片上传失败: ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      if (uploadData.success) {
        imagePath = uploadData.filepath || uploadData.data?.filepath;
      } else {
        throw new Error('图片上传失败');
      }
    } catch (err) {
      throw new Error(`图片上传失败: ${err.message}`);
    }
  }

  // 确保使用绝对路径，便于后端服务访问生成的图片
  let finalImagePath = imagePath;
  if (
    BACKEND_PATH &&
    typeof imagePath === 'string' &&
    !imagePath.startsWith('http://') &&
    !imagePath.startsWith('https://') &&
    !imagePath.startsWith('blob:')
  ) {
    // 仅对相对路径加前缀，避免已是绝对路径时重复拼接
    const normalizedPath = imagePath.replace(/\\/g, '/');
    const isRelativePath = !normalizedPath.startsWith('/');
    finalImagePath = isRelativePath
      ? `${BACKEND_PATH}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`
      : normalizedPath;
  }

  try {
    const generateResponse = await fetch(`${API_BASE_URL}/generate-music`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        imageUrl: finalImagePath,
        modelSize: modelId.replace('moyinyinsheng-', ''),
        useFastGenerate: true,
        duration: options.duration || 30,
      }),
    });

    if (!generateResponse.ok) {
      throw new Error(`音乐生成请求失败: ${generateResponse.status}`);
    }

    const data = await generateResponse.json();
    if (data.success) {
      const fileName = data.fileName || data.data?.fileName;
      if (fileName) {
        return `${API_BASE_URL}/files/${fileName}`;
      }
    }
    throw new Error(data.message || '音乐生成失败');
  } catch (error) {
    throw error;
  }
}
