const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

Page(withPageAnim({
  data: {
    dateText: '',
    changeText: '0',
    changeClass: 'hero-up',
    totalNetText: '0',
    contractCount: 0,
    cards: [],
    range: '20',
    rangeOptions: [
      { value: '20', label: '近 20 日' },
      { value: '60', label: '近 60 日' },
      { value: 'all', label: '全部' }
    ],
    labels: [],
    series: [],
    legend: [],
    hidden: [],
    hasSeries: true,
    chartVisible: true,
    disclaimer: ''
  },

  onLoad() {
    this.render()
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    const fut = this.store.futures
    const products = this.store.products

    const cards = products.map((p) => {
      const vals = fut.series[p]
      const delta = fut.lastDeltas[p]
      return {
        product: p,
        name: this.store.productNames[p],
        color: this.store.productColors[p],
        netText: F.fmt(vals[vals.length - 1], 0),
        deltaText: (delta >= 0 ? '+' : '') + F.fmt(delta, 0) + ' 手',
        deltaTone: F.tone(delta)
      }
    })

    this.setData({
      dateText: fut.latestDate,
      changeText: F.fmt(fut.changeTotal, 0, true),
      changeClass: fut.changeTotal >= 0 ? 'hero-up' : 'hero-down',
      totalNetText: F.fmt(fut.totalNet, 0),
      contractCount: fut.contractCount,
      cards,
      legend: this.buildLegend(this.data.hidden || []),
      disclaimer: this.store.meta.disclaimer
    })

    this.computeChart(this.data.range, this.data.hidden || [])
    this.animateNumbers()
  },

  animateNumbers() {
    const fut = this.store.futures
    const products = this.store.products
    const specs = [
      { key: 'changeText', value: fut.changeTotal, digits: 0, sign: true },
      { key: 'totalNetText', value: fut.totalNet, digits: 0 }
    ]
    products.forEach((p, i) => {
      const vals = fut.series[p]
      const delta = fut.lastDeltas[p]
      specs.push({ key: 'cards[' + i + '].netText', value: vals[vals.length - 1], digits: 0 })
      specs.push({
        key: 'cards[' + i + '].deltaText',
        value: delta,
        digits: 0,
        format: (v) => (v >= 0 ? '+' : '') + F.fmt(v, 0) + ' 手'
      })
    })
    countUp(this, specs)
  },

  onShow() {
    if (!this.data.chartVisible) this.setData({ chartVisible: true })
    if (this._numbersShown) this.animateNumbers()
    else this._numbersShown = true
  },

  onHide() {
    if (this.data.chartVisible) this.setData({ chartVisible: false })
  },

  onUnload() {
    if (this._unsubscribe) this._unsubscribe()
    countUp.stop(this, false)
  },

  buildLegend(hidden) {
    return this.store.products.map((p) => ({
      key: p,
      label: p + ' ' + this.store.productNames[p],
      color: this.store.productColors[p],
      off: hidden.indexOf(p) >= 0
    }))
  },

  computeChart(range, hidden) {
    const fut = this.store.futures
    const n = range === 'all' ? fut.dates.length : parseInt(range, 10)
    const start = Math.max(0, fut.dates.length - n)
    const labels = fut.dates.slice(start)
    const series = this.store.products
      .filter((p) => hidden.indexOf(p) < 0)
      .map((p) => ({
        key: p,
        name: p + ' ' + this.store.productNames[p],
        color: this.store.productColors[p],
        values: fut.series[p].slice(start)
      }))

    this.setData({
      range,
      labels,
      series,
      hidden,
      legend: this.buildLegend(hidden),
      hasSeries: series.length > 0
    })
  },

  onRangeChange(e) {
    this.computeChart(e.detail.value, this.data.hidden)
  },

  toggleLegend(e) {
    const key = e.currentTarget.dataset.key
    const hidden = this.data.hidden.slice()
    const idx = hidden.indexOf(key)
    if (idx >= 0) hidden.splice(idx, 1)
    else hidden.push(key)
    this.computeChart(this.data.range, hidden)
  },

  openDetail() {
    wx.navigateTo({ url: '/pages/futures-detail/index' })
  },

  openQihuo() {
    wx.navigateTo({ url: '/pages/qihuo/index' })
  },

  onShareAppMessage() {
    return {
      title: '股指期货前 20 会员净空头 · 四品种合计 ' + this.data.totalNetText + ' 手',
      path: '/pages/futures/index',
      imageUrl: '/images/share-cover.png'
    }
  }
}))
