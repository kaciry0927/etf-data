/**
 * 数据服务层（真实数据版）。
 *
 * 数据来源优先级：
 *   1. 启动时读取本地缓存 / 内置真实快照（同步，保证页面立即有内容）
 *   2. app.onLaunch 调用 init()，通过 HTTP 服务或云函数增量刷新
 *   3. 刷新成功后写入缓存，并通知已订阅的页面重新渲染
 *
 * 页面只依赖：getSnapshot / getEtf / getQihuo / refresh / subscribe / isTradingDay。
 */

const config = require('../config')

let bundled = null
try {
  // 由 server/build.js 从官方接口生成的真实快照，作为离线兜底
  bundled = require('../data/snapshot')
} catch (e) {
  bundled = null
}

const CACHE_KEY = 'etf:snapshot:v2'
const QIHUO_CACHE_MINUTES = config.qihuoCacheMinutes || 5

let snapshot = null
let source = 'bundle'
let lastError = ''
let initPromise = null
let refreshPromise = null
const listeners = []
const qihuoMemo = {}

/* -------------------- 模式与缓存 -------------------- */

function resolveMode() {
  if (config.dataMode === 'http' || config.dataMode === 'cloud' || config.dataMode === 'offline') {
    return config.dataMode
  }
  if (config.cloudEnv && typeof wx !== 'undefined' && wx.cloud) return 'cloud'
  if (config.apiBase) return 'http'
  return 'offline'
}

function readCache() {
  try {
    const cached = wx.getStorageSync(CACHE_KEY)
    if (cached && cached.etfs && cached.etfs.length && cached.dates && cached.dates.length) {
      return cached
    }
  } catch (e) {
    // ignore
  }
  return null
}

function validate(data) {
  return !!(
    data &&
    Array.isArray(data.etfs) &&
    data.etfs.length &&
    Array.isArray(data.dates) &&
    data.dates.length &&
    data.totals &&
    data.futures &&
    Array.isArray(data.futures.dates) &&
    data.futures.dates.length
  )
}

function revisionOf(data) {
  if (!data) return ''
  const first = (data.etfs && data.etfs[0]) || {}
  const futures = data.futures || {}
  const qihuoKeys = Object.keys(data.qihuo || {}).sort()
  // 用实际数据指纹判断是否需要重渲染；仅抓取时间变化时不重新播放页面动画
  return [
    data.etfDate,
    data.today,
    futures.latestDate,
    data.totals && data.totals.dayFlow,
    first.latestShares,
    first.latestFlow,
    data.etfs ? data.etfs.length : 0,
    qihuoKeys[qihuoKeys.length - 1] || ''
  ].join('|')
}

function emit() {
  listeners.slice().forEach((fn) => {
    try {
      fn(snapshot)
    } catch (e) {
      // 单个页面异常不影响其他页面
    }
  })
}

/* -------------------- 读取 -------------------- */

function getSnapshot() {
  if (!snapshot) {
    const cached = readCache()
    if (cached) {
      snapshot = cached
      source = 'cache'
    } else if (bundled) {
      snapshot = bundled
      source = 'bundle'
    } else {
      throw new Error('缺少数据快照：请先运行 server/build.js 生成内置快照')
    }
  }
  return snapshot
}

function getEtf(code) {
  const data = getSnapshot()
  const found = data.etfs.filter((e) => e.code === String(code))
  return found.length ? found[0] : data.etfs[0]
}

function isTradingDay(date) {
  if (!date) return false
  const d = new Date(date + 'T00:00:00Z')
  if (isNaN(d.getTime())) return false
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return false
  const snap = getSnapshot()
  if (snap.dates.indexOf(date) >= 0) return true
  // 期货收盘后当晚就有数据，可能比 T+1 披露的份额早一个交易日，
  // 这天依然算交易日（否则“今天”的龙虎榜会被误判成非交易日）。
  const futDates = (snap.futures && snap.futures.dates) || []
  return futDates.indexOf(date) >= 0
}

/* -------------------- 网络 -------------------- */

/**
 * 静态托管（GitHub Pages / 对象存储）会在 CDN 边缘缓存 JSON，
 * 同一个 URL 可能几十分钟不变。加时间戳绕开缓存，保证拿到当天数据。
 */
function cacheBust(url) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now()
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.request) {
      reject(new Error('当前环境不支持 wx.request'))
      return
    }
    if (!config.apiBase) {
      reject(new Error('未配置 apiBase'))
      return
    }
    wx.request({
      url: cacheBust(String(config.apiBase).replace(/\/+$/, '') + path),
      method: 'GET',
      timeout: config.requestTimeout || 20000,
      header: { 'content-type': 'application/json' },
      success(res) {
        const body = res && res.data
        if (!res || res.statusCode !== 200 || !body || body.ok !== true) {
          reject(new Error((body && body.error) || ('HTTP ' + (res && res.statusCode))))
          return
        }
        resolve(body.data)
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'))
      }
    })
  })
}

function cloudCall(action, data) {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) {
      reject(new Error('云开发未初始化'))
      return
    }
    wx.cloud.callFunction({
      name: config.cloudFunction,
      data: Object.assign({ action: action }, data || {})
    }).then((res) => {
      const payload = res && res.result
      if (!payload || payload.ok !== true) {
        reject(new Error((payload && payload.error) || '云函数返回异常'))
        return
      }
      resolve(payload.data)
    }).catch((err) => {
      reject(new Error((err && err.errMsg) || (err && err.message) || '云函数调用失败'))
    })
  })
}

function fetchSnapshot() {
  const mode = resolveMode()
  if (mode === 'http') {
    // 首选静态托管路径（GitHub Pages）；失败再退回自建服务的 /api/snapshot，
    // 这样同一份代码既能读 Pages，也能连 server/index.js 调试。
    return httpGet('/snapshot.json').catch(() => httpGet('/api/snapshot'))
  }
  if (mode === 'cloud') return cloudCall('get')
  return Promise.reject(new Error('当前为离线模式'))
}

/* -------------------- 刷新 -------------------- */

function refresh(force) {
  if (refreshPromise) return refreshPromise

  const mode = resolveMode()
  const current = getSnapshot()

  if (mode === 'offline') {
    return Promise.resolve({ mode: 'offline', data: current })
  }

  const pending = fetchSnapshot().then((data) => {
    if (!validate(data)) throw new Error('接口返回的数据结构不完整')
    const changed = revisionOf(data) !== revisionOf(current)
    snapshot = data
    source = 'live'
    lastError = ''
    try {
      wx.setStorageSync(CACHE_KEY, data)
    } catch (e) {
      // 缓存失败不影响本次展示
    }
    if (changed) emit()
    return { mode: mode, data: data, updated: data.meta && data.meta.updated, changed: changed }
  })

  refreshPromise = pending.then(
    (result) => {
      refreshPromise = null
      return result
    },
    (err) => {
      lastError = (err && err.message) || String(err)
      refreshPromise = null
      throw err
    }
  )

  return refreshPromise
}

/**
 * 启动初始化：缓存新鲜时直接返回，否则请求最新快照。
 * 不抛出异常——失败时保留内置 / 缓存快照，页面仍可用。
 */
function init() {
  if (initPromise) return initPromise

  const current = getSnapshot()
  const fetchedAt = Date.parse((current.meta && current.meta.fetchedAt) || '')
  const cacheMinutes = Number(config.cacheMinutes) || 0
  const fresh =
    source !== 'bundle' && fetchedAt && cacheMinutes > 0 &&
    Date.now() - fetchedAt < cacheMinutes * 60 * 1000

  if (fresh) {
    initPromise = Promise.resolve({ mode: source, data: current, cached: true })
    return initPromise
  }

  initPromise = refresh(false).catch(() => ({
    mode: resolveMode(),
    data: getSnapshot(),
    error: lastError
  }))
  return initPromise
}

/* -------------------- 期指多空 -------------------- */

/** 龙虎榜随快照一起下发（build 时抓最近 N 天），本地命中就不用发请求。 */
function localQihuo(date) {
  const data = getSnapshot()
  const fromSnapshot = data.qihuo && data.qihuo[date]
  if (fromSnapshot) return fromSnapshot
  const bundledMap = (bundled && bundled.qihuo) || {}
  return bundledMap[date] || null
}

function qihuoRangeHint() {
  const data = getSnapshot()
  const map = Object.assign({}, (bundled && bundled.qihuo) || {}, data.qihuo || {})
  const dates = Object.keys(map).sort()
  const range = dates.length ? dates[0] + ' ~ ' + dates[dates.length - 1] : '无'
  return '当前快照只包含 ' + range + ' 的龙虎榜；更早的日期需要自建数据服务'
}

function getQihuo(date) {
  const hit = qihuoMemo[date]
  if (hit && Date.now() - hit.at < QIHUO_CACHE_MINUTES * 60 * 1000) {
    return Promise.resolve(hit.data)
  }

  const mode = resolveMode()

  // 方案 C：静态快照随包发布，龙虎榜只覆盖最近 N 个交易日
  if (mode === 'offline') {
    if (!isTradingDay(date)) return Promise.resolve(null)
    const payload = localQihuo(date)
    if (payload) {
      qihuoMemo[date] = { at: Date.now(), data: payload }
      return Promise.resolve(payload)
    }
    return Promise.reject(new Error(qihuoRangeHint()))
  }

  // GitHub Pages 等静态托管没有 /qihuo?date= 这种接口，龙虎榜只能靠快照；
  // 接自建服务（server/index.js）想拿实时数据时，把 config.qihuoPreferSnapshot 设为 false。
  if (config.qihuoPreferSnapshot !== false) {
    if (!isTradingDay(date)) return Promise.resolve(null)
    const local = localQihuo(date)
    if (local) {
      qihuoMemo[date] = { at: Date.now(), data: local }
      return Promise.resolve(local)
    }
    return Promise.reject(new Error(qihuoRangeHint()))
  }

  let request
  if (mode === 'http') request = httpGet('/api/qihuo?date=' + encodeURIComponent(date))
  else if (mode === 'cloud') request = cloudCall('qihuo', { date: date })
  else return Promise.reject(new Error('当前为离线模式，期指龙虎榜需要配置数据服务'))

  return request.then((data) => {
    qihuoMemo[date] = { at: Date.now(), data: data }
    return data
  })
}

/* -------------------- 订阅 / 状态 -------------------- */

function subscribe(fn) {
  if (typeof fn !== 'function') return function () {}
  listeners.push(fn)
  return function unsubscribe() {
    const index = listeners.indexOf(fn)
    if (index >= 0) listeners.splice(index, 1)
  }
}

function getStatus() {
  const data = getSnapshot()
  const mode = resolveMode()
  return {
    mode: mode,
    modeLabel: mode === 'cloud' ? '云开发' : mode === 'http' ? '数据服务' : '内置快照',
    source: source,
    lastError: lastError,
    updated: data.meta && data.meta.updated,
    fetchedAt: data.meta && data.meta.fetchedAt
  }
}

function clearCache() {
  snapshot = null
  qihuoMemoClean()
  try {
    wx.removeStorageSync(CACHE_KEY)
    // 清理旧版本可能遗留的演示快照
    wx.removeStorageSync('etf:snapshot')
  } catch (e) {
    // ignore
  }
  source = readCache() ? 'cache' : 'bundle'
}

function qihuoMemoClean() {
  Object.keys(qihuoMemo).forEach((key) => {
    delete qihuoMemo[key]
  })
}

function getCacheInfo() {
  try {
    const info = wx.getStorageInfoSync()
    return {
      currentSize: info.currentSize || 0,
      limitSize: info.limitSize || 0
    }
  } catch (e) {
    return { currentSize: 0, limitSize: 0 }
  }
}

module.exports = {
  config: config,
  getSnapshot: getSnapshot,
  getEtf: getEtf,
  getQihuo: getQihuo,
  isTradingDay: isTradingDay,
  init: init,
  refresh: refresh,
  subscribe: subscribe,
  getStatus: getStatus,
  clearCache: clearCache,
  getCacheInfo: getCacheInfo
}
