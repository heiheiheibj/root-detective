import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 兜住渲染期异常：懒加载分片内容损坏、未知数据问题都可能把整棵树炸掉，
 * 没有这层兜底用户看到的就是白屏（计划书 line 311）。
 *
 * 这里只负责「别白屏 + 给出重新加载入口」，不做自动恢复——数据问题应该被
 * content 闸门拦住，线上不该靠兜底页兜着。
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] 渲染异常：', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <div className="crash-screen" role="alert">
      <div className="empty-state">
        <span className="eyebrow">出了点问题</span>
        <h3>页面没能画出来</h3>
        <p>{this.state.error.message || '未知错误'}</p>
        <button className="primary-button" onClick={() => window.location.reload()}>重新加载</button>
      </div>
    </div>
  }
}
