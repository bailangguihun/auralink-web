'use client';
import { useEffect, useId, useRef } from 'react';
import type { Registry } from '@/lib/assistant-contracts';
import styles from './assistant.module.css';

/** Native modal semantics: inert background, trapped focus, Escape, and return focus. */
export function AssistantPanel({ title, eyebrow, children, close, footer }: {
  title: string; eyebrow?: string; children: React.ReactNode; close: () => void; footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); if (prior?.isConnected) prior.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className={styles.panel} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }}>
    <header className={styles.panelHeader}><div>{eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}<h2 id={titleId}>{title}</h2></div><button type="button" autoFocus className={styles.iconButton} aria-label={`关闭${title}`} onClick={close}>×</button></header>
    <div className={styles.panelBody}>{children}</div>
    {footer ? <footer className={styles.panelFooter}>{footer}</footer> : null}
  </dialog>;
}

export function AssistantModelPicker({ registry, value, onChange, disabled }: {
  registry: Registry | null; value: string; onChange: (id: string) => void; disabled: boolean;
}) {
  // Focus can move without selecting a model or implicitly submitting the composer.
  const ref = useRef<HTMLDialogElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const selected = registry?.models.find(model => model.id === value);
  const close = () => { ref.current?.close(); anchor.current?.focus({ preventScroll: true }); };
  const show = () => {
    const dialog = ref.current, button = anchor.current; if (!dialog || !button) return;
    const rect = button.getBoundingClientRect();
    dialog.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 352))}px`;
    dialog.style.bottom = `${Math.max(12, window.innerHeight - rect.top + 8)}px`;
    dialog.showModal();
    const option = dialog.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not(:disabled)') || dialog.querySelector<HTMLElement>('[role="radio"]:not(:disabled)') || dialog.querySelector('button');
    option?.focus(); option?.scrollIntoView({ block: 'nearest' });
  };
  return <><button ref={anchor} type="button" className={styles.modelTrigger} aria-haspopup="dialog" disabled={disabled} onClick={show}>{selected?.label || '选择模型'} <span aria-hidden>⌃</span></button>
    <dialog ref={ref} className={`${styles.panel} ${styles.modelMenu}`} aria-labelledby={labelId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
      <header className={styles.panelHeader}><div><span className={styles.eyebrow}>MODEL REGISTRY</span><h2 id={labelId}>选择模型</h2></div><button type="button" className={styles.iconButton} aria-label="关闭模型选择" onClick={close}>×</button></header>
      <div className={styles.panelBody} role="radiogroup" aria-label="模型" onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
        if (!options.length) return; event.preventDefault();
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + options.length) % options.length;
        options[index]?.focus();
      }}>
        {!registry ? <p role="status">模型注册表尚未读取成功，请刷新会话后重试。</p> : !registry.models.length ? <p>注册表暂无模型。</p> : null}
        {registry?.models.map(model => <button type="button" role="radio" aria-checked={value === model.id} className={styles.modelOption} key={model.id} disabled={!model.enabled || !model.configured || !model.capabilities.streaming} onClick={() => { onChange(model.id); close(); }}>
          <span aria-hidden className={styles.modelCheck}>{value === model.id ? '●' : '○'}</span>
          <span><strong>{model.label}</strong><small>{model.providerId} · {model.capabilities.images ? '文字与图片' : '文字'}{!model.configured ? ' · 未配置' : !model.enabled ? ' · 已停用' : !model.capabilities.streaming ? ' · 不支持流式会话' : ''}</small><small>能力声明：{model.evidence || '尚无提供商验证声明'}</small></span>
        </button>)}
      </div>
    </dialog>
  </>;
}
