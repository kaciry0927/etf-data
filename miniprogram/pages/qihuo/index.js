const dataService = require('../../services/data')
const F = require('../../utils/format')
const countUp = require('../../utils/count-up')
const withPageAnim = require('../../utils/page-anim')

const DOWS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

Page(withPageAnim({
  data: {
    date: '',
    weekdayText: '',
    sideIdx: 0,
    sides: [],
    current: null,
    payload: false,
    loading: true,
    spinning: false,
    isStatic: false,
    cacheHint: '缓存 5 分钟',
    errorText: '',
    lastFetchText: '',
    emptyText: '',
    quickDays: [],
    showCal: false,
    dows: DOWS,
    calTitle: '',
    calYear: 2026,
    calMonth: 10,
    calCanPrev: true,
    calCanNext: false,
    calCells: [],
    disclaimer: ''
  },

  onLoad() {
    this.store = dataService.getSnapshot()
    this.today = this.store.today
    this.firstDate = this.store.firstDate
    this.lastFetchAt = 0
    this._seq = 0

    this.buildQuickDays()
    const isStatic = dataService.getStatus().mode === 'offline'
    this.setData({
      disclaimer: this.store.meta.disclaimer,
      isStatic: isStatic,
      cacheHint: isStatic ? '内置静态快照' : '缓存 5 分钟'
    })
    this.load(this.today)
  },

  onUnload() {
    this._seq += 1
    if (this._refreshTimer) clearTimeout(this._refreshTimer)
    countUp.stop(this, false)
  },

  buildQuickDays() {
    const previous = this.store.futures.dates.filter((d) => d < this.today).slice(-1)
    const dates = [this.today].concat(previous)
    const quickDays = dates.map((iso, index) => ({
      iso: iso,
      label: (index === 0 ? '返回 ' : '') + iso.slice(5),
      week: F.weekday(iso).replace('周', ''),
      current: index === 0
    }))
    this.setData({ quickDays })
  },

  /**
   * 请求指定日期的龙虎榜。
   * 服务端会校验 tradeDate，非交易日返回 null，由页面展示说明型空态。
   */
  load(date) {
    const seq = (this._seq || 0) + 1
    this._seq = seq
    countUp.stop(this, false)

    const weekdayText = F.weekday(date)
    this.setData({
      date,
      weekdayText,
      loading: true,
      payload: false,
      sides: [],
      current: null,
      errorText: '',
      lastFetchText: F.nowTime(),
      emptyText: date + '（' + weekdayText + '）不是交易日或尚未发布排名。请选择可用的历史交易日重新查询。'
    })

    return dataService.getQihuo(date).then(
      (payload) => {
        if (seq !== this._seq) return false
        this.lastFetchAt = Date.now()
        if (!payload || !payload.sides || !payload.sides.length) {
          this.setData({ loading: false, payload: false, sides: [], current: null })
          return false
        }
        const sides = payload.sides.map((side, index) => this.formatSide(side, index))
        this.setData({
          loading: false,
          payload: true,
          sides,
          sideIdx: 0,
          current: sides[0],
          lastFetchText: F.nowTime()
        })
        this.animateCurrent(sides[0])
        return true
      },
      (err) => {
        if (seq !== this._seq) return false
        const message = (err && err.message) || String(err)
        const status = dataService.getStatus()
        const hint = status.mode === 'offline' ? '' : '（请确认数据服务已启动或网络可用）'
        this.setData({
          loading: false,
          payload: false,
          sides: [],
          current: null,
          errorText: message,
          emptyText: message + hint
        })
        return false
      }
    )
  },

  formatSide(side, index) {
    const rows = side.rows.map((r) => ({
      product: r.product,
      productName: r.productName,
      longValue: r.longChg,
      longText: F.fmt(r.longChg, 0, true),
      longTone: F.tone(r.longChg),
      shortValue: r.shortChg,
      shortText: F.fmt(r.shortChg, 0, true),
      shortTone: F.tone(r.shortChg),
      netValue: r.net,
      netText: F.fmt(r.net, 0, true),
      netTone: F.tone(r.net),
      tag: r.tag,
      tagClass: r.tag === '加仓' ? 'add' : 'cut'
    }))
    const total = side.total
    return {
      side: side.side,
      desc: index === 0 ? '中信期货席位合计' : '其他代客合计',
      rows,
      total: {
        longValue: total.longChg,
        longText: F.fmt(total.longChg, 0, true),
        longTone: F.tone(total.longChg),
        shortValue: total.shortChg,
        shortText: F.fmt(total.shortChg, 0, true),
        shortTone: F.tone(total.shortChg),
        netValue: total.net,
        netText: F.fmt(total.net, 0, true),
        netTone: F.tone(total.net),
        tag: total.tag,
        tagClass: total.tag === '加仓' ? 'add' : 'cut'
      }
    }
  },

  animateCurrent(current) {
    const cur = current || this.data.current
    if (!cur) return
    const specs = []
    cur.rows.forEach((r, i) => {
      specs.push({ key: 'current.rows[' + i + '].longText', value: r.longValue, digits: 0, sign: true })
      specs.push({ key: 'current.rows[' + i + '].shortText', value: r.shortValue, digits: 0, sign: true })
      specs.push({ key: 'current.rows[' + i + '].netText', value: r.netValue, digits: 0, sign: true })
    })
    specs.push({ key: 'current.total.longText', value: cur.total.longValue, digits: 0, sign: true })
    specs.push({ key: 'current.total.shortText', value: cur.total.shortValue, digits: 0, sign: true })
    specs.push({ key: 'current.total.netText', value: cur.total.netValue, digits: 0, sign: true })
    countUp(this, specs, { duration: 520, interval: 26 })
  },

  switchSide(e) {
    const idx = Number(e.currentTarget.dataset.index)
    if (idx === this.data.sideIdx) return
    countUp.stop(this, false)
    this.setData({ sideIdx: idx, current: this.data.sides[idx] })
    this.animateCurrent(this.data.sides[idx])
  },

  refresh() {
    if (this.data.isStatic) {
      wx.showToast({ title: '当前为离线快照，更新数据请重新运行构建脚本', icon: 'none' })
      return
    }
    // 静态托管模式下龙虎榜随 snapshot.json 一起下发，每天构建时更新，没有实时接口
    if (dataService.config && dataService.config.qihuoPreferSnapshot) {
      wx.showToast({ title: '龙虎榜随每日快照更新，重新打开即为最新', icon: 'none' })
      return
    }
    if (this.data.loading || this.data.spinning) return
    const minutes = (Date.now() - this.lastFetchAt) / 60000
    if (this.lastFetchAt && minutes < 5) {
      wx.showToast({ title: '数据仍在 5 分钟缓存期内，未发起新请求', icon: 'none' })
      return
    }
    this.setData({ spinning: true })
    this.load(this.data.date).then((ok) => {
      this.setData({ spinning: false })
      wx.showToast({
        title: ok ? '已刷新 · ' + this.data.date + ' 龙虎榜' : '暂无可用数据或请求失败',
        icon: 'none'
      })
    })
  },

  openCalendar() {
    const d = F.parseISO(this.data.date || this.today)
    this.buildCalendar(d.getUTCFullYear(), d.getUTCMonth())
    this.setData({ showCal: true })
  },

  closeCalendar() {
    this.setData({ showCal: false })
  },

  buildCalendar(year, month) {
    const first = new Date(Date.UTC(year, month, 1))
    const startDow = first.getUTCDay()
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const cells = []

    for (let i = 0; i < startDow; i++) {
      cells.push({ key: 'b' + i, day: '', iso: '', cls: 'cal-cell muted', disabled: true })
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const iso = year + '-' + F.pad2(month + 1) + '-' + F.pad2(day)
      const dow = new Date(Date.UTC(year, month, day)).getUTCDay()
      const future = iso > this.today
      const early = iso < this.firstDate
      const weekend = dow === 0 || dow === 6
      let cls = 'cal-cell'
      if (future || early) cls += ' disabled'
      else if (weekend) cls += ' weekend'
      if (iso === this.today) cls += ' today'
      if (iso === this.data.date) cls += ' selected'
      cells.push({
        key: iso,
        day: String(day),
        iso,
        cls,
        disabled: future || early
      })
    }

    const min = F.parseISO(this.firstDate)
    const max = F.parseISO(this.today)
    const minYear = min.getUTCFullYear()
    const minMonth = min.getUTCMonth()
    const maxYear = max.getUTCFullYear()
    const maxMonth = max.getUTCMonth()

    this.setData({
      calYear: year,
      calMonth: month,
      calTitle: year + ' 年 ' + MONTHS[month],
      calCells: cells,
      calCanPrev: year > minYear || (year === minYear && month > minMonth),
      calCanNext: year < maxYear || (year === maxYear && month < maxMonth)
    })
  },

  prevMonth() {
    if (!this.data.calCanPrev) return
    let year = this.data.calYear
    let month = this.data.calMonth - 1
    if (month < 0) {
      month = 11
      year -= 1
    }
    this.buildCalendar(year, month)
  },

  nextMonth() {
    if (!this.data.calCanNext) return
    let year = this.data.calYear
    let month = this.data.calMonth + 1
    if (month > 11) {
      month = 0
      year += 1
    }
    this.buildCalendar(year, month)
  },

  onDayTap(e) {
    const iso = e.currentTarget.dataset.iso
    const disabled = e.currentTarget.dataset.disabled
    if (!iso || disabled === true || disabled === 1 || disabled === '1') return
    this.setData({ showCal: false })
    if (iso !== this.data.date) this.load(iso)
  },

  pickQuick(e) {
    const iso = e.currentTarget.dataset.iso
    if (iso && iso !== this.data.date) this.load(iso)
  },

  onShareAppMessage() {
    return {
      title: '期指多空龙虎榜 · ' + this.data.date,
      path: '/pages/qihuo/index',
      imageUrl: '/images/share-cover.png'
    }
  }
}))
