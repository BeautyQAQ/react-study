import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getBillboard } from '@/api/billboard'
import { getTags } from '@/api/post'
import { useResource } from '@/hooks/useAsync'
import PostList from '@/components/PostList'
import Sidebar from '@/components/Sidebar'
import { ErrorNotice, Loading } from '@/components/common'

export function Home() {
  const billboard = useResource(getBillboard, [])
  return <>
    <h1 className="sr-only">社区主题</h1>
    <div className="announcement panel" aria-label="社区公告">
      <span className="badge">公告</span>
      {billboard.loading ? <Loading text="正在加载公告…" /> : billboard.error ? <ErrorNotice error={billboard.error} retry={billboard.reload} /> : <p>{billboard.data?.content || '欢迎来到流沙社区'}</p>}
    </div>
    <div className="community-columns"><PostList discovery /><Sidebar /></div>
  </>
}
export function Browse() {
  const { name: tag = '' } = useParams(), [params] = useSearchParams()
  const query = (params.get('key') || '').slice(0, 100)
  const tags = useResource(getTags, [])
  return <><h1 className="page-title">{tag ? `标签：${tag}` : `搜索：${query || '全部主题'}`}</h1>
    <ErrorNotice error={tags.error} retry={tags.reload} />
    <div className="tags browse-tags">{tags.data?.map(item => <Link className="tag" key={item.id} to={`/tag/${encodeURIComponent(item.name)}`}>#{item.name} · {item.topicCount}</Link>)}</div>
    <PostList key={tag + ':' + query} query={query} tag={tag} />
  </>
}
