const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

const SEG_COLORS = ['#2f6fdd', '#5b8ce8', '#86aaf0', '#b0c8f6', '#d3e1fa', '#e7ecf5']

Page(withPageAnim({
  data: {
    meta: {},
    sourceChip: '内置快照',
    todayText: '',
    dayFlowText: '0.0',
    dayFlowClass: 'hero-up',
    sharesText: '0.00',
    etfDateText: '',
    futuresDateText: '',
    updateTimeText: '',
    ticker: [],
    tickerPaused: false,
    stats: [],
    top5: [],
    restWidth: '0',
    restColor: SEG_COLORS[5],
    top5PctText: '0.0',
    scaleText: '0',
    flow20Spark: [],
    flow20TotalText: '0.0',
    flow20TotalTone: 'up',
    flow20Start: '',
    flow20End: '',
    topFlowRows: [],
    disclaimer: ''
  },

  onLoad() {
    this.render()
    // 启动刷新完成后自动重渲染
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  onShow() {
    // 首次进入已经由 render 播放过累加；Tab 回来时再播放一次
    if (this._numbersShown) this.animateNumbers()
    else this._numbersShown = true
  },

  render() {
    const d = dataService.getSnapshot()
    this.store = d
    const t = d.totals
    const etfs = d.etfs

    const top5 = etfs
      .slice()
      .sort((a, b) => b.scale - a.scale)
      .slice(0, 5)
    const top5Value = top5.reduce((s, e) => s + e.scale, 0)
    const restValue = Math.max(0, t.scale - top5Value)

    const distItems = top5.map((e, i) => ({
      code: e.code,
      label: e.code + ' ' + e.name,
      color: SEG_COLORS[i],
      width: (e.scale / t.scale * 100).toFixed(1)
    }))
    distItems.push({
      code: '',
      label: '其他 ' + (etfs.length - 5) + ' 只',
      color: SEG_COLORS[5],
      width: (restValue / t.scale * 100).toFixed(1)
    })

    const flow20 = d.totalFlowByDay.slice(-20)
    const maxAbs = Math.max(1, ...flow20.map((v) => Math.abs(v)))
    const spark = flow20.map((v, i) => {
      const h = Math.max(2, Math.round(Math.abs(v) / maxAbs * 22))
      return {
        uid: 'spark-' + i,
        h: h,
        top: v >= 0 ? 24 - h : 24,
        dir: v >= 0 ? 'up' : 'down'
      }
    })

    const tickerBase = etfs.map((e) => ({
      code: e.code,
      exch: e.exch,
      price: e.latestClose.toFixed(2),
      pct: F.fmt(e.priceChangePct, 2, true) + '%',
      tone: F.tone(e.priceChangePct)
    }))
    const ticker = []
    tickerBase.concat(tickerBase).forEach((item, i) => {
      ticker.push(Object.assign({ uid: item.code + '-' + i }, item))
    })

    const topFlowRows = etfs
      .slice()
      .sort((a, b) => b.latestFlow - a.latestFlow)
      .slice(0, 5)
      .map((e) => ({
        code: e.code,
        name: e.name,
        exch: e.exch,
        index: e.index,
        sharesText: F.fmt(e.latestShares, 2),
        flowText: F.fmt(e.latestFlow, 1, true),
        tone: F.tone(e.latestFlow)
      }))

    const stats = [
      {
        key: 'flow5',
        label: '近 5 日累计',
        value: F.fmt(t.flow5, 1, true),
        unit: '亿',
        foot: '5 个交易日净申赎合计',
        tone: F.tone(t.flow5),
        action: ''
      },
      {
        key: 'flow20',
        label: '近 20 日累计',
        value: F.fmt(t.flow20, 1, true),
        unit: '亿',
        foot: '国家队持续增配区间',
        tone: F.tone(t.flow20),
        action: ''
      },
      {
        key: 'scale',
        label: '监控组合规模',
        value: F.fmt(t.scale, 0),
        unit: '亿元',
        foot: '按最新份额 × 最新价估算',
        tone: '',
        action: ''
      },
      {
        key: 'futures',
        label: '期货净空头变动',
        value: F.fmt(t.futuresChange, 0, true),
        unit: '手',
        foot: '四品种合计 · ' + F.dateLabel(d.futures.latestDate).replace('/', '-'),
        tone: F.tone(t.futuresChange),
        action: 'futures'
      }
    ]

    const statusSource = dataService.getStatus().source
    this.setData({
      meta: d.meta,
      sourceChip: statusSource === 'live' ? '官方数据' : statusSource === 'cache' ? '本地缓存' : '内置快照',
      todayText: d.today,
      dayFlowText: F.fmt(t.dayFlow, 1, true),
      dayFlowClass: t.dayFlow >= 0 ? 'hero-up' : 'hero-down',
      sharesText: F.fmt(t.shares, 2),
      etfDateText: d.meta.etfDate.slice(5),
      futuresDateText: d.futures.latestDate.slice(5),
      updateTimeText: d.meta.updated.slice(11),
      ticker: ticker,
      stats: stats,
      top5: distItems,
      top5PctText: F.fmt(top5Value / t.scale * 100, 1),
      scaleText: F.fmt(t.scale, 0),
      flow20Spark: spark,
      flow20TotalText: F.fmt(t.flow20, 1, true),
      flow20TotalTone: F.tone(t.flow20),
      flow20Start: F.dateLabel(d.dates[d.dates.length - 20]),
      flow20End: F.dateLabel(d.dates[d.dates.length - 1]),
      topFlowRows: topFlowRows,
      disclaimer: d.meta.disclaimer
    })

    this.animateNumbers()
  },

  animateNumbers() {
    const t = this.store.totals
    countUp(this, [
      { key: 'dayFlowText', value: t.dayFlow, digits: 1, sign: true },
      { key: 'sharesText', value: t.shares, digits: 2 },
      { key: 'stats[0].value', value: t.flow5, digits: 1, sign: true },
      { key: 'stats[1].value', value: t.flow20, digits: 1, sign: true },
      { key: 'stats[2].value', value: t.scale, digits: 0 },
      { key: 'stats[3].value', value: t.futuresChange, digits: 0, sign: true },
      { key: 'scaleText', value: t.scale, digits: 0 },
      { key: 'flow20TotalText', value: t.flow20, digits: 1, sign: true }
    ])
  },

  openEtf(e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    wx.navigateTo({ url: '/pages/etf/index?code=' + code })
  },

  goSnapshot() {
    wx.navigateTo({ url: '/pages/snapshot/index' })
  },

  goFlow() {
    wx.switchTab({ url: '/pages/flow/index' })
  },

  goFutures() {
    wx.switchTab({ url: '/pages/futures/index' })
  },

  goQihuo() {
    wx.navigateTo({ url: '/pages/qihuo/index' })
  },

  goFuturesDetail() {
    wx.navigateTo({ url: '/pages/futures-detail/index' })
  },

  goBaseline() {
    wx.navigateTo({ url: '/pages/baseline/index' })
  },

  onStatTap(e) {
    if (e.currentTarget.dataset.action === 'futures') this.goFutures()
  },

  onTickerStart() {
    this.setData({ tickerPaused: true })
  },

  onTickerEnd() {
    if (this._tickerTimer) clearTimeout(this._tickerTimer)
    this._tickerTimer = setTimeout(() => this.setData({ tickerPaused: false }), 800)
  },

  onUnload() {
    if (this._tickerTimer) clearTimeout(this._tickerTimer)
    if (this._unsubscribe) this._unsubscribe()
    countUp.stop(this, false)
  },

  onPullDownRefresh() {
    dataService.refresh(true)
      .then((res) => {
        // 数据有变化时 refresh 已通过订阅触发重渲染；无变化时手动刷新时间戳
        if (!res.changed) this.render()
        wx.stopPullDownRefresh()
        const title = res.mode === 'offline'
          ? '当前为内置快照，未发起网络请求'
          : '已更新至 ' + (res.data.meta.updated || '')
        wx.showToast({ title, icon: 'none' })
      })
      .catch(() => {
        wx.stopPullDownRefresh()
        wx.showToast({ title: '刷新失败，保留上一快照', icon: 'none' })
      })
  },

  onShareAppMessage() {
    return {
      title: '国家队 ETF 动向追踪 · 当日净流入 ' + this.data.dayFlowText + ' 亿元',
      path: '/pages/overview/index',
      imageUrl: '/images/share-cover.png'
    }
  },

  onShareTimeline() {
    return {
      title: '国家队 ETF 动向追踪 · 16 只宽基份额与净申赎',
      imageUrl: '/images/share-cover.png'
    }
  }
}))
