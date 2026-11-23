const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

Page(withPageAnim({
  data: {
    dateText: '',
    totalNetText: '0',
    changeText: '0',
    changeTone: 'flat',
    contractCount: 0,
    groups: [],
    disclaimer: ''
  },

  onLoad() {
    this.render()
    this._unsubscribe = dataService.subscribe(() => this.render())
  },

  render() {
    this.store = dataService.getSnapshot()
    const fut = this.store.futures

    const groups = this.store.products.map((p) => {
      const rows = fut.contracts[p].map((r) => ({
        contract: r.contract,
        longText: F.fmt(r.long, 0),
        longChgText: F.fmt(r.longChg, 0, true),
        longChgTone: F.tone(r.longChg),
        shortText: F.fmt(r.short, 0),
        shortChgText: F.fmt(r.shortChg, 0, true),
        shortChgTone: F.tone(r.shortChg),
        netText: F.fmt(r.netShort, 0, true),
        netTone: F.tone(r.netShort)
      }))
      const totalLong = fut.contracts[p].reduce((s, r) => s + r.long, 0)
      const totalShort = fut.contracts[p].reduce((s, r) => s + r.short, 0)
      const totalLongChg = fut.contracts[p].reduce((s, r) => s + r.longChg, 0)
      const totalShortChg = fut.contracts[p].reduce((s, r) => s + r.shortChg, 0)
      const totalNet = totalShort - totalLong

      return {
        product: p,
        name: this.store.productNames[p],
        color: this.store.productColors[p],
        open: true,
        rows,
        subtotal: {
          longText: F.fmt(totalLong, 0),
          longChgText: F.fmt(totalLongChg, 0, true),
          longChgTone: F.tone(totalLongChg),
          shortText: F.fmt(totalShort, 0),
          shortChgText: F.fmt(totalShortChg, 0, true),
          shortChgTone: F.tone(totalShortChg),
          netText: F.fmt(totalNet, 0, true),
          netTone: F.tone(totalNet)
        },
        meta: '净空头 ' + F.fmt(totalNet, 0) + ' 手 · 变动 ' + F.fmt(fut.lastDeltas[p], 0, true) + ' 手',
        count: rows.length
      }
    })

    this.setData({
      dateText: fut.latestDate,
      totalNetText: F.fmt(fut.totalNet, 0),
      changeText: F.fmt(fut.changeTotal, 0, true),
      changeTone: F.tone(fut.changeTotal),
      contractCount: fut.contractCount,
      groups,
      disclaimer: this.store.meta.disclaimer
    })

    countUp(this, [
      { key: 'totalNetText', value: fut.totalNet, digits: 0 },
      { key: 'changeText', value: fut.changeTotal, digits: 0, sign: true },
      { key: 'contractCount', value: fut.contractCount, digits: 0 }
    ])
  },

  toggleGroup(e) {
    const idx = e.currentTarget.dataset.index
    const group = this.data.groups[idx]
    if (!group) return
    this.setData({ ['groups[' + idx + '].open']: !group.open })
  },

  onCopy(e) {
    const contract = e.currentTarget.dataset.contract
    if (!contract) return
    wx.setClipboardData({ data: contract })
  },

  openQihuo() {
    wx.navigateTo({ url: '/pages/qihuo/index' })
  },

  onShareAppMessage() {
    return {
      title: '股指期货前 20 会员持仓明细 · 净空头 ' + this.data.totalNetText + ' 手',
      path: '/pages/futures-detail/index',
      imageUrl: '/images/share-cover.png'
    }
  },

  onUnload() {
    if (this._unsubscribe) this._unsubscribe()
    countUp.stop(this, false)
  }
}))
