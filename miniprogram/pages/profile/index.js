const dataService = require('../../services/data')
const config = require('../../config')
const F = require('../../utils/format')
const withPageAnim = require('../../utils/page-anim')

Page(withPageAnim({
  data: {
    version: config.version,
    updated: '',
    updateTime: '',
    todayText: '',
    sourceText: '内置快照',
    sourceNote: '',
    statusNote: '',
    etfCount: 16,
    dateCount: 147,
    notif: false,
    cacheText: '0 KB',
    showSources: false,
    sources: [
      { key: 'sse', name: '交易所 / 基金公告', desc: '16 只 ETF 的最新份额，T+1 披露', time: '每日 23:00', tone: '' },
      { key: 'em', name: '东方财富行情接口', desc: '收盘价、涨跌幅，用于计算净流入与规模', time: '每日 17:00', tone: '' },
      { key: 'cffex', name: '中金所持仓排名', desc: '前 20 会员的多空持仓，收盘后更新', time: '收盘后更新', tone: 'green' },
      { key: 'datacenter', name: '东方财富 datacenter', desc: '期指多空龙虎榜，盘中实时值', time: '缓存 5 分钟', tone: 'amber' }
    ],
    disclaimer: ''
  },

  onLoad() {
    this.render()
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    const status = dataService.getStatus()
    let notif = false
    try {
      notif = wx.getStorageSync('etf:notify') === true
    } catch (e) {
      notif = false
    }
    const cache = dataService.getCacheInfo()
    const isStatic = status.mode === 'offline'
    const sourceText =
      status.source === 'live' ? '实时接口' : status.source === 'cache' ? '本地缓存' : '内置快照'
    const sourceNote = isStatic
      ? '当前使用随包发布的静态快照（方案 C），运行时不联网；更新数据请重新运行 node server/build.js 并上传新版本。'
      : '接口异常时保留上一有效快照并显示更新时间；当前数据来自上交所、深交所、中金所与东方财富公开接口。'
    const sources = this.data.sources.map((item) =>
      item.key === 'datacenter' ? Object.assign({}, item, { time: isStatic ? '构建时抓取' : '缓存 5 分钟' }) : item
    )
    this.setData({
      updated: this.store.meta.updated,
      updateTime: this.store.meta.updated.slice(11),
      todayText: this.store.today,
      sourceText,
      sourceNote,
      sources,
      statusNote: status.lastError ? '刷新失败：' + status.lastError : '',
      etfCount: this.store.etfs.length,
      dateCount: this.store.dates.length,
      notif,
      cacheText: this.formatSize(cache.currentSize),
      disclaimer: this.store.meta.disclaimer
    })
  },

  onUnload() {
    if (this._unsubscribe) this._unsubscribe()
  },

  formatSize(kb) {
    if (!kb) return '0 KB'
    if (kb < 1024) return kb + ' KB'
    return (kb / 1024).toFixed(1) + ' MB'
  },

  manualRefresh() {
    wx.showLoading({ title: '刷新中', mask: true })
    dataService.refresh(true)
      .then((res) => {
        if (!res.changed) this.render()
        wx.hideLoading()
        const title = res.mode === 'offline'
          ? '当前为内置快照，未发起网络请求'
          : '已更新至 ' + (res.data.meta.updated || '')
        wx.showToast({ title, icon: 'none' })
      })
      .catch(() => {
        wx.hideLoading()
        this.render()
        wx.showToast({ title: '刷新失败，保留上一快照', icon: 'none' })
      })
  },

  openSources() {
    this.setData({ showSources: true })
  },

  closeSources() {
    this.setData({ showSources: false })
  },

  clearCache() {
    wx.showModal({
      title: '清除本地缓存',
      content: '将清除数据快照与临时缓存，下次进入重新读取。提醒设置会保留。',
      confirmText: '清除',
      confirmColor: '#d34a45',
      success: (res) => {
        if (!res.confirm) return
        dataService.clearCache()
        this.setData({ cacheText: '0 KB' })
        this.render()
        wx.showToast({ title: '已清除本地缓存', icon: 'none' })
      }
    })
  },

  toggleNotify() {
    const next = !this.data.notif
    if (!next) {
      this.setData({ notif: false })
      this.persistNotify(false)
      wx.showToast({ title: '已关闭数据更新提醒', icon: 'none' })
      return
    }

    const templateId = config.subscribeTemplateId
    if (!templateId) {
      this.setData({ notif: true })
      this.persistNotify(true)
      wx.showToast({ title: '演示：已开启，上线需配置订阅模板', icon: 'none' })
      return
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        const accepted = res[templateId] === 'accept'
        this.setData({ notif: accepted })
        this.persistNotify(accepted)
        wx.showToast({ title: accepted ? '已开启，每日 23:00 推送' : '未授权订阅消息', icon: 'none' })
      },
      fail: () => {
        this.setData({ notif: false })
        this.persistNotify(false)
        wx.showToast({ title: '订阅失败，请稍后重试', icon: 'none' })
      }
    })
  },

  persistNotify(value) {
    try {
      wx.setStorageSync('etf:notify', value)
    } catch (e) {
      // ignore
    }
  },

  openFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '数据异常或功能建议可发送邮件至 feedback@example.com（演示占位），并注明页面与日期。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  openAbout() {
    wx.showModal({
      title: '关于',
      content: '国家队 ETF 动向追踪 v' + config.version + '\n仅供研究参考，不构成投资建议。\n数据存在 T+1 延迟与估算误差。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  goBaseline() {
    wx.navigateTo({ url: '/pages/baseline/index' })
  },

  goQihuo() {
    wx.navigateTo({ url: '/pages/qihuo/index' })
  },

  goSnapshot() {
    wx.navigateTo({ url: '/pages/snapshot/index' })
  },

  goFlow() {
    wx.switchTab({ url: '/pages/flow/index' })
  },

  onShareAppMessage() {
    return {
      title: '国家队 ETF 动向追踪 · 16 只宽基监控组合',
      path: '/pages/overview/index',
      imageUrl: '/images/share-cover.png'
    }
  }
}))
