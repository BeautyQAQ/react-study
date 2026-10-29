export interface User { id: number; username: string; alias: string; avatar: string; email: string; active: boolean; bio: string; createTime: string }
export type PublicUser = Omit<User, 'email' | 'active'>
export interface LoginForm { name: string; pass: string; rememberMe: boolean }
export interface RegisterForm { name: string; pass: string; checkPass: string; email: string }
export interface Tag { id: number; name: string; topicCount: number }
export interface Post { id: number; userId: number; username: string; alias: string; avatar: string; title: string; view: number; createTime: string; modifyTime: string; tags: Tag[]; top: boolean; essence: boolean }
export interface PostDetail extends Post { content: string; version: number; likes?: number; comments?: number; collects?: number; status?: string; moderationReason?: string }
export interface PostInput { title: string; content: string; tags: string[]; version?: number }
export interface DraftInput { title: string; content: string; tags: string[]; postId: number | null; postVersion: number | null; version: number }
export interface PostDraft extends DraftInput { id: string; updatedAt: string }
export interface DraftSummary { id: string; postId: number | null; title: string; excerpt: string; version: number; updatedAt: string; localOnly?: boolean }
export interface Page<T> { content: T[]; totalElements: number; totalPages: number; number: number; size: number }
export interface Tip { content: string; author: string }
export interface Promotion { id: number; title: string; link: string }
export interface Billboard { content: string }
export interface Comment { id: number; postId: number; parentId: number | null; username: string; alias: string; avatar: string; content: string; createdAt: string }
export interface Interaction { liked: boolean; bookmarked: boolean; likes: number; bookmarks: number; comments: number }
export interface Relationship { following: boolean; followers: number; followingCount: number }
export interface Member { id: number; username: string; alias: string; avatar: string; bio: string }
export interface SavedPost { id: number; title: string; username: string; alias: string; avatar: string; createTime: string; likes: number; comments: number; collects: number; status?: string; moderationReason?: string }
export interface Notification { id: number; type: string; actorUsername: string; actorAlias: string; postId: number | null; commentId: number | null; content: string; createdAt: string; read: boolean }
export interface Conversation { username: string; alias: string; avatar: string; lastContent: string; createdAt: string; unread: number }
export interface PrivateMessage { id: number; senderUsername: string; recipientUsername: string; content: string; createdAt: string; read: boolean }
