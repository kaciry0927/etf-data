const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

Page(withPageAnim({
  data: {
    mode: 'value',
    modeOptions: [
      { value: 'value', label: '按持仓市值' },
      { value: 'share', label: '按持有份额' }
    ],
    heroLabel: '国家队持有的宽基 ETF 合计市值',
    heroValue: '0',
    heroUnit: '亿元',
    totalShares: 0,
    holders: [],
    asof: '',
    disclosure: '',
    source: '',
    note: '',
    disclaimer: ''
  },

  onLoad() {
    this.render()
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    const base = this.store.baseline
    const totalShares = base.holders.reduce((s, x) => s + x.shares, 0)
    this.base = base
    this.totalShares = totalShares
    this.setData({
      totalShares,
      asof: base.asof,
      disclosure: base.disclosure,
      source: base.source,
      note: base.note,
      disclaimer: this.store.meta.disclaimer
    })
    this.renderMode(this.data.mode || 'value')
  },

  renderMode(mode) {
    const base = this.base
    const isValue = mode === 'value'
    const denom = isValue ? base.totalValue : this.totalShares
    const holders = base.holders
      .slice()
      .sort((a, b) => (isValue ? b.value - a.value : b.shares - a.shares))
      .map((x, i) => {
        const num = isValue ? x.value : x.shares
        const p = num / denom * 100
        return {
          rowKey: mode + '-' + x.name,
          name: x.name,
          meta: '持有 ' + x.etfs + ' 只 ETF' + (x.ratio ? ' · 份额占比 ' + x.ratio + '%' : ''),
          valueText: F.fmt(num, 0),
          unit: isValue ? '亿元' : '亿份',
          pctText: F.fmt(p, 1) + '%',
          barWidth: Math.max(3, Math.min(100, p / 60 * 100)).toFixed(1),
          barDelay: i * 45
        }
      })

    this.setData({
      mode,
      heroLabel: isValue ? '国家队持有的宽基 ETF 合计市值' : '国家队持有的宽基 ETF 合计份额',
      heroValue: isValue ? F.fmt(base.totalValue, 0) : F.fmt(this.totalShares, 0),
      heroUnit: isValue ? '亿元' : '亿份',
      holders
    })

    countUp(this, [
      {
        key: 'heroValue',
        value: isValue ? base.totalValue : this.totalShares,
        digits: 0
      }
    ])
  },

  onModeChange(e) {
    this.renderMode(e.detail.value)
  },

  onShareAppMessage() {
    return {
      title: '国家队 ETF 持仓基准 · 合计 ' + this.data.heroValue + ' ' + this.data.heroUnit,
      path: '/pages/baseline/index',
      imageUrl: '/images/share-cover.png'
    }
  },

  onUnload() {
    if (this._unsubscribe) this._unsubscribe()
    countUp.stop(this, false)
  }
}))
