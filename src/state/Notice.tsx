import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

const NoticeContext = createContext<(message: string) => void>(() => {})
export const useNotice = () => useContext(NoticeContext)

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const notify = useCallback((text: string) => {
    clearTimeout(timer.current)
    setMessage(text)
    timer.current = setTimeout(() => setMessage(''), 5000)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return <NoticeContext.Provider value={notify}>
    {children}
    {message && <div className="toast" role="status">{message}<button type="button" aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
  </NoticeContext.Provider>
}
