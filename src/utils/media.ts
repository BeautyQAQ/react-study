const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

/** Upload paths remain portable in stored Markdown and user profiles. */
export function mediaUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  return value.startsWith('/uploads/') ? `${apiBase}${value}` : value
}
