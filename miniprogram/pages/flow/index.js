const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

Page(withPageAnim({
  data: {
    range: '20',
    rangeLabel: '近 20 日',
    rangeOptions: [
      { value: '5', label: '近 5 日' },
      { value: '20', label: '近 20 日' },
      { value: '60', label: '近 60 日' },
      { value: 'all', label: '全部' }
    ],
    labels: [],
    bars: [],
    line: [],
    totalText: '0.0',
    totalClass: 'hero-up',
    dayText: '0.0',
    dayClass: 'up',
    avgText: '0.0',
    daysText: '0',
    rankTab: 'in',
    rankOptions: [
      { value: 'in', label: '净流入 TOP5' },
      { value: 'out', label: '净流出 TOP5' }
    ],
    rankRows: [],
    rankEpoch: 0,
    showPicker: false,
    keyword: '',
    pickerList: [],
    chartVisible: true,
    disclaimer: ''
  },

  onLoad() {
    this.render()
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    this.buildPicker(this.data.keyword || '')
    this.computeRange(this.data.range)
  },

  onReady() {
    // 区间资金榜在首屏下方；滚动进入视口时重播条形生长，避免动画在屏幕外播完
    if (!wx.createIntersectionObserver) return
    this._rankSeen = false
    this._rankObserver = wx.createIntersectionObserver(this, { thresholds: [0.08] })
    this._rankObserver.relativeToViewport({ bottom: -12 }).observe('#rankCard', (res) => {
      const visible = res.intersectionRatio > 0
      if (visible && !this._rankSeen) {
        this._rankSeen = true
        this.replayRankBars()
      } else if (!visible) {
        this._rankSeen = false
      }
    })
  },

  replayRankBars() {
    const epoch = (this.data.rankEpoch || 0) + 1
    this.setData({ rankEpoch: epoch })
    this.computeRank(this.data.range, this.data.rankTab)
  },

  onShow() {
    // 页面重新可见时再挂载 Canvas，避免原生 Canvas 在 Tab 切换时残留到其他页面
    if (!this.data.chartVisible && !this.data.showPicker) this.setData({ chartVisible: true })
    // 如果资金榜本来就露在视口里，返回页面时也重播一次条形动画
    if (this._rankSeen) this.replayRankBars()
    // 首次进入由 computeRange 播放；Tab 回来时再播放一次累加
    if (this._summaryShown) this.animateSummary()
    else this._summaryShown = true
  },

  onHide() {
    if (this._chartTimer) clearTimeout(this._chartTimer)
    if (this.data.chartVisible) this.setData({ chartVisible: false })
  },

  computeRange(range) {
    const all = this.store.totalFlowByDay
    const n = range === 'all' ? all.length : parseInt(range, 10)
    const start = Math.max(0, all.length - n)
    const bars = all.slice(start)
    const labels = this.store.dates.slice(start)

    let acc = 0
    const line = bars.map((v) => {
      acc = Math.round((acc + v) * 100) / 100
      return acc
    })

    const total = line[line.length - 1] || 0
    const day = bars[bars.length - 1] || 0
    const avg = total / (bars.length || 1)

    this.setData({
      range,
      rangeLabel: range === 'all' ? '全部 ' + all.length + ' 日' : '近 ' + range + ' 日',
      labels,
      bars,
      line,
      totalText: F.fmt(total, 1, true),
      totalClass: total >= 0 ? 'hero-up' : 'hero-down',
      dayText: F.fmt(day, 1, true),
      dayClass: F.tone(day),
      avgText: F.fmt(avg, 1, true),
      daysText: String(bars.length),
      disclaimer: this.store.meta.disclaimer
    })

    this._summary = { total, day, avg, days: bars.length }
    this.animateSummary()

    this.computeRank(range, this.data.rankTab)
  },

  animateSummary() {
    const s = this._summary
    if (!s) return
    countUp(this, [
      { key: 'totalText', value: s.total, digits: 1, sign: true },
      { key: 'dayText', value: s.day, digits: 1, sign: true },
      { key: 'avgText', value: s.avg, digits: 1, sign: true },
      { key: 'daysText', value: s.days, digits: 0 }
    ])
  },

  computeRank(range, rankTab) {
    const rankRows = this.store.etfs.map((e) => {
      const v = range === '5' ? e.flow5 : range === '20' ? e.flow20 : range === '60' ? e.flow60 : e.flowAll
      return { e, v }
    })
    rankRows.sort((a, b) => (rankTab === 'in' ? b.v - a.v : a.v - b.v))
    const top = rankRows.slice(0, 5)
    const maxAbs = Math.max(1, ...top.map((r) => Math.abs(r.v)))

    this.setData({
      rankTab,
      rankRows: top.map((r, i) => ({
        rowKey: this.data.rankEpoch + '-' + range + '-' + rankTab + '-' + r.e.code,
        code: r.e.code,
        name: r.e.name,
        valueText: F.fmt(r.v, 1, true),
        tone: F.tone(r.v),
        width: Math.max(2, Math.abs(r.v) / maxAbs * 100).toFixed(1),
        barColor: r.v >= 0 ? '#d34a45' : '#188a62',
        barDelay: i * 55,
        no: '0' + (i + 1),
        top: i === 0 ? 'top' : ''
      }))
    })
  },

  onRangeChange(e) {
    this.computeRange(e.detail.value)
  },

  onRankChange(e) {
    this.computeRank(this.data.range, e.detail.value)
  },

  openPicker() {
    if (this._chartTimer) clearTimeout(this._chartTimer)
    this.setData({ showPicker: true, keyword: '', chartVisible: false })
    this.buildPicker('')
  },

  closePicker() {
    this.setData({ showPicker: false })
    this.showChartSoon()
  },

  showChartSoon() {
    if (this._chartTimer) clearTimeout(this._chartTimer)
    this._chartTimer = setTimeout(() => this.setData({ chartVisible: true }), 220)
  },

  onSearch(e) {
    const keyword = e.detail.value || ''
    this.setData({ keyword })
    this.buildPicker(keyword)
  },

  clearSearch() {
    this.setData({ keyword: '' })
    this.buildPicker('')
  },

  buildPicker(keyword) {
    const q = String(keyword || '').trim()
    const list = this.store.etfs
      .filter((e) => !q || e.code.indexOf(q) >= 0 || e.name.indexOf(q) >= 0 || e.index.indexOf(q) >= 0 || e.full.indexOf(q) >= 0)
      .map((e) => ({
        code: e.code,
        name: e.name,
        full: e.full,
        meta: e.exch + '市 · ' + e.index + ' · ' + F.fmt(e.latestShares, 2) + ' 亿份'
      }))
    this.setData({ pickerList: list })
  },

  pickEtf(e) {
    const code = e.currentTarget.dataset.code
    if (this._chartTimer) clearTimeout(this._chartTimer)
    this.setData({ showPicker: false, chartVisible: false })
    wx.navigateTo({ url: '/pages/etf/index?code=' + code })
  },

  openEtf(e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    wx.navigateTo({ url: '/pages/etf/index?code=' + code })
  },

  onShareAppMessage() {
    return {
      title: 'ETF 净申赎走势 · ' + this.data.rangeLabel + '累计 ' + this.data.totalText + ' 亿元',
      path: '/pages/flow/index',
      imageUrl: '/images/share-cover.png'
    }
  },

  onUnload() {
    if (this._chartTimer) clearTimeout(this._chartTimer)
    if (this._unsubscribe) this._unsubscribe()
    countUp.stop(this, false)
    if (this._rankObserver) {
      this._rankObserver.disconnect()
      this._rankObserver = null
    }
  }
}))
