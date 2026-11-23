'use strict'

/**
 * 极简 xlsx 读取器（仅依赖 Node 内置 zlib）。
 *
 * 深交所 ETF 份额接口只返回 xlsx，且小程序 / 云函数不适合引入体积较大的
 * excel 解析依赖，所以这里实现「zip 解包 + 共享字符串 + sheet1 单元格」
 * 的最小闭环，只处理接口实际会返回的格式。
 */

const zlib = require('zlib')

function unzip(buffer) {
  let eocd = -1
  const min = Math.max(0, buffer.length - 66000)
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('xlsx 不是合法的 zip：找不到 EOCD')

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = {}

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('xlsx zip 目录损坏')
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLen = buffer.readUInt16LE(offset + 28)
    const extraLen = buffer.readUInt16LE(offset + 30)
    const commentLen = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.slice(offset + 46, offset + 46 + nameLen).toString('utf8')

    const localNameLen = buffer.readUInt16LE(localOffset + 26)
    const localExtraLen = buffer.readUInt16LE(localOffset + 28)
    const dataOffset = localOffset + 30 + localNameLen + localExtraLen
    let data = buffer.slice(dataOffset, dataOffset + compressedSize)

    if (method === 8) data = zlib.inflateRawSync(data)
    else if (method !== 0) throw new Error('不支持的 xlsx 压缩方式: ' + method)

    entries[name] = data
    offset += 46 + nameLen + extraLen + commentLen
  }

  return entries
}

function decodeXml(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

function parseSharedStrings(xml) {
  const list = []
  if (!xml) return list
  xml.replace(/<si>([\s\S]*?)<\/si>/g, (match, inner) => {
    let text = ''
    // 富文本 <r><t>...</t></r> 也要拼接
    inner.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m, t) => {
      text += decodeXml(t)
      return ''
    })
    list.push(text)
    return ''
  })
  return list
}

function columnIndex(ref) {
  let n = 0
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

function parseSheet(xml, shared) {
  const rows = []
  xml.replace(/<row[^>]*>([\s\S]*?)<\/row>/g, (match, rowInner) => {
    const cells = []
    rowInner.replace(/<c([^>]*)>([\s\S]*?)<\/c>/g, (cellMatch, attrs, inner) => {
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/)
      const typeMatch = attrs.match(/\bt="([^"]+)"/)
      const ref = refMatch ? refMatch[1] : ''
      const type = typeMatch ? typeMatch[1] : ''
      let value = ''

      const v = inner.match(/<v>([\s\S]*?)<\/v>/)
      if (type === 's' && v) {
        value = shared[Number(v[1])]
      } else if (type === 'inlineStr') {
        const is = inner.match(/<is>([\s\S]*?)<\/is>/)
        if (is) {
          is[1].replace(/<t[^>]*>([\s\S]*?)<\/t>/g, (m, t) => {
            value += decodeXml(t)
            return ''
          })
        }
      } else if (v) {
        value = decodeXml(v[1])
      }

      const idx = ref ? columnIndex(ref) : cells.length
      cells[idx] = value === undefined ? '' : value
      return ''
    })
    rows.push(cells)
    return ''
  })
  return rows
}

/** 把 xlsx Buffer 解析为二维数组（字符串）。 */
function readXlsx(buffer) {
  const entries = unzip(buffer)
  const shared = parseSharedStrings(entries['xl/sharedStrings.xml'] ? entries['xl/sharedStrings.xml'].toString('utf8') : '')
  const sheetName = Object.keys(entries).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
  if (!sheetName) throw new Error('xlsx 中找不到工作表')
  return parseSheet(entries[sheetName].toString('utf8'), shared)
}

module.exports = { readXlsx }
