import { useId, useRef, type ChangeEvent } from 'react'
import { uploadImage } from '@/api/uploads'
import { useAction } from '@/hooks/useAsync'
import { ErrorNotice } from './common'

export default function ImageUploader({ label = '上传图片', disabled = false, onUploaded, onUploading }: {
  label?: string; disabled?: boolean; onUploaded: (url: string) => void | Promise<void>; onUploading?: (value: boolean) => void
}) {
  const action = useAction(), input = useRef<HTMLInputElement>(null), id = useId()
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || action.busy) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      action.setError('请选择不超过 4 MB 的 PNG 或 JPEG 图片'); return
    }
    onUploading?.(true)
    try { await action.run(async () => { const { data } = await uploadImage(file); await onUploaded(data.url) }) }
    finally { onUploading?.(false) }
  }
  return <div className="image-upload">
    <input id={id} ref={input} hidden type="file" accept="image/png,image/jpeg" disabled={disabled || action.busy} onChange={event => void upload(event)} aria-label={label} tabIndex={-1} />
    <button type="button" disabled={disabled || action.busy} onClick={() => input.current?.click()}>{action.busy ? '正在上传…' : label}</button>
    <small className="muted">PNG、JPEG，最大 4 MB</small>
    <ErrorNotice error={action.error} />
  </div>
}
