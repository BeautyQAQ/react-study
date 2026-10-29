import request from '@/utils/request'
import type { User, PublicUser, RegisterForm } from '@/types'
export const userRegister = (data: RegisterForm) => request<User>({ url: '/ums/user/register', method: 'post', data })
export const login = (data: { username: string; password: string; rememberMe: boolean }) => request<{ token: string }>({ url: '/ums/user/login', method: 'post', data })
export const getUserInfo = () => request<User>({ url: '/ums/user/info' })
export const logout = () => request<null>({ url: '/ums/user/logout', method: 'post' })

export const getProfile = (username: string) => request<PublicUser>({ url: `/ums/user/profile/${encodeURIComponent(username)}` })
export const saveProfile = (data: { alias: string; bio: string }) => request<User>({ url: '/ums/user/profile', method: 'post', data })
export const changePassword = (data: { currentPass: string; password: string; checkPass: string }) => request<null>({ url: '/ums/user/password', method: 'post', data })
export const saveAvatar = (url: string) => request<User>({ url: '/ums/user/avatar', method: 'post', data: { url } })
export const sendEmailCode = () => request<null>({ url: '/ums/user/email/send', method: 'post', data: {} })
export const verifyEmail = (code: string) => request<unknown>({ url: '/ums/user/email/verify', method: 'post', data: { code } })
export const forgotPassword = (email: string) => request<null>({ url: '/ums/user/password/forgot', method: 'post', data: { email } })
export const resetPassword = (data: { email: string; code: string; password: string; checkPass: string }) => request<null>({ url: '/ums/user/password/reset', method: 'post', data })
