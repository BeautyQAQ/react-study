import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { mediaUrl } from '@/utils/media'

export function markdownHtml(content: string): string {
  const fragment = DOMPurify.sanitize(marked.parse(content, { async: false }), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style'],
    RETURN_DOM_FRAGMENT: true,
  })
  fragment.querySelectorAll('img').forEach(image => {
    const source = image.getAttribute('src')
    if (source?.startsWith('/uploads/')) image.setAttribute('src', mediaUrl(source)!)
    image.setAttribute('loading', 'lazy')
    image.setAttribute('decoding', 'async')
  })
  fragment.querySelectorAll('a').forEach(link => {
    if (link.getAttribute('target') === '_blank') link.setAttribute('rel', 'noopener noreferrer')
  })
  const container = document.createElement('div')
  container.append(fragment)
  return container.innerHTML
}
export default function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => markdownHtml(content), [content])
  return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
}
