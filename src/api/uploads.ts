import request from '@/utils/request'

export async function uploadImage(file: File) {
  const data = new FormData()
  data.append('file', file)
  return request<{ url: string }>({ url: '/uploads/image', method: 'post', data, timeout: 60000 })
}
