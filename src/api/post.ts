import type { Page, Post, PostDetail, PostInput, Tag } from '@/types'
import request from '@/utils/request'
export const getList = (pageNo: number, size: number, tab = 'latest', filters: { query?: string; tag?: string; author?: string } = {}) =>
  request<Page<Post>>({ url: '/post/list', params: { pageNo, size, tab, ...filters } })
export const getPost = (id: string | number) => request<PostDetail>({ url: `/post/${id}` })
export const createPost = (data: PostInput) => request<PostDetail>({ url: '/post/add', method: 'post', data })
export const updatePost = (id: string | number, data: PostInput) => request<PostDetail>({ url: `/post/${id}`, method: 'put', data })
export const deletePost = (id: string | number) => request<null>({ url: `/post/${id}`, method: 'delete' })
export const getTags = () => request<Tag[]>({ url: '/tag/list' })
export const getFollowingPosts = (pageNo: number, size: number, filters: { query?: string; tag?: string; author?: string } = {}) =>
  request<Page<Post>>({ url: '/me/feed', params: { pageNo, size, ...filters } })
