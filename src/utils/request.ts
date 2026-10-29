import axios, { type AxiosRequestConfig } from 'axios'
import { getToken } from './auth'

export interface ApiResult<T> { code: number; message: string; data: T }
interface RequestConfig extends AxiosRequestConfig { quiet?: boolean }
const service = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api', timeout: 10000 })
service.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiResult<unknown>>(error)) {
    return error.response?.data?.message || '网络连接失败，请稍后重试'
  }
  return error instanceof Error ? error.message : '请求失败，请重试'
}

export default async function request<T>(config: RequestConfig): Promise<ApiResult<T>> {
  try {
    const { quiet: _quiet, ...options } = config
    const { data } = await service.request<ApiResult<T>>(options)
    if (data.code !== 200) throw new Error(data.message || '请求失败')
    return data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401 && config.url !== '/ums/user/login') {
      const token = getToken()
      // A response from an old session must not sign out a newly logged-in account.
      if (token && error.config?.headers?.Authorization === `Bearer ${token}`) {
        window.dispatchEvent(new Event('community:unauthorized'))
      }
    }
    throw error
  }
}
