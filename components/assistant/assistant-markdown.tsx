import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assistantMarkdownLink } from '@/lib/assistant-presentation';
import styles from './assistant.module.css';

/** Model text is untrusted. No HTML, remote media, or inferred citation links. */
export function AssistantMarkdown({ children }: { children: string }) {
  return <div className={styles.markdown}><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img: ({ alt }) => <span className={styles.meta}>[图片未加载{alt ? `：${alt}` : ''}]</span>,
    a: ({ href, children }) => assistantMarkdownLink(href)
      ? <a href={assistantMarkdownLink(href)!} target="_blank" rel="noopener noreferrer nofollow">{children}<span className="sr-only">（外部链接，未经来源核验，在新窗口打开）</span></a>
      : <span>{children}</span>,
    table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
  }}>{children}</Markdown></div>;
}
