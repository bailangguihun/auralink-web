import config from '@/config';

const API_BASE_URL = config.api.baseUrl;

export default async function MoyinXiansi(imageContent) {
  const token = localStorage.getItem('auth_token');
  let imagePath = imageContent;

  // 如果输入是静态图片路径，需要先上传到服务器
  if (typeof imageContent === 'string' && imageContent.startsWith('/images/')) {
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
      throw new Error(`图片上传失败: ${uploadResponse.status}`);
    }

    const uploadData = await uploadResponse.json();
    if (uploadData.success) {
      imagePath = uploadData.filepath || uploadData.data?.filepath;
    } else {
      throw new Error('图片上传失败');
    }
  }

  // 如果输入是blob URL（用户上传的图片）
  if (typeof imageContent === 'string' && imageContent.startsWith('blob:')) {
    const response = await fetch(imageContent);
    const blob = await response.blob();
    const file = new File([blob], 'user-image.jpg', { type: blob.type });

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
  }

  if (!imagePath) {
    throw new Error('无法获取有效的图片路径');
  }

  const describeResponse = await fetch(`${API_BASE_URL}/describe-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ imageUrl: imagePath }),
  });

  if (!describeResponse.ok) {
    throw new Error(`描述生成请求失败: ${describeResponse.status}`);
  }

  const data = await describeResponse.json();

  if (data.success) {
    let description = null;
    if (typeof data.description === 'string') {
      description = data.description;
    } else if (data.data && typeof data.data.description === 'string') {
      description = data.data.description;
    } else if (data.data && data.data.success && data.data.data && typeof data.data.data.description === 'string') {
      description = data.data.data.description;
    }

    if (description) {
      return description;
    }
    throw new Error('响应中缺少描述内容');
  }

  throw new Error(data.message || '图像描述生成失败');
}
