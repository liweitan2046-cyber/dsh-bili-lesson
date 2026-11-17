/**
 * 缺口2成长系统纯函数：艾宾浩斯复习调度 + 成长地图/星球解锁 + 成长叙事。
 * 不依赖宿主、不读文件，selftest 直接单测；routes.js 复用这些函数派生接口数据。
 */

export const DAY_MS = 86400000
export const EBBINGHAUS_DAYS = [1, 3, 7, 15, 30]

/** 一次复习作答后的新状态，写回 mistakes.reviewed[key]。答对进一阶，答错回到第0阶。 */
export function nextReviewState(prev, correct, now = Date.now()) {
  const before = prev && typeof prev === 'object' ? prev : {}
  const stage = correct
    ? Math.min(EBBINGHAUS_DAYS.length - 1, (Number(before.stage) || 0) + 1)
    : 0
  return {
    resolved: Boolean(correct),
    stage,
    dueAt: now + EBBINGHAUS_DAYS[stage] * DAY_MS,
    tries: (Number(before.tries) || 0) + 1,
    at: now,
    lastChoice: Number.isInteger(before.lastChoice) ? before.lastChoice : -1,
  }
}

/** 到期需要复习：已答对过（resolved）且 dueAt 已过。 */
export function isDue(state, now = Date.now()) {
  if (!state || state.resolved !== true) return false
  const due = Number(state.dueAt)
  return Number.isFinite(due) && due <= now
}

/** 兼容旧数据：老的 reviewed 状态没有 stage/dueAt，按 tries 补一个保守初值。 */
export function migrateReviewState(state) {
  if (!state || typeof state !== 'object') return state
  if (Number.isFinite(Number(state.dueAt)) && Number.isFinite(Number(state.stage))) return state
  const stage = Math.max(0, Math.min(EBBINGHAUS_DAYS.length - 1, (Number(state.tries) || 1) - 1))
  return {
    ...state,
    stage,
    dueAt: (Number(state.at) || Date.now()) + EBBINGHAUS_DAYS[stage] * DAY_MS,
  }
}

/** 8 个成长星球，metric 对应 buildGrowthMap 的 stats 键。 */
export const GROWTH_STARS = [
  { id: 'launch', name: '启航星', subtitle: '看完第 1 条片', icon: 'rocket', metric: 'watch', target: 1 },
  { id: 'curious', name: '好奇星', subtitle: '答对 10 道题', icon: 'question', metric: 'correct', target: 10 },
  { id: 'steady', name: '坚持星', subtitle: '连续学习 3 天', icon: 'calendar', metric: 'streak', target: 3 },
  { id: 'explorer', name: '探索星', subtitle: '看完 10 条片', icon: 'compass', metric: 'watch', target: 10 },
  { id: 'wisdom', name: '智慧星', subtitle: '答对 50 道题', icon: 'medal', metric: 'correct', target: 50 },
  { id: 'shining', name: '恒星', subtitle: '连续学习 7 天', icon: 'star', metric: 'streak', target: 7 },
  { id: 'galaxy', name: '银河星', subtitle: '收获 5 枚勋章', icon: 'gem', metric: 'medals', target: 5 },
  { id: 'nova', name: '超新星', subtitle: '达到 Lv.5', icon: 'spark', metric: 'level', target: 5 },
]

/** 成长地图：从已学统计和勋章派生星球解锁进度与叙事时间线。 */
export function buildGrowthMap(input) {
  const src = input || {}
  const stats = src.stats && typeof src.stats === 'object' ? src.stats : {}
  const honors = src.honors && typeof src.honors === 'object' ? src.honors : {}
  const step = Math.max(1, Number(src.xpStep) || 200)
  const xp = Math.max(0, Number(honors.xp) || 0)
  const earned = Array.isArray(honors.earned) ? honors.earned : []
  const metrics = {
    watch: Math.max(0, Number(stats.watch) || 0),
    correct: Math.max(0, Number(stats.correct) || 0),
    streak: Math.max(0, Number(stats.streak) || 0),
    medals: earned.length,
    level: 1 + Math.floor(xp / step),
  }
  const stars = GROWTH_STARS.map(def => {
    const value = metrics[def.metric] || 0
    const target = Math.max(1, Number(def.target) || 1)
    const pct = Math.min(100, Math.round((value / target) * 1000) / 10)
    return {
      id: def.id, name: def.name, subtitle: def.subtitle, icon: def.icon,
      metric: def.metric, value, target, pct, unlocked: value >= target,
    }
  })
  const narrative = []
  for (const row of earned) {
    if (row && (row.name || row.id)) {
      narrative.push({ at: Number(row.at) || 0, kind: 'medal', text: '点亮勋章「' + (row.name || row.id) + '」' })
    }
  }
  for (const row of (Array.isArray(src.unlockEvents) ? src.unlockEvents : [])) {
    if (row && row.text) narrative.push({ at: Number(row.at) || 0, kind: 'star', text: String(row.text) })
  }
  narrative.sort((a, b) => a.at - b.at)
  return {
    xp,
    level: metrics.level,
    xpInLevel: xp % step,
    xpStep: step,
    stars,
    unlocked: stars.filter(s => s.unlocked).length,
    total: stars.length,
    narrative,
    stats: metrics,
  }
}
