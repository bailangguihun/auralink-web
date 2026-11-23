const MaxImageBytes = 10 * 1024 * 1024;
const MaxImagePixels = 32_000_000;

/** Normalize WebP at the browser boundary before the existing JPEG/PNG upload. */
export async function assistantImageFile(blob: Blob, filename: string): Promise<File> {
  if (blob instanceof File && blob.type !== 'image/webp') return blob;
  if (blob.type !== 'image/webp') return new File([blob], filename, { type: blob.type });
  if (blob.size > MaxImageBytes) throw new Error('WebP 图片超过 10 MiB，请缩小后再添加。');
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > MaxImagePixels) throw new Error('WebP 图片分辨率过高，请缩小后再添加。');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('这个浏览器暂时无法转换 WebP 图片。');
    context.drawImage(bitmap, 0, 0);
    const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (converted?.type !== 'image/png') throw new Error('WebP 图片转换失败，请选择 JPEG 或 PNG。');
    if (converted.size > MaxImageBytes) throw new Error('WebP 转为 PNG 后超过 10 MiB，请缩小后再添加。');
    return new File([converted], filename.replace(/\.webp$/i, '') + '.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
