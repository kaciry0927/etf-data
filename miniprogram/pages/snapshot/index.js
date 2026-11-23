const dataService = require('../../services/data')
const F = require('../../utils/format')
const withPageAnim = require('../../utils/page-anim')

const SORTS = [
  { key: 'latestFlow', label: '当日净流入' },
  { key: 'flow5', label: '近 5 日' },
  { key: 'flow20', label: '近 20 日' },
  { key: 'sharesChange', label: '当日份额变动' },
  { key: 'latestShares', label: '最新份额' },
  { key: 'latestClose', label: '最新价' },
  { key: 'priceChangePct', label: '涨跌幅' },
  { key: 'name', label: '名称' },
  { key: 'index', label: '跟踪指数' },
  { key: 'exch', label: '市场' }
]

Page(withPageAnim({
  data: {
    query: '',
    filter: 'all',
    view: 'card',
    sortKey: 'latestFlow',
    sortDir: 'desc',
    sortLabel: '当日净流入 ↓',
    rows: [],
    count: 0,
    sumSharesText: '0.00',
    sumChangeText: '0.00',
    sumFlowText: '0.0',
    sumFlowTone: 'flat',
    sumFlow5Text: '0.0',
    sumFlow20Text: '0.0',
    showSort: false,
    sortOptions: [],
    disclaimer: ''
  },

  onLoad() {
    this.render()
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    this.apply()
  },

  onUnload() {
    if (this._unsubscribe) this._unsubscribe()
  },

  apply() {
    const q = this.data.query.trim()
    const filter = this.data.filter
    const sortKey = this.data.sortKey
    const dir = this.data.sortDir

    const filtered = this.store.etfs.filter((e) => {
      const passFilter = filter === 'all' || (filter === 'sh' && e.exch === '沪') || (filter === 'sz' && e.exch === '深')
      const hit = !q || e.code.indexOf(q) >= 0 || e.name.indexOf(q) >= 0 || e.index.indexOf(q) >= 0 || e.full.indexOf(q) >= 0
      return passFilter && hit
    })

    const rows = filtered.slice().sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (typeof va === 'string' || typeof vb === 'string') {
        const cmp = String(va === null || va === undefined ? '' : va).localeCompare(String(vb === null || vb === undefined ? '' : vb))
        return dir === 'desc' ? -cmp : cmp
      }
      return dir === 'desc' ? vb - va : va - vb
    }).map((e) => ({
      code: e.code,
      name: e.name,
      full: e.full,
      exch: e.exch,
      index: e.index,
      sharesText: F.fmt(e.latestShares, 2),
      changeText: F.fmt(e.sharesChange, 2, true),
      changeTone: F.tone(e.sharesChange),
      flowText: F.fmt(e.latestFlow, 1, true),
      flowTone: F.tone(e.latestFlow),
      flow5Text: F.fmt(e.flow5, 1, true),
      flow5Tone: F.tone(e.flow5),
      flow20Text: F.fmt(e.flow20, 1, true),
      flow20Tone: F.tone(e.flow20),
      priceText: e.latestClose !== null && e.latestClose !== undefined ? e.latestClose.toFixed(3) : '—',
      pctText: e.priceChangePct !== null && e.priceChangePct !== undefined ? F.signed(e.priceChangePct, 2) : '—',
      pctTone: F.tone(e.priceChangePct)
    }))

    const sumShares = filtered.reduce((s, e) => s + e.latestShares, 0)
    const sumFlow = filtered.reduce((s, e) => s + e.latestFlow, 0)
    const sumChange = filtered.reduce((s, e) => s + e.sharesChange, 0)
    const sum5 = filtered.reduce((s, e) => s + e.flow5, 0)
    const sum20 = filtered.reduce((s, e) => s + e.flow20, 0)

    this.setData({
      rows,
      count: rows.length,
      sumSharesText: F.fmt(sumShares, 2),
      sumChangeText: F.fmt(sumChange, 2, true),
      sumFlowText: F.fmt(sumFlow, 1, true),
      sumFlowTone: F.tone(sumFlow),
      sumFlow5Text: F.fmt(sum5, 1, true),
      sumFlow20Text: F.fmt(sum20, 1, true),
      sortLabel: this.sortLabel() + (dir === 'desc' ? ' ↓' : ' ↑'),
      disclaimer: this.store.meta.disclaimer
    })
  },

  sortLabel() {
    const item = SORTS.filter((s) => s.key === this.data.sortKey)[0]
    return item ? item.label : '当日净流入'
  },

  onSearch(e) {
    this.setData({ query: e.detail.value || '' })
    this.apply()
  },

  clearSearch() {
    this.setData({ query: '' })
    this.apply()
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.value })
    this.apply()
  },

  setView(e) {
    this.setData({ view: e.currentTarget.dataset.value })
  },

  openSort() {
    const sortKey = this.data.sortKey
    const dir = this.data.sortDir
    this.setData({
      showSort: true,
      sortOptions: SORTS.map((s) => ({
        key: s.key,
        label: s.label,
        desc: sortKey === s.key ? (dir === 'desc' ? '当前：降序' : '当前：升序') : '点击按此字段降序',
        active: sortKey === s.key
      }))
    })
  },

  closeSort() {
    this.setData({ showSort: false })
  },

  pickSort(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.sortKey) {
      this.setData({
        sortDir: this.data.sortDir === 'desc' ? 'asc' : 'desc',
        showSort: false
      })
    } else {
      this.setData({ sortKey: key, sortDir: 'desc', showSort: false })
    }
    this.apply()
  },

  toggleSort(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.sortKey) {
      this.setData({ sortDir: this.data.sortDir === 'desc' ? 'asc' : 'desc' })
    } else {
      this.setData({ sortKey: key, sortDir: 'desc' })
    }
    this.apply()
  },

  openEtf(e) {
    const code = e.currentTarget.dataset.code
    if (!code) return
    wx.navigateTo({ url: '/pages/etf/index?code=' + code })
  },

  onShareAppMessage() {
    return {
      title: '国家队 ETF 最新快照 · 16 只全字段对比',
      path: '/pages/snapshot/index',
      imageUrl: '/images/share-cover.png'
    }
  }
}))
