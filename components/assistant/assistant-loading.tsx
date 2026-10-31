'use client';
import { LoadingStatus, Skeleton, SkeletonRows } from '@/components/loading';
import styles from './assistant.module.css';

export function ConversationLoading() {
  return <><header className={styles.conversationHeader}><h2>国画助手</h2><Skeleton className="skeleton-short" /></header><div className={styles.branchWorkspace}><section className={styles.messages} aria-label="正在恢复对话"><div className={styles.loadingMessages} aria-hidden="true"><SkeletonRows lines={2} /><SkeletonRows lines={5} /></div><LoadingStatus label="正在恢复已保存的会话" /></section><div className={styles.composer}><div className={styles.inputRow}><textarea disabled rows={1} placeholder="会话恢复后可以继续输入" aria-label="消息（正在恢复）" /><button className={styles.sendButton} disabled>发送</button></div><div className={styles.composerActions}><Skeleton className="skeleton-short" /></div></div></div></>;
}
export function AssistantLoading({ embedded = false }: { embedded?: boolean }) {
  const workspace = <div className={styles.layout}><aside className={styles.sidebar} aria-label="正在恢复会话列表"><div className={styles.sidebarHeading}><span className={styles.eyebrow}>ARTLIVE ASSISTANT</span><h2>国画助手</h2></div><button className={styles.newSession} disabled>＋ 新建对话</button><SkeletonRows lines={7} /></aside><main className={styles.main}><div className={styles.mobileSessions}><button className={styles.small} disabled>☰ 我的对话</button><span>国画助手</span></div><ConversationLoading /></main></div>;
  return embedded ? workspace : <div className={styles.page} data-navigation-page="">{workspace}</div>;
}
