const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

Page(withPageAnim({
  data: {
    code: '',
    name: '',
    full: '',
    exch: '',
    index: '',
    priceText: '—',
    pctText: '—',
    pctTone: 'flat',
    sharesText: '—',
    sharesChangeText: '—',
    sharesChangeTone: 'flat',
    latestFlowText: '—',
    latestFlowTone: 'flat',
    flow5Text: '—',
    flow20Text: '—',
    flow5Tone: 'flat',
    flow20Tone: 'flat',
    range: '20',
    rangeOptions: [
      { value: '20', label: '近 20 日' },
      { value: '60', label: '近 60 日' },
      { value: 'all', label: '全部' }
    ],
    labels: [],
    shareSeries: [],
    flowBars: [],
    flowLine: [],
    note: '',
    showPicker: false,
    keyword: '',
    pickerList: [],
    chartVisible: true,
    disclaimer: ''
  },

  onLoad(options) {
    this.store = dataService.getSnapshot()
    const code = options && options.code ? options.code : this.store.etfs[0].code
    this.buildPicker('')
    this.loadEtf(code, true)
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    this.buildPicker(this.data.keyword || '')
    if (this.data.code) this.loadEtf(this.data.code, false)
  },

  onShow() {
    if (!this.data.chartVisible && !this.data.showPicker) this.setData({ chartVisible: true })
    if (this._numbersShown) this.animateNumbers()
    else this._numbersShown = true
  },

  onHide() {
    if (this._chartTimer) clearTimeout(this._chartTimer)
    if (this.data.chartVisible) this.setData({ chartVisible: false })
  },

  loadEtf(code, resetRange) {
    const etf = this.store.etfs.filter((e) => e.code === String(code))[0] || this.store.etfs[0]
    this.etf = etf
    const range = resetRange ? '20' : this.data.range

    this.setData({
      code: etf.code,
      name: etf.name,
      full: etf.full,
      exch: etf.exch,
      index: etf.index,
      priceText: etf.latestClose !== null && etf.latestClose !== undefined ? etf.latestClose.toFixed(3) : '—',
      pctText: etf.priceChangePct !== null && etf.priceChangePct !== undefined ? F.signed(etf.priceChangePct, 2) : '—',
      pctTone: F.tone(etf.priceChangePct),
      sharesText: F.fmt(etf.latestShares, 2),
      sharesChangeText: F.fmt(etf.sharesChange, 2, true),
      sharesChangeTone: F.tone(etf.sharesChange),
      latestFlowText: F.fmt(etf.latestFlow, 1, true),
      latestFlowTone: F.tone(etf.latestFlow),
      flow5Text: F.fmt(etf.flow5, 1, true),
      flow20Text: F.fmt(etf.flow20, 1, true),
      flow5Tone: F.tone(etf.flow5),
      flow20Tone: F.tone(etf.flow20),
      note: etf.note,
      disclaimer: this.store.meta.disclaimer
    })

    this.computeRange(range)
    this.animateNumbers()
  },

  animateNumbers() {
    const etf = this.etf
    if (!etf) return
    const specs = [
      { key: 'sharesText', value: etf.latestShares, digits: 2 },
      { key: 'sharesChangeText', value: etf.sharesChange, digits: 2, sign: true },
      { key: 'latestFlowText', value: etf.latestFlow, digits: 1, sign: true },
      { key: 'flow5Text', value: etf.flow5, digits: 1, sign: true },
      { key: 'flow20Text', value: etf.flow20, digits: 1, sign: true }
    ]
    if (etf.latestClose !== null && etf.latestClose !== undefined) {
      specs.push({ key: 'priceText', value: etf.latestClose, digits: 3 })
    }
    countUp(this, specs)
  },

  computeRange(range) {
    const etf = this.etf
    const n = range === 'all' ? etf.shares.length : parseInt(range, 10)
    const start = Math.max(0, etf.shares.length - n)
    const labels = this.store.dates.slice(start)
    const shareSlice = etf.shares.slice(start)
    const flowSlice = etf.flow.slice(start)

    let acc = 0
    const cumulative = flowSlice.map((v) => {
      acc = Math.round((acc + v) * 100) / 100
      return acc
    })

    this.setData({
      range,
      labels,
      shareSeries: [{ key: 'shares', name: '份额', color: '#2f6fdd', values: shareSlice }],
      flowBars: flowSlice,
      flowLine: cumulative
    })
  },

  onRangeChange(e) {
    this.computeRange(e.detail.value)
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
    this.setData({
      pickerList: this.store.etfs
        .filter((e) => !q || e.code.indexOf(q) >= 0 || e.name.indexOf(q) >= 0 || e.index.indexOf(q) >= 0 || e.full.indexOf(q) >= 0)
        .map((e) => ({
          code: e.code,
          name: e.name,
          meta: e.exch + '市 · ' + e.index + ' · 最新 ' + F.fmt(e.latestShares, 2) + ' 亿份'
        }))
    })
  },

  pickEtf(e) {
    const code = e.currentTarget.dataset.code
    if (this._chartTimer) clearTimeout(this._chartTimer)
    this.setData({ showPicker: false, chartVisible: false })
    // 原地替换数据，不新增页面栈
    this.loadEtf(code, false)
    this._chartTimer = setTimeout(() => {
      this.setData({ chartVisible: true })
      wx.pageScrollTo({ scrollTop: 0, duration: 180 })
    }, 220)
  },

  openSnapshot() {
    const pages = getCurrentPages()
    const prev = pages[pages.length - 2]
    if (prev && prev.route === 'pages/snapshot/index') {
      wx.navigateBack({ delta: 1 })
      return
    }
    wx.navigateTo({ url: '/pages/snapshot/index' })
  },

  onShareAppMessage() {
    return {
      title: this.data.code + ' ' + this.data.name + ' · 份额与净流入',
      path: '/pages/etf/index?code=' + this.data.code,
      imageUrl: '/images/share-cover.png'
    }
  },

  onUnload() {
    if (this._chartTimer) clearTimeout(this._chartTimer)
    if (this._unsubscribe) this._unsubscribe()
    countUp.stop(this, false)
  }
}))
