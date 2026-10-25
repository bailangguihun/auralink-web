'use client';
import { useEffect, useState } from 'react';
import { LoadingStatus, SkeletonRows } from '@/components/loading';
import { ApiError, isAbortError } from '@/lib/api';
import { assistantRequest } from '@/lib/assistant-api';
import { assistantBytes, assistantStorageNotice, type AssistantStorageUsage } from '@/lib/assistant-storage';
import { useAssistantAccess } from './use-assistant-access';
import styles from './assistant.module.css';

/** This panel never gates history or dispatch. Core atomically decides each upload. */
export function AssistantStorage({ access, revision }: { access: ReturnType<typeof useAssistantAccess>; revision: number }) {
  const [usage, setUsage] = useState<AssistantStorageUsage | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [refresh, setRefresh] = useState(0);
  const { request } = access;
  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    void request((token, signal) => assistantRequest<AssistantStorageUsage>('/storage', token, signal)).then(value => { if (alive) setUsage(value); }).catch(failure => {
      if (alive && !isAbortError(failure)) {
        if (failure instanceof ApiError && [401, 403].includes(failure.status)) { setUsage(null); setError('图片用量访问未获确认，已清除旧用量。请重新读取。'); }
        else setError('暂未核对最新图片用量。已有记录仍可读取、下载、导出和删除；请重新读取用量。');
      }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [request, revision, refresh]);
  const notice = usage ? assistantStorageNotice(usage) : null;
  return <section className={`glass-panel ${styles.tools}`} aria-label="图片存储用量" data-testid="assistant-storage">
    <div className={styles.inline}><strong>图片存储</strong><button type="button" className={styles.small} disabled={loading} onClick={() => setRefresh(value => value + 1)}>刷新用量</button>{loading ? <LoadingStatus label={usage ? "正在核对，暂保留上次用量" : "正在核对图片用量"} onRetry={() => setRefresh(value => value + 1)} /> : null}</div>
    {error ? <p role="alert">{error}</p> : null}
    {loading && !usage ? <SkeletonRows /> : null}
    {usage ? <>
      <p>{error ? '上次读取：' : ''}已占配额 <strong>{assistantBytes(usage.chargedBytes)}</strong>{usage.quotaBytes !== null ? <> / {assistantBytes(usage.quotaBytes)}；可用 {assistantBytes(usage.availableBytes!)}</> : '；配额尚未配置'}</p>
      {notice ? <p role="status">{notice}</p> : null}
      <details><summary>用量与保留说明</summary>
        <p>已保存图片 {assistantBytes(usage.readyBytes)}，上传预留 {assistantBytes(usage.reservedBytes)}，合计逻辑用量 {assistantBytes(usage.logicalBytes)}。另有待清理预留 {assistantBytes(usage.cleanupReservedBytes)}，清理完成前仍占配额；重复核对同一次上传不会重复占用。</p>
        <p>当前实际保留文件 {assistantBytes(usage.retainedFileBytes)}，其中等待清理 {assistantBytes(usage.pendingCleanupBytes)}。逻辑删除不等于文件已从磁盘或备份中清除；实际文件量不是额外可用配额。</p>
        <p>有效草稿按图片标注的服务器到期时间恢复。未发送图片到期后不能继续发送，请重新选择；已发送图片随消息及历史分支保留。离开页面或释放浏览器预览不会删除服务器图片。</p>
        <p>{usage.cleanupEnabled ? '服务器允许按已配置政策执行有界清理；此页面不会自行执行清理。' : '当前未开放按政策执行清理；页面不会自动删除记录。'} 备份保留时间以实际服务政策为准，不承诺随界面删除同步抹除。</p>
      </details>
    </> : !loading && !error ? <p>图片用量尚未核对。</p> : null}
  </section>;
}
