export function formatDate(value: string, short = false) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    ...(short ? {} : { year: 'numeric' as const }), month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export function safeRedirect(target: string | null) {
  return target?.startsWith('/') && !target.startsWith('//') && !target.includes('\\')
    && !/[\u0000-\u001f]/.test(target) && !target.startsWith('/login') ? target : '/'
}

export function externalUrl(value: string) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined }
  catch { return undefined }
}

export const validPassword = (value: string) => value.length >= 8 && new TextEncoder().encode(value).length <= 72
export const passwordHint = '密码至少 8 个字符，最多 72 字节'
