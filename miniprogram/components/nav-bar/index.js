Component({
  properties: {
    title: { type: String, value: '' },
    back: { type: Boolean, value: false },
    dark: { type: Boolean, value: false }
  },

  data: {
    statusBarHeight: 20,
    barHeight: 44,
    totalHeight: 64,
    titleMaxWidth: 200
  },

  lifetimes: {
    attached() {
      this.measure()
    }
  },

  methods: {
    measure() {
      let win = { statusBarHeight: 20, windowWidth: 375 }
      try {
        win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      } catch (e) {
        // 使用默认值
      }

      let menu = null
      try {
        menu = wx.getMenuButtonBoundingClientRect()
      } catch (e) {
        menu = null
      }

      const statusBarHeight = win.statusBarHeight || 20
      let barHeight = 44
      let reserve = 96

      if (menu && menu.height && menu.top) {
        const measured = (menu.top - statusBarHeight) * 2 + menu.height
        if (measured >= 36 && measured <= 56) barHeight = measured
        reserve = Math.max(88, win.windowWidth - menu.left + 8)
      }

      const titleMaxWidth = Math.max(140, win.windowWidth - reserve * 2 - 8)

      this.setData({
        statusBarHeight,
        barHeight,
        totalHeight: statusBarHeight + barHeight,
        titleMaxWidth
      })
    },

    onBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack({ delta: 1 })
      } else {
        wx.switchTab({ url: '/pages/overview/index' })
      }
    }
  }
})
