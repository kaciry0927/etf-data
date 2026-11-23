/**
 * 小程序入口。
 *
 * 启动时先同步读取本地缓存 / 内置真实快照，页面可以立即渲染；
 * 随后调用 dataService.init() 通过 HTTP 数据服务或云函数增量刷新。
 */
const config = require('./config')
const dataService = require('./services/data')

App({
  globalData: {
    version: config.version,
    dataMode: config.dataMode,
    launchAt: 0
  },

  onLaunch() {
    this.globalData.launchAt = Date.now()
    try {
      wx.setStorageSync('etf:lastLaunch', this.globalData.launchAt)
    } catch (e) {
      // 存储失败不影响展示
    }

    // 云开发模式需要先初始化环境；未开通时静默跳过，由 HTTP / 内置快照兜底。
    if ((config.dataMode === 'cloud' || config.dataMode === 'auto') && config.cloudEnv && wx.cloud) {
      try {
        wx.cloud.init({ env: config.cloudEnv, traceUser: false })
      } catch (e) {
        // ignore
      }
    }

    // 后台刷新：失败时保留缓存 / 内置快照，不阻塞页面
    dataService.init().catch(() => {})
  },

  onShow() {
    // 从后台回到前台时，若缓存超过有效期则静默刷新
    if (this.globalData.suspendedAt && Date.now() - this.globalData.suspendedAt > 5 * 60 * 1000) {
      dataService.refresh(true).catch(() => {})
    }
    this.globalData.suspendedAt = 0
  },

  onHide() {
    this.globalData.suspendedAt = Date.now()
  }
})
