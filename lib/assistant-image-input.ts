const MaxImageBytes = 10 * 1024 * 1024;
const MaxImagePixels = 32_000_000;
const extensions = /\.(?:jpe?g|jfif|png|webp|gif|bmp|avif)$/i;

export const assistantImageAccept = 'image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif,.jpg,.jpeg,.jfif,.png,.webp,.gif,.bmp,.avif';

export function isAssistantImageInput(file: File): boolean {
  return file.type.startsWith('image/') || extensions.test(file.name);
}

async function detectImageType(blob: Blob): Promise<string | null> {
  const header = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => header[index] === byte)) return 'image/png';

  const text = String.fromCharCode(...header);
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp';
  if (text.startsWith('GIF87a') || text.startsWith('GIF89a')) return 'image/gif';
  if (text.startsWith('BM')) return 'image/bmp';
  if (header.length >= 16 && text.slice(4, 8) === 'ftyp') {
    const isAvif = (offset: number) => ['avif', 'avis'].includes(text.slice(offset, offset + 4));
    if (isAvif(8)) return 'image/avif';
    const boxEnd = Math.min(new DataView(header.buffer).getUint32(0), header.length);
    for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
      if (isAvif(offset)) return 'image/avif';
    }
  }
  return null;
}

/** Normalize browser input to the JPEG/PNG contract used by storage and models. */
export async function assistantImageFile(blob: Blob, filename: string): Promise<File> {
  if (!blob.size) throw new Error('图片文件为空，请重新选择。');
  if (blob.size > MaxImageBytes) throw new Error('图片超过 10 MiB，请缩小后再添加。');
  const type = await detectImageType(blob);
  if (!type) throw new Error('请选择有效的 JPG、JPEG、PNG、WebP、GIF、BMP 或 AVIF 图片。');
  const stem = filename.replace(/\.[^.]+$/, '') || 'image';
  if (type === 'image/jpeg' || type === 'image/png') {
    const validExtension = type === 'image/jpeg' ? /\.jpe?g$/i : /\.png$/i;
    const name = validExtension.test(filename) ? filename : stem + (type === 'image/jpeg' ? '.jpg' : '.png');
    if (blob instanceof File && blob.type === type && blob.name === name) return blob;
    return new File([blob], name, { type });
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob.slice(0, blob.size, type));
  } catch {
    throw new Error('无法解码这张图片，请确认文件完整，或转为 JPG 或 PNG 后重试。');
  }
  try {
    if (bitmap.width * bitmap.height > MaxImagePixels) throw new Error('图片分辨率过高，请缩小后再添加。');
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('这个浏览器暂时无法转换图片。');
    context.drawImage(bitmap, 0, 0);
    const converted = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (converted?.type !== 'image/png') throw new Error('图片转换失败，请转为 JPG 或 PNG 后重试。');
    if (converted.size > MaxImageBytes) throw new Error('图片转为 PNG 后超过 10 MiB，请缩小后再添加。');
    return new File([converted], stem + '.png', { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}
