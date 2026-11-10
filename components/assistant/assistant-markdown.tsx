import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { assistantMarkdownLink, assistantIllustratedSections } from '@/lib/assistant-presentation';
import { PrivateAttachment } from './private-attachment';
import styles from './assistant.module.css';

/** Model text is untrusted. No HTML, remote media, or inferred citation links. */
export function AssistantMarkdown({ children, imageIds = [] }: { children: string; imageIds?: string[] }) {
  const sections = assistantIllustratedSections(children, imageIds);
  if (!sections.some(section => section.markdown || section.image)) return null;
  return <div className={styles.markdown}>{sections.map((section, index) => <section key={index} className={section.image ? styles.imageryCard : undefined}>
    {section.image ? <PrivateAttachment id={section.image.id} crop={section.image.crop} label={section.image.label} /> : null}
    <div><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img: ({ alt }) => <span className={styles.meta}>[图片未加载{alt ? `：${alt}` : ''}]</span>,
    a: ({ href, children }) => assistantMarkdownLink(href)
      ? <a href={assistantMarkdownLink(href)!} target="_blank" rel="noopener noreferrer nofollow">{children}<span className="sr-only">（外部链接，未经来源核验，在新窗口打开）</span></a>
      : <span>{children}</span>,
    table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
  }}>{section.markdown}</Markdown></div></section>)}</div>;
}
