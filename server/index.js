'use strict'

/**
 * 可选：本地 / 自建服务器 API（文档方案 E）。
 *
 * 方案 C（默认）不需要本文件；只有开发阶段想验证实时刷新、
 * 或生产环境愿意部署已备案 HTTPS 域名时才启动。
 *
 *   GET /api/health
 *   GET /api/snapshot          → { ok, data: 完整快照 }
 *   GET /api/qihuo?date=...    → { ok, data: { date, sides } | null }
 */

const http = require('http')
const path = require('path')
const { URL } = require('url')

const { buildSnapshot } = require('./lib/builder')
const { fetchQihuo } = require('./lib/eastmoney')
const { Cache } = require('./lib/cache')

const PORT = Number(process.env.PORT) || 3100
const QIHUO_TTL = 5 * 60 * 1000
const REFRESH_MIN_INTERVAL = 2 * 60 * 1000

const cache = new Cache(path.resolve(__dirname, '.cache'))
const state = {
  snapshot: null,
  building: false,
  lastError: null,
  lastBuildAt: 0
}
const qihuoCache = {}

function log(msg) {
  console.log(new Date().toISOString().slice(11, 19), msg)
}

function loadInitialSnapshot() {
  try {
    const cached = cache.load('snapshot', null)
    if (cached && cached.etfs && cached.etfs.length) {
      log('已加载本地快照：' + cached.meta.etfDate + ' / ' + cached.meta.updated)
      return cached
    }
  } catch (e) {
    // ignore
  }
  try {
    const bundled = require('../miniprogram/data/snapshot.js')
    if (bundled && bundled.etfs && bundled.etfs.length) {
      log('已加载内置快照：' + bundled.meta.etfDate + ' / ' + bundled.meta.updated)
      return bundled
    }
  } catch (e) {
    // 没有内置快照时只能等待首次抓取
  }
  return null
}

async function refreshSnapshot(force) {
  if (state.building) return
  if (!force && Date.now() - state.lastBuildAt < REFRESH_MIN_INTERVAL) return

  state.building = true
  state.lastError = null
  const days = state.snapshot && state.snapshot.dates ? Math.max(147, state.snapshot.dates.length) : 147

  try {
    log('开始增量刷新数据…')
    const snapshot = await buildSnapshot({
      days,
      log: (msg) => log(msg)
    })
    state.snapshot = snapshot
    state.lastBuildAt = Date.now()
    log('刷新完成：ETF ' + snapshot.meta.etfDate + ' · 期货 ' + snapshot.futures.latestDate)
  } catch (e) {
    state.lastError = e.message
    log('刷新失败：' + e.message)
  } finally {
    state.building = false
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  })
  res.end(body)
}

async function handleQihuo(url, res) {
  const date = url.searchParams.get('date') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    sendJson(res, 400, { ok: false, error: 'date 需为 YYYY-MM-DD' })
    return
  }

  const hit = qihuoCache[date]
  if (hit && Date.now() - hit.at < QIHUO_TTL) {
    sendJson(res, 200, { ok: true, cached: true, data: hit.data })
    return
  }

  try {
    const data = await fetchQihuo(date)
    qihuoCache[date] = { at: Date.now(), data }
    sendJson(res, 200, { ok: true, cached: false, data })
  } catch (e) {
    sendJson(res, 502, { ok: false, error: e.message })
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    })
    res.end()
    return
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: '仅支持 GET' })
    return
  }

  if (url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      building: state.building,
      snapshotDate: state.snapshot ? state.snapshot.meta.etfDate : null,
      updated: state.snapshot ? state.snapshot.meta.updated : null,
      lastError: state.lastError
    })
    return
  }

  if (url.pathname === '/api/snapshot') {
    if (!state.snapshot) {
      sendJson(res, 503, { ok: false, error: state.building ? '数据正在生成，请稍后重试' : '暂无快照' })
      return
    }
    sendJson(res, 200, { ok: true, building: state.building, data: state.snapshot })
    return
  }

  if (url.pathname === '/api/qihuo') {
    handleQihuo(url, res)
    return
  }

  sendJson(res, 404, { ok: false, error: '接口不存在' })
})

state.snapshot = loadInitialSnapshot()
server.listen(PORT, () => {
  log('数据服务已启动：http://127.0.0.1:' + PORT)
  log('接口：/api/snapshot · /api/qihuo?date=YYYY-MM-DD · /api/health')
  refreshSnapshot(false)
})

// 每 10 分钟检查一次，份额 / 期货收盘后自动补当日数据
setInterval(() => refreshSnapshot(false), 10 * 60 * 1000)
