import type { Billboard } from '@/types'
import request from '@/utils/request'

export function getBillboard() {
  return request<Billboard>({
    url: '/billboard/show',
    method: 'get'
  })
}
