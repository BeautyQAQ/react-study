import type { Promotion } from '@/types'
import request from '@/utils/request'

// 获取推广
export function getList() {
  return request<Promotion[]>({
    url: '/promotion/all',
    method: 'get'
  })
}
