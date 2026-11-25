'use client';
import { useEffect, useState, useRef } from 'react';
import { api, ApiError, isAbortError } from '@/lib/api';
import { assistantRequest } from '@/lib/assistant-api';
import { attachmentErrorMessage } from '@/lib/assistant-attachment-recovery';
import type { Attachment } from '@/lib/assistant-contracts';
import { useSession } from '@/components/session-provider';
import { LoadingStatus, Skeleton } from '@/components/loading';
import styles from './assistant.module.css';
import type { ImageCrop } from '@/lib/assistant-presentation';
export function UploadingAttachment({ name, file }: { name: string; file?: File }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <figure className={styles.attachment}>
    {url ? <img src={url} alt={name} /> : null}
    <figcaption>{name} · <span role="status">{file ? '上传中…' : '正在准备图片…'}</span></figcaption>
  </figure>;
}

export function PrivateAttachment({ id, crop, label, knownAttachment, localFile }: {
  id: string; crop?: ImageCrop; label?: string; knownAttachment?: Attachment; localFile?: File;
}) {
  const { token, sessionIdentity, isCurrentSession, signOutIfCurrent } = useSession();
  const [metadata, setMetadata] = useState<Attachment | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [image, setImage] = useState<{ metadata: Attachment; url: string } | null>(null); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    const dialogElement = dialog.current; const controller = new AbortController(); const identity = sessionIdentity; let url = '';
    setImage(null); setMetadata(null); setError('');
    const loadImage = async () => {
      const metadata = knownAttachment ?? await assistantRequest<Attachment>(`/attachments/${encodeURIComponent(id)}`, token, controller.signal);
      if (controller.signal.aborted || !isCurrentSession(identity)) return;
      setMetadata(metadata);
      const blob = localFile ?? await api.mediaBlob(metadata.contentUrl, token, controller.signal);
      if (controller.signal.aborted || !isCurrentSession(identity)) return;
      if (!['image/png', 'image/jpeg'].includes(blob.type)) throw new Error('图片响应格式不受支持。');
      url = URL.createObjectURL(blob); setImage({ metadata, url });
    };
    void loadImage().catch(error => {
      if (controller.signal.aborted || isAbortError(error) || !isCurrentSession(identity)) return;
      if (error instanceof ApiError && error.status === 401) { signOutIfCurrent(identity); return; }
      setError(attachmentErrorMessage(error));
    });
    return () => { controller.abort(); dialogElement?.close(); if (url) URL.revokeObjectURL(url); };
  }, [id, token, sessionIdentity, isCurrentSession, signOutIfCurrent, attempt, knownAttachment, localFile]);
  const cropStyle = crop && image ? { position: 'relative' as const, overflow: 'hidden', width: Math.min(170, 240 * crop.width * image.metadata.width / (crop.height * image.metadata.height)), maxWidth: '100%', aspectRatio: `${crop.width * image.metadata.width} / ${crop.height * image.metadata.height}` } : undefined;
  const imageStyle = crop ? { position: 'absolute' as const, maxWidth: 'none', maxHeight: 'none', width: `${100 / crop.width}%`, height: 'auto', left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` } : undefined;
  return <figure className={styles.attachment} data-testid={`attachment-${id}`}>
    {image ? <><button className={styles.imageButton} style={cropStyle} type="button" onClick={() => dialog.current?.showModal()} aria-label={`查看原图 ${image.metadata.filename}`}><img src={image.url} width={image.metadata.width} height={image.metadata.height} style={imageStyle} alt={crop ? `${label || "画面"}（原图局部）` : image.metadata.filename} /></button><figcaption>{crop ? `${label || "画面"} · 原图局部` : image.metadata.filename} · <a href={image.url} download={image.metadata.filename}>下载原图</a></figcaption><dialog ref={dialog} className={styles.dialog} aria-label={`原图 ${image.metadata.filename}`}><img src={image.url} width={image.metadata.width} height={image.metadata.height} alt={image.metadata.filename} /><p>{image.metadata.filename} · {image.metadata.width} × {image.metadata.height}</p><footer><a href={image.url} download={image.metadata.filename}>下载原图</a><button autoFocus type="button" className="button" onClick={() => dialog.current?.close()}>关闭原图</button></footer></dialog></> : error ? <><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重试图片</button></> : <><div className={styles.attachmentPlaceholder} style={{ width: metadata ? Math.min(metadata.width, 360, 300 * metadata.width / metadata.height) : 300, minHeight: metadata ? 0 : 50, aspectRatio: metadata ? `${metadata.width} / ${metadata.height}` : "4 / 3" }}><Skeleton className="skeleton-image" /></div><LoadingStatus label="正在读取私有图片" onRetry={() => setAttempt(value => value + 1)} /></>}
  </figure>;
}
