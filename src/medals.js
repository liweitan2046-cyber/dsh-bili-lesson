/**
 * 勋章：内置 8 枚，家长可调目标值与奖励（星火点数 / 赠送指定奖品）。
 * 纯函数，selftest 直接单测。
 */
export const METRICS = {
  watch: { label: '看完视频', unit: '条' },
  correct: { label: '答对题目', unit: '题' },
  streak: { label: '连续学习', unit: '天' },
  category: { label: '集齐分类', unit: '个' },
}

export const MEDAL_DEFS = [
  { id: 'md_first', name: '初次启航', glyph: 'rocket', metric: 'watch', target: 1, xp: 60 },
  { id: 'md_watch5', name: '五连航行', glyph: 'star', metric: 'watch', target: 5, xp: 100 },
  { id: 'md_watch20', name: '星图远航', glyph: 'compass', metric: 'watch', target: 20, xp: 200 },
  { id: 'md_correct10', name: '解题新手', glyph: 'question', metric: 'correct', target: 10, xp: 80 },
  { id: 'md_correct50', name: '解题老手', glyph: 'medal', metric: 'correct', target: 50, xp: 200 },
  { id: 'md_streak3', name: '三日不辍', glyph: 'calendar', metric: 'streak', target: 3, xp: 90 },
  { id: 'md_streak7', name: '七日航线', glyph: 'calendar', metric: 'streak', target: 7, xp: 220 },
  { id: 'md_category', name: '星域全收', glyph: 'gem', metric: 'category', target: 1, xp: 300 },
]

const MAX_TARGET = 999
const MAX_XP = 2000

function bad(message) {
  return Object.assign(new Error(message), { status: 400 })
}

function clampInt(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.round(num)))
}

export function defaultMedals() {
  return MEDAL_DEFS.map(def => ({ ...def, prizeId: '', enabled: true }))
}

const two = n => String(n).padStart(2, '0')

function dayStamp(date) {
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate())
}

/** 最长连续打卡天数（只看看完记录）。 */
export function longestStreak(days) {
  const list = Array.from(new Set((days || []).filter(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)))).sort()
  let best = 0
  let run = 0
  let prev = null
  for (const day of list) {
    const at = Date.parse(day + 'T00:00:00Z')
    if (prev !== null && at - prev === 86400000) run += 1
    else run = 1
    prev = at
    if (run > best) best = run
  }
  return best
}

/** 学习统计：勋章条件都从这里取数。watched 只认 done === true。 */
export function studyStats(input) {
  const source = input || {}
  const videos = Array.isArray(source.videos) ? source.videos : []
  const watch = Array.isArray(source.watch) ? source.watch : []
  const attempts = Array.isArray(source.attempts) ? source.attempts : []
  const watchedIds = new Set()
  const days = []
  for (const row of watch) {
    if (!row || row.done !== true || !row.videoId) continue
    watchedIds.add(row.videoId)
    if (typeof row.date === 'string') days.push(row.date)
  }
  const correct = attempts.reduce((sum, row) => sum + (Number(row && row.correct) || 0), 0)
  const totalByCat = {}
  const doneByCat = {}
  for (const video of videos) {
    if (!video || !video.id) continue
    const cat = video.category || '未分类'
    totalByCat[cat] = (totalByCat[cat] || 0) + 1
    if (watchedIds.has(video.id)) doneByCat[cat] = (doneByCat[cat] || 0) + 1
  }
  let categories = 0
  for (const cat of Object.keys(totalByCat)) {
    if (totalByCat[cat] > 0 && (doneByCat[cat] || 0) === totalByCat[cat]) categories += 1
  }
  return {
    watch: watchedIds.size,
    correct,
    streak: longestStreak(days),
    category: categories,
    categories: Object.keys(totalByCat).map(cat => ({ name: cat, total: totalByCat[cat], done: doneByCat[cat] || 0 })),
  }
}

/** 一枚勋章的当前进度。 */
export function progressOf(medal, stats) {
  const target = Math.max(1, Number(medal && medal.target) || 1)
  const value = Math.max(0, Number(stats && stats[medal.metric]) || 0)
  const pct = Math.min(100, Math.round((value / target) * 1000) / 10)
  return { value, target, pct, earned: value >= target }
}

/** 保存的配置覆盖内置定义：metric / glyph 不可改，未知 id 丢弃。 */
export function mergeMedals(saved, prizeIds) {
  const allowed = prizeIds instanceof Set ? prizeIds : null
  const byId = {}
  const rows = saved && Array.isArray(saved.items) ? saved.items : []
  for (const row of rows) {
    if (row && typeof row.id === 'string') byId[row.id] = row
  }
  return {
    version: 1,
    items: MEDAL_DEFS.map(def => {
      const saved = byId[def.id] || {}
      const prizeId = typeof saved.prizeId === 'string' ? saved.prizeId : ''
      return {
        id: def.id,
        glyph: def.glyph,
        metric: def.metric,
        name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim().slice(0, 12) : def.name,
        target: clampInt(saved.target, 1, MAX_TARGET, def.target),
        xp: clampInt(saved.xp, 0, MAX_XP, def.xp),
        prizeId: allowed && !allowed.has(prizeId) ? '' : prizeId,
        enabled: saved.enabled !== false,
      }
    }),
  }
}

/** 保存前校验：只允许改 name / target / xp / prizeId / enabled。 */
export function normalizeMedals(items, prizeIds) {
  if (!Array.isArray(items)) throw bad('items 要是数组')
  const allowed = prizeIds instanceof Set ? prizeIds : null
  const byId = {}
  for (const row of items) {
    if (row && typeof row.id === 'string' && MEDAL_DEFS.some(def => def.id === row.id)) byId[row.id] = row
  }
  return mergeMedals({ items: Object.values(byId) }, allowed)
}

/** 勋章视图：带进度与是否已得。 */
export function medalView(config, stats, honors) {
  const earnedMap = {}
  for (const row of (honors && honors.earned) || []) {
    if (row && row.id) earnedMap[row.id] = row
  }
  const items = (config.items || []).map(medal => {
    const progress = progressOf(medal, stats)
    const got = earnedMap[medal.id] || null
    return {
      id: medal.id,
      name: medal.name,
      glyph: medal.glyph,
      metric: medal.metric,
      metricLabel: (METRICS[medal.metric] || {}).label || medal.metric,
      unit: (METRICS[medal.metric] || {}).unit || '',
      target: medal.target,
      xp: medal.xp,
      prizeId: medal.prizeId || '',
      enabled: medal.enabled !== false,
      value: progress.value,
      pct: got ? 100 : progress.pct,
      earned: Boolean(got),
      at: got ? Number(got.at) || 0 : 0,
      grantedXp: got ? Number(got.xp) || 0 : 0,
    }
  })
  return {
    items,
    xp: Number(honors && honors.xp) || 0,
    earnedCount: items.filter(item => item.earned).length,
    totalCount: items.length,
  }
}
