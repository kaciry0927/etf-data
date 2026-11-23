/**
 * 轻量 Canvas 2D 图表：
 *   type="dual"  双轴柱线图（左：单日净流入柱，右：区间累计线）
 *   type="line"  多折线图（可带面积）
 *
 * 无第三方依赖，支持点按 / 拖动取值、图例由父级控制、DPR 高清绘制。
 */
const { fmt, dateLabel } = require('../../utils/format')

const COLORS = {
  up: '#d34a45',
  down: '#188a62',
  line: '#2f6fdd',
  grid: '#f1f4f8',
  gridStrong: '#e7eaf0',
  axis: '#9aa3af',
  ink: '#2c3645',
  sub: '#78828f'
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function maxAbs(list) {
  let m = 0
  for (let i = 0; i < list.length; i++) {
    const v = Math.abs(list[i])
    if (v > m) m = v
  }
  return m
}

function extent(lists) {
  let min = Infinity
  let max = -Infinity
  for (let k = 0; k < lists.length; k++) {
    const arr = lists[k]
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i]
      if (arr[i] > max) max = arr[i]
    }
  }
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 }
  if (max === min) {
    max += 1
    min -= 1
  }
  const pad = (max - min) * 0.1
  return { min: min - pad, max: max + pad }
}

function tickIndexes(n, slots) {
  if (n <= 0) return []
  if (n <= slots) {
    const out = []
    for (let i = 0; i < n; i++) out.push(i)
    return out
  }
  const out = []
  for (let i = 0; i < slots; i++) out.push(Math.round(i * (n - 1) / (slots - 1)))
  return out
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

Component({
  properties: {
    type: { type: String, value: 'dual' },
    labels: { type: Array, value: [] },
    bars: { type: Array, value: [] },
    line: { type: Array, value: [] },
    series: { type: Array, value: [] },
    height: { type: Number, value: 200 },
    barName: { type: String, value: '单日' },
    lineName: { type: String, value: '累计' },
    barAxis: { type: String, value: '亿元' },
    lineAxis: { type: String, value: '累计' },
    barDigits: { type: Number, value: 1 },
    lineDigits: { type: Number, value: 1 },
    digits: { type: Number, value: 0 },
    area: { type: Boolean, value: false },
    emptyText: { type: String, value: '暂无数据' }
  },

  data: {
    pageHidden: false
  },

  observers: {
    'labels, bars, line, series': function () {
      this._active = -1
      this.startAnimation()
    },
    height() {
      this._ready = false
      this.scheduleInit()
    }
  },

  pageLifetimes: {
    hide() {
      // 双保险：即使父页面 onHide 的 setData 尚未下发，也先卸掉原生 Canvas
      this.stopAnimation()
      this._ready = false
      this.setData({ pageHidden: true })
    },
    show() {
      if (!this.data.pageHidden) return
      this._ready = false
      this._active = -1
      this.setData({ pageHidden: false })
      this.scheduleInit()
    }
  },

  lifetimes: {
    ready() {
      this.scheduleInit()
    },
    detached() {
      if (this._drawTimer) clearTimeout(this._drawTimer)
      if (this._initTimer) clearTimeout(this._initTimer)
      this.stopAnimation()
    }
  },

  methods: {
    scheduleInit() {
      if (this._initTimer) clearTimeout(this._initTimer)
      this._initTimer = setTimeout(() => this.initCanvas(0), 30)
    },

    initCanvas(attempt) {
      if (this._ready) return
      const query = this.createSelectorQuery()
      query.select('#chart').fields({ node: true, size: true, rect: true }).exec((res) => {
        const info = res && res[0]
        if (!info || !info.node) {
          if (attempt < 4) {
            this._initTimer = setTimeout(() => this.initCanvas(attempt + 1), 80)
          }
          return
        }

        const canvas = info.node
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        let dpr = 2
        try {
          const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
          dpr = win.pixelRatio || 2
        } catch (e) {
          dpr = 2
        }

        const width = Math.max(200, info.width || 300)
        const height = Math.max(120, info.height || this.data.height)

        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(dpr, dpr)

        this._canvas = canvas
        this._ctx = ctx
        this._w = width
        this._h = height
        this._dpr = dpr
        this._left = info.left || 0
        this._active = -1
        this._ready = true
        this.startAnimation()
      })
    },

    stopAnimation() {
      this._animating = false
      if (this._animTimer) {
        clearTimeout(this._animTimer)
        this._animTimer = null
      }
      if (this._rafId && this._canvas && this._canvas.cancelAnimationFrame) {
        try {
          this._canvas.cancelAnimationFrame(this._rafId)
        } catch (e) {
          // ignore
        }
      }
      this._rafId = null
    },

    startAnimation() {
      if (!this._ready) return
      this.stopAnimation()
      const hasData = this.data.type === 'line'
        ? (this.data.series || []).some((s) => s && s.values && s.values.length)
        : (this.data.labels || []).length > 0
      if (!hasData) {
        this.draw(1)
        return
      }
      this._active = -1
      this._animating = true
      const duration = 560
      const startedAt = Date.now()
      const canvas = this._canvas
      const raf = canvas && canvas.requestAnimationFrame
        ? canvas.requestAnimationFrame.bind(canvas)
        : null

      const tick = () => {
        if (!this._animating) return
        const t = Math.min(1, (Date.now() - startedAt) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        this.draw(eased)
        if (t < 1) {
          if (raf) this._rafId = raf(tick)
          else this._animTimer = setTimeout(tick, 16)
        } else {
          this._animating = false
          this._rafId = null
          this.draw(1)
        }
      }

      if (raf) this._rafId = raf(tick)
      else this._animTimer = setTimeout(tick, 16)
    },

    draw(progress) {
      if (!this._ready) return
      const p = progress === undefined ? 1 : progress
      const ctx = this._ctx
      const w = this._w
      const h = this._h
      ctx.clearRect(0, 0, w, h)
      if (this.data.type === 'line') this.drawLine(ctx, w, h, p)
      else this.drawDual(ctx, w, h, p)
    },

    drawDual(ctx, w, h, progress) {
      const labels = this.data.labels || []
      const bars = this.data.bars || []
      const line = this.data.line || []
      const n = labels.length
      const p = progress === undefined ? 1 : progress
      if (!n) {
        this.drawEmpty(ctx, w, h)
        return
      }

      const padL = 40
      const padR = 42
      const padT = 16
      const padB = 22
      const plotW = Math.max(40, w - padL - padR)
      const plotH = Math.max(40, h - padT - padB)
      const step = plotW / n
      const barW = clamp(step * 0.62, 1, 9)

      const barMax = Math.max(1, maxAbs(bars) * 1.08)
      let lineMin = Infinity
      let lineMax = -Infinity
      for (let i = 0; i < line.length; i++) {
        if (line[i] < lineMin) lineMin = line[i]
        if (line[i] > lineMax) lineMax = line[i]
      }
      if (!isFinite(lineMin)) {
        lineMin = 0
        lineMax = 1
      }
      if (lineMax === lineMin) {
        lineMax += 1
        lineMin -= 1
      }
      const linePad = (lineMax - lineMin) * 0.08
      lineMin -= linePad
      lineMax += linePad

      const zeroY = padT + (1 - (0 + barMax) / (barMax * 2)) * plotH
      const barY = (v) => padT + (1 - (v + barMax) / (barMax * 2)) * plotH
      const lineY = (v) => padT + (1 - (v - lineMin) / (lineMax - lineMin)) * plotH
      const cx = (i) => padL + step * i + step / 2

      // 网格
      ctx.lineWidth = 1
      for (let t = 0; t <= 2; t++) {
        const y = padT + (plotH / 2) * t
        ctx.strokeStyle = t === 1 ? COLORS.gridStrong : COLORS.grid
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(w - padR, y)
        ctx.stroke()
      }

      // 柱：从零轴向上/向下生长
      for (let i = 0; i < n; i++) {
        const v = (bars[i] || 0) * p
        const y1 = barY(Math.max(0, v))
        const y2 = barY(Math.min(0, v))
        const bh = Math.max(0.8, Math.abs(y2 - y1))
        ctx.fillStyle = v >= 0 ? COLORS.up : COLORS.down
        ctx.globalAlpha = i === this.activeIndex(n) ? 1 : 0.82
        ctx.fillRect(cx(i) - barW / 2, Math.min(y1, y2), barW, bh)
      }
      ctx.globalAlpha = 1

      // 累计线：从左向右揭开
      ctx.save()
      ctx.beginPath()
      ctx.rect(padL, padT, plotW * p, plotH)
      ctx.clip()
      ctx.strokeStyle = COLORS.line
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const x = cx(i)
        const y = lineY(line[i] || 0)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()

      // 零点
      ctx.strokeStyle = COLORS.gridStrong
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padL, zeroY)
      ctx.lineTo(w - padR, zeroY)
      ctx.stroke()

      const active = this.activeIndex(n)
      const ax = cx(active)
      const showActive = p >= 0.999

      if (showActive) {
        // 选中竖线
        ctx.save()
        ctx.strokeStyle = '#c9d7ee'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(ax, padT)
        ctx.lineTo(ax, padT + plotH)
        ctx.stroke()
        ctx.restore()

        // 选中点
        ctx.fillStyle = COLORS.line
        ctx.beginPath()
        ctx.arc(ax, lineY(line[active] || 0), 3.2, 0, Math.PI * 2)
        ctx.fill()
      }

      // 坐标轴
      ctx.fillStyle = COLORS.axis
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      for (let t = 0; t <= 2; t++) {
        const y = padT + (plotH / 2) * t
        const bv = barMax * (1 - 2 * (t / 2))
        const lv = lineMax - (lineMax - lineMin) * (t / 2)
        ctx.fillText(fmt(bv, Math.abs(bv) >= 100 ? 0 : this.data.barDigits), padL - 5, y)
        ctx.textAlign = 'left'
        ctx.fillText(fmt(lv, Math.abs(lv) >= 100 ? 0 : this.data.lineDigits), w - padR + 5, y)
        ctx.textAlign = 'right'
      }

      ctx.fillStyle = '#b3bcc9'
      ctx.font = '8px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(this.data.barAxis, padL - 5, 8)
      ctx.textAlign = 'left'
      ctx.fillText(this.data.lineAxis, w - padR + 5, 8)

      const ticks = tickIndexes(n, 4)
      ctx.fillStyle = COLORS.axis
      ctx.font = '9px sans-serif'
      ctx.textBaseline = 'alphabetic'
      for (let k = 0; k < ticks.length; k++) {
        const idx = ticks[k]
        ctx.textAlign = idx === 0 ? 'left' : (idx === n - 1 ? 'right' : 'center')
        ctx.fillText(dateLabel(labels[idx]), cx(idx), h - 6)
      }

      if (showActive) {
        this.drawDualTip(ctx, w, padL, padR, padT, cx(active), active, bars, line)
      }
    },

    drawDualTip(ctx, w, padL, padR, padT, x, active, bars, line) {
      const tw = 126
      const th = 50
      let tx = clamp(x - tw / 2, padL, w - padR - tw)
      const ty = padT + 1
      ctx.save()
      ctx.shadowColor = 'rgba(15,22,32,0.12)'
      ctx.shadowBlur = 10
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, tx, ty, tw, th, 8)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = '#e7eaf0'
      ctx.lineWidth = 1
      roundRect(ctx, tx, ty, tw, th, 8)
      ctx.stroke()

      ctx.textBaseline = 'middle'
      ctx.font = '9px sans-serif'
      ctx.fillStyle = COLORS.sub
      ctx.textAlign = 'left'
      ctx.fillText(this.data.labels[active], tx + 9, ty + 12)

      const barV = bars[active] || 0
      const lineV = line[active] || 0
      ctx.font = '10px sans-serif'
      ctx.fillStyle = COLORS.sub
      ctx.fillText(this.data.barName, tx + 9, ty + 29)
      ctx.fillText(this.data.lineName, tx + 9, ty + 42)

      ctx.textAlign = 'right'
      ctx.font = '600 10px sans-serif'
      ctx.fillStyle = barV >= 0 ? COLORS.up : COLORS.down
      ctx.fillText(fmt(barV, this.data.barDigits, true), tx + tw - 9, ty + 29)
      ctx.fillStyle = COLORS.line
      ctx.fillText(fmt(lineV, this.data.lineDigits, true), tx + tw - 9, ty + 42)
    },

    drawLine(ctx, w, h, progress) {
      const labels = this.data.labels || []
      const series = (this.data.series || []).filter((s) => s && s.values && s.values.length)
      const n = labels.length
      const p = progress === undefined ? 1 : progress
      if (!n || !series.length) {
        this.drawEmpty(ctx, w, h)
        return
      }

      const padL = 38
      const padR = 12
      const padT = 16
      const padB = 22
      const plotW = Math.max(40, w - padL - padR)
      const plotH = Math.max(40, h - padT - padB)
      const step = plotW / n
      const cx = (i) => padL + step * i + step / 2

      const ex = extent(series.map((s) => s.values))
      const yOf = (v) => padT + (1 - (v - ex.min) / (ex.max - ex.min)) * plotH

      ctx.lineWidth = 1
      ctx.font = '9px sans-serif'
      for (let t = 0; t <= 4; t++) {
        const y = padT + (plotH / 4) * t
        ctx.strokeStyle = t === 4 ? COLORS.gridStrong : COLORS.grid
        ctx.beginPath()
        ctx.moveTo(padL, y)
        ctx.lineTo(w - padR, y)
        ctx.stroke()
        ctx.fillStyle = COLORS.axis
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        const val = ex.max - (ex.max - ex.min) * (t / 4)
        ctx.fillText(fmt(val, this.data.digits), padL - 5, y)
      }

      // 面积 + 折线：从左向右揭开
      ctx.save()
      ctx.beginPath()
      ctx.rect(padL, padT, plotW * p, plotH)
      ctx.clip()

      // 面积（仅第一条）
      if (this.data.area && series.length) {
        const vals = series[0].values
        ctx.beginPath()
        ctx.moveTo(cx(0), padT + plotH)
        for (let i = 0; i < n; i++) ctx.lineTo(cx(i), yOf(vals[i]))
        ctx.lineTo(cx(n - 1), padT + plotH)
        ctx.closePath()
        ctx.globalAlpha = 0.08
        ctx.fillStyle = series[0].color || COLORS.line
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // 折线
      for (let s = 0; s < series.length; s++) {
        const item = series[s]
        ctx.strokeStyle = item.color || COLORS.line
        ctx.lineWidth = 1.9
        ctx.beginPath()
        for (let i = 0; i < n; i++) {
          const x = cx(i)
          const y = yOf(item.values[i])
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.fillStyle = item.color || COLORS.line
        ctx.beginPath()
        ctx.arc(cx(n - 1), yOf(item.values[n - 1]), 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()

      const active = this.activeIndex(n)
      const ax = cx(active)
      const showActive = p >= 0.999
      if (showActive) {
        ctx.save()
        ctx.strokeStyle = '#c9d7ee'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(ax, padT)
        ctx.lineTo(ax, padT + plotH)
        ctx.stroke()
        ctx.restore()

        for (let s = 0; s < series.length; s++) {
          const item = series[s]
          ctx.fillStyle = item.color || COLORS.line
          ctx.beginPath()
          ctx.arc(ax, yOf(item.values[active]), 3.1, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      const ticks = tickIndexes(n, 4)
      ctx.fillStyle = COLORS.axis
      ctx.font = '9px sans-serif'
      ctx.textBaseline = 'alphabetic'
      for (let k = 0; k < ticks.length; k++) {
        const idx = ticks[k]
        ctx.textAlign = idx === 0 ? 'left' : (idx === n - 1 ? 'right' : 'center')
        ctx.fillText(dateLabel(labels[idx]), cx(idx), h - 6)
      }

      if (showActive) {
        this.drawLineTip(ctx, w, padL, padT, ax, active, series)
      }
    },

    drawLineTip(ctx, w, padL, padT, x, active, series) {
      const tw = 136
      const th = 18 + series.length * 14
      let tx = clamp(x - tw / 2, padL, w - 12 - tw)
      const ty = padT + 1
      ctx.save()
      ctx.shadowColor = 'rgba(15,22,32,0.12)'
      ctx.shadowBlur = 10
      ctx.fillStyle = '#ffffff'
      roundRect(ctx, tx, ty, tw, th, 8)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = '#e7eaf0'
      ctx.lineWidth = 1
      roundRect(ctx, tx, ty, tw, th, 8)
      ctx.stroke()

      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.font = '9px sans-serif'
      ctx.fillStyle = COLORS.sub
      ctx.fillText(this.data.labels[active], tx + 9, ty + 11)

      ctx.font = '10px sans-serif'
      for (let i = 0; i < series.length; i++) {
        const s = series[i]
        const y = ty + 25 + i * 14
        ctx.fillStyle = COLORS.sub
        ctx.fillText(s.name || s.key || '', tx + 9, y)
        ctx.textAlign = 'right'
        ctx.fillStyle = s.color || COLORS.ink
        ctx.fillText(fmt(s.values[active], this.data.digits), tx + tw - 9, y)
        ctx.textAlign = 'left'
      }
    },

    drawEmpty(ctx, w, h) {
      ctx.fillStyle = COLORS.axis
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(this.data.emptyText, w / 2, h / 2)
    },

    activeIndex(n) {
      if (this._active === undefined || this._active === null || this._active < 0 || this._active >= n) {
        this._active = n - 1
      }
      return this._active
    },

    onTouchStart(e) {
      this.updateActive(e)
    },

    onTouchMove(e) {
      this.updateActive(e)
    },

    onTouchEnd() {},

    updateActive(e) {
      if (!this._ready) return
      if (this._animating) {
        this.stopAnimation()
        this.draw(1)
      }
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      if (!touch) return

      let x = touch.x
      if (typeof x !== 'number') {
        x = (touch.clientX || 0) - (this._left || 0)
      }

      const labels = this.data.labels || []
      const n = labels.length
      if (!n) return

      const padL = this.data.type === 'line' ? 38 : 40
      const padR = this.data.type === 'line' ? 12 : 42
      const plotW = Math.max(40, this._w - padL - padR)
      const step = plotW / n
      const idx = clamp(Math.round((x - padL - step / 2) / step), 0, n - 1)

      if (idx === this._active) return
      this._active = idx
      this.draw(1)
    }
  }
})
