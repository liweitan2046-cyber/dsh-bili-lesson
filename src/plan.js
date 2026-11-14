/**
 * 一周计划：7 天，每天 perDay 条。
 * 自动排的规则很简单——按分类轮转，跳过失效的、本周已排的、最近三周排过的。
 */
const DAY = 86400000

export function toDate(value) {
  const text = String(value || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

export function mondayOf(value) {
  const base = toDate(value) || new Date().toISOString().slice(0, 10)
  const date = new Date(base + 'T00:00:00Z')
  const shift = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - shift * DAY).toISOString().slice(0, 10)
}

export function weekDates(weekStart) {
  const start = new Date(mondayOf(weekStart) + 'T00:00:00Z').getTime()
  const out = []
  for (let i = 0; i < 7; i += 1) out.push(new Date(start + i * DAY).toISOString().slice(0, 10))
  return out
}

export function emptyPlan(weekStart, perDay) {
  return {
    weekStart: mondayOf(weekStart),
    perDay: Math.max(1, Math.min(6, Number(perDay) || 2)),
    days: weekDates(weekStart).map(date => ({ date, videoIds: [] })),
  }
}

export function normalizePlan(input, fallbackPerDay) {
  const source = input && typeof input === 'object' ? input : {}
  const plan = emptyPlan(source.weekStart, source.perDay || fallbackPerDay)
  const days = Array.isArray(source.days) ? source.days : []
  plan.days = plan.days.map(day => {
    const found = days.find(row => row && toDate(row.date) === day.date)
    const ids = found && Array.isArray(found.videoIds) ? found.videoIds : []
    return {
      date: day.date,
      videoIds: Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean))).slice(0, plan.perDay),
    }
  })
  return plan
}

/** 分类轮转填满。alive: Map(bvid → video)，recentIds: 最近三周出现过的 bvid。 */
export function autoFill(plan, videos, recentIds) {
  const alive = videos.filter(v => v && !v.dead && v.id)
  if (!alive.length) return plan
  const buckets = new Map()
  for (const video of alive) {
    const key = video.category || '未分类'
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(video)
  }
  const order = Array.from(buckets.keys()).sort((a, b) => buckets.get(b).length - buckets.get(a).length)
  const cursor = new Map(order.map(key => [key, 0]))
  const used = new Set(recentIds || [])
  const pick = () => {
    for (let round = 0; round < order.length * 4; round += 1) {
      const key = order[round % order.length]
      const list = buckets.get(key)
      const index = cursor.get(key) || 0
      if (index >= list.length) continue
      const video = list[index]
      cursor.set(key, index + 1)
      return video
    }
    return null
  }
  const filled = { ...plan, days: plan.days.map(day => ({ date: day.date, videoIds: [...day.videoIds] })) }
  for (const day of filled.days) {
    while (day.videoIds.length < filled.perDay) {
      const video = pick()
      if (!video) break
      if (used.has(video.id) || day.videoIds.includes(video.id)) continue
      day.videoIds.push(video.id)
      used.add(video.id)
    }
  }
  return filled
}
