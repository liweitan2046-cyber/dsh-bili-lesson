/**
 * 奖品池：家长可编辑的盲盒奖池。
 * 每个奖品 = 名称 + 图标 + 稀有度 + 总库存 + 每周上限 + 是否启用。
 * 纯函数（随机数可注入），selftest 直接单测。
 */
import { CATALOG } from './rewards.js'

/** 稀有度权重：同一稀有度内等概率。 */
export const RARITY_WEIGHT = { common: 5, rare: 3, epic: 1 }
export const RARITY_LABEL = { common: '常见', rare: '稀有', epic: '珍稀' }
export const RARITY_KEYS = ['common', 'rare', 'epic']
export const MAX_ITEMS = 200

const ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/i

function bad(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function shortText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** 空字符串 / null / 负数一律当「不限」。 */
function limitOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.min(9999, Math.round(num))
}

function newPrizeId(seed) {
  const base = String(seed).replace(/[^a-z0-9]/gi, '').slice(0, 6).toLowerCase() || 'prize'
  return 'pz_' + base
}

/** 默认奖池 = 原来的 54 格目录，库存与每周上限都不限，家长可以逐条改。 */
export function defaultPool() {
  return CATALOG.map(item => ({
    id: item.id,
    name: item.name,
    emoji: item.emoji || '🎁',
    rarity: item.rarity || 'common',
    note: '',
    stock: null,
    weeklyCap: null,
    enabled: true,
  }))
}

/**
 * 校验一条奖品。id 合法且没被占用就沿用，否则按名称生成。
 * 名称必填（<=20 字）；稀有度不认识按 common；stock / weeklyCap 空 = 不限。
 */
export function normalizePrize(raw, index, seen) {
  const row = raw && typeof raw === 'object' ? raw : {}
  const name = shortText(row.name, 20)
  if (!name) throw bad('第 ' + (index + 1) + ' 个奖品还没写名称')
  const taken = seen instanceof Set ? seen : new Set()
  let id = typeof row.id === 'string' && ID_RE.test(row.id) ? row.id : newPrizeId(name)
  if (taken.has(id)) id = id + '_' + (index + 1)
  const rarity = RARITY_KEYS.includes(row.rarity) ? row.rarity : 'common'
  const emoji = shortText(row.emoji, 8) || '🎁'
  return {
    id,
    name,
    emoji,
    rarity,
    note: shortText(row.note, 40),
    stock: limitOrNull(row.stock),
    weeklyCap: limitOrNull(row.weeklyCap) || null,
    enabled: row.enabled !== false,
  }
}

/** 整池校验：顺序保留，id 去重，最多 200 条。 */
export function normalizePool(items) {
  if (!Array.isArray(items)) throw bad('items 要是数组')
  if (items.length > MAX_ITEMS) throw bad('奖品最多 ' + MAX_ITEMS + ' 个')
  const seen = new Set()
  const out = []
  items.forEach((raw, index) => {
    const item = normalizePrize(raw, index, seen)
    seen.add(item.id)
    out.push(item)
  })
  return { version: 1, items: out }
}

/** 读回来的池子兜底：没有文件或坏文件时用默认目录。 */
export function poolOf(saved) {
  if (saved && Array.isArray(saved.items) && saved.items.length) {
    try {
      return normalizePool(saved.items)
    } catch {
      return { version: 1, items: defaultPool() }
    }
  }
  return { version: 1, items: defaultPool() }
}

/**
 * 用量统计：events = [{ itemId, date }]（抽中记录 + 勋章赠送），
 * 只统计 date >= weekStart 的为本周用量。
 */
export function countUsage(events, weekStart) {
  const total = {}
  const week = {}
  for (const row of events || []) {
    if (!row || !row.itemId) continue
    total[row.itemId] = (total[row.itemId] || 0) + 1
    if (!weekStart || (typeof row.date === 'string' && row.date >= weekStart)) {
      week[row.itemId] = (week[row.itemId] || 0) + 1
    }
  }
  return { total, week }
}

export function remainingOf(item, used) {
  if (!item || item.stock === null || item.stock === undefined) return null
  return Math.max(0, item.stock - (Number(used) || 0))
}

/** 可抽池：启用 + 库存没抽完 + 本周没到上限。 */
export function drawable(items, usage) {
  const used = usage || { total: {}, week: {} }
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || item.enabled === false) return false
    if (item.stock !== null && item.stock !== undefined && (used.total[item.id] || 0) >= item.stock) return false
    if (item.weeklyCap !== null && item.weeklyCap !== undefined && (used.week[item.id] || 0) >= item.weeklyCap) return false
    return true
  })
}

/** 按稀有度权重抽一个；池子空返回 null。 */
export function pickPrize(items, random = Math.random()) {
  const pool = Array.isArray(items) ? items.filter(Boolean) : []
  if (!pool.length) return null
  const weights = pool.map(item => RARITY_WEIGHT[item.rarity] || RARITY_WEIGHT.common)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let r = Number(random)
  if (!Number.isFinite(r) || r < 0) r = 0
  if (r >= 1) r = 1 - 1e-9
  const hit = r * total
  let acc = 0
  for (let i = 0; i < pool.length; i += 1) {
    acc += weights[i]
    if (hit < acc) return pool[i]
  }
  return pool[pool.length - 1]
}

/** 面板用的池子视图：带上权重、剩余库存、本周已用。 */
export function prizeView(items, usage, weekStart) {
  const used = usage || { total: {}, week: {} }
  return (Array.isArray(items) ? items : []).map(item => ({
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    note: item.note || '',
    rarity: item.rarity,
    rarityLabel: RARITY_LABEL[item.rarity] || '常见',
    weight: RARITY_WEIGHT[item.rarity] || RARITY_WEIGHT.common,
    stock: item.stock === null || item.stock === undefined ? null : item.stock,
    weeklyCap: item.weeklyCap === null || item.weeklyCap === undefined ? null : item.weeklyCap,
    enabled: item.enabled !== false,
    used: used.total[item.id] || 0,
    remaining: remainingOf(item, used.total[item.id] || 0),
    weekUsed: used.week[item.id] || 0,
  }))
}
