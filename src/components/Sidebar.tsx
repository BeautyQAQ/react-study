import { Link } from 'react-router-dom'
import { getTodayTip } from '@/api/tip'
import { getList } from '@/api/promote'
import { useResource } from '@/hooks/useAsync'
import { useAuth } from '@/state/Auth'
import { externalUrl } from '@/utils/format'
import { ErrorNotice, Loading, Panel } from './common'

export default function Sidebar() {
  const { user } = useAuth()
  const tip = useResource(getTodayTip, []), promotions = useResource(getList, [])
  return <aside className="sidebar" aria-label="社区信息">
    <Panel title={<h2>分享你的想法</h2>}>
      <p className="muted">每一次分享，都可能帮到另一个人。</p>
      <div className="actions">{user ? <><Link className="button primary" to="/post/create">发表想法</Link><Link to="/me/drafts">草稿箱</Link></> : <><Link className="button primary" to="/register">马上入驻</Link><Link className="button" to="/login">社区登录</Link></>}</div>
    </Panel>
    <Panel title={<h2>每日一句</h2>}>
      {tip.loading ? <Loading /> : tip.error ? <ErrorNotice error={tip.error} retry={tip.reload} /> : <blockquote>{tip.data?.content || '欢迎分享你的经验与想法。'}<footer>—— {tip.data?.author || '流沙社区'}</footer></blockquote>}
    </Panel>
    <Panel title={<h2>资源推介</h2>}>
      {promotions.loading ? <Loading /> : promotions.error ? <ErrorNotice error={promotions.error} retry={promotions.reload} /> : promotions.data?.length ? <ul className="resource-list">
        {promotions.data.map(item => <li key={item.id}>{externalUrl(item.link) ? <a href={externalUrl(item.link)} target="_blank" rel="noopener noreferrer">{item.title}<span className="sr-only">（在新窗口打开）</span></a> : <span>{item.title}</span>}</li>)}
      </ul> : <p className="muted">暂无推广内容</p>}
    </Panel>
    <Panel title={<h2>小游戏</h2>}><p className="muted">换换脑筋，两个人轮流下一盘。</p><Link className="button" to="/games/tic-tac-toe">开始井字棋</Link></Panel>
  </aside>
}
