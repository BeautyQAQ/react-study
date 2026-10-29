import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import MarkdownContent from './MarkdownContent'

describe('community Markdown', () => {
  test('renders Markdown formatting and maps portable uploads to the API prefix', () => {
    const { container } = render(<MarkdownContent content={'# 标题\n\n**重点**\n\n![图片](/uploads/image.png)'} />)
    expect(screen.getByRole('heading', { name: '标题' })).toBeInTheDocument()
    expect(container.querySelector('strong')).toHaveTextContent('重点')
    expect(screen.getByRole('img', { name: '图片' })).toHaveAttribute('src', '/api/uploads/image.png')
  })
  test('removes script, event, javascript URL, style and form injection', () => {
    const { container } = render(<MarkdownContent content={'<script>window.hacked=true</script><img src="x" onerror="window.hacked=true"><a href="javascript:alert(1)">链接</a><style>body{display:none}</style><form><input name="password"><button>伪造按钮</button></form><iframe src="https://example.test"></iframe>'} />)
    expect(container.querySelector('script,style,iframe,form,input,button,[onerror],[href^="javascript:"]')).toBeNull()
  })
  test('treats empty content as an empty preview', () => {
    const { container } = render(<MarkdownContent content="" />)
    expect(container.querySelector('.markdown-content')).toBeEmptyDOMElement()
  })
})
