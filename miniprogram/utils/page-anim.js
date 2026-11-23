/**
 * 页面入场过渡动画。
 *
 * 小程序 switchTab 不会销毁页面，CSS 动画只会在首次渲染时播放。
 * 这里在每次 onShow 时切换 pageAnim 的 a/b 两个类名，强制重新触发同一段动画，
 * 让 Tab 切换、返回、从后台回前台都有轻微的淡入上浮过渡。
 *
 * 用法：
 *   Page(withPageAnim({ ... }))
 *   WXML 根节点：class="page {{pageAnim ? 'page-anim-' + pageAnim : ''}}"
 */
module.exports = function withPageAnim(config) {
  const originalOnShow = config.onShow

  config.data = Object.assign({}, config.data, {
    pageAnim: 'a'
  })

  config.onShow = function () {
    if (originalOnShow) originalOnShow.call(this)
    // 首次渲染已经用 a 播过入场，之后每次 onShow 在 a / b 之间切换以重新触发
    if (!this._pageAnimShown) {
      this._pageAnimShown = true
      return
    }
    this.setData({
      pageAnim: this.data.pageAnim === 'a' ? 'b' : 'a'
    })
  }

  return config
}
