'use strict'

/**
 * 轻量 HTTPS 客户端：跟随跳转、解压 gzip/deflate/br、超时、重试。
 * 不依赖任何第三方包，云函数 / 本地服务 / 离线生成脚本共用。
 */

const https = require('https')
const http = require('http')
const zlib = require('zlib')
const { URL } = require('url')

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decompress(buffer, headers) {
  const enc = String(headers['content-encoding'] || '').toLowerCase()
  try {
    if (enc.indexOf('gzip') >= 0) return zlib.gunzipSync(buffer)
    if (enc.indexOf('deflate') >= 0) return zlib.inflateSync(buffer)
    if (enc.indexOf('br') >= 0) return zlib.brotliDecompressSync(buffer)
  } catch (e) {
    // 服务器声明了压缩但内容未压缩时，按原文返回
  }
  return buffer
}

function once(url, options, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch (e) {
      reject(new Error('非法 URL: ' + url))
      return
    }
    const lib = parsed.protocol === 'http:' ? http : https
    const headers = Object.assign(
      {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'close'
      },
      options.headers || {}
    )

    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'http:' ? 80 : 443),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || 30000
      },
      (res) => {
        const status = res.statusCode
        if ([301, 302, 303, 307, 308].indexOf(status) >= 0 && res.headers.location && redirectsLeft > 0) {
          res.resume()
          let next
          try {
            next = new URL(res.headers.location, url).toString()
          } catch (e) {
            reject(new Error('跳转地址非法: ' + res.headers.location))
            return
          }
          resolve(once(next, options, redirectsLeft - 1))
          return
        }

        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const body = decompress(Buffer.concat(chunks), res.headers)
          resolve({
            status: res.statusCode,
            headers: res.headers,
            buffer: body,
            text: body.toString('utf8'),
            url
          })
        })
        res.on('error', reject)
      }
    )

    req.on('timeout', () => req.destroy(new Error('请求超时: ' + url)))
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

/**
 * 带重试的请求。5xx / 429 / 网络错误会重试，4xx 直接返回（由调用方判断）。
 */
async function request(url, options) {
  const opts = options || {}
  const retries = typeof opts.retries === 'number' ? opts.retries : 3
  const retryDelay = typeof opts.retryDelay === 'number' ? opts.retryDelay : 900
  let lastError = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await once(url, opts, 3)
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        lastError = new Error('HTTP ' + res.status + ': ' + url)
        await sleep(retryDelay * (attempt + 1))
        continue
      }
      return res
    } catch (e) {
      lastError = e
      if (attempt < retries) await sleep(retryDelay * (attempt + 1))
    }
  }
  throw lastError || new Error('请求失败: ' + url)
}

async function requestJson(url, options) {
  const res = await request(url, options)
  if (res.status !== 200) throw new Error('HTTP ' + res.status + ': ' + url)
  const text = res.text.replace(/^\uFEFF/, '')
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error('返回不是合法 JSON（' + url + '）：' + text.slice(0, 120))
  }
}

async function requestBuffer(url, options) {
  const res = await request(url, options)
  if (res.status !== 200) throw new Error('HTTP ' + res.status + ': ' + url)
  return res.buffer
}

/** 并发受限的 map，避免把交易所接口打挂。 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const size = Math.max(1, Math.min(limit || 4, items.length || 1))

  async function run() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: size }, run))
  return results
}

module.exports = {
  DEFAULT_UA,
  request,
  requestJson,
  requestBuffer,
  mapLimit,
  sleep
}
