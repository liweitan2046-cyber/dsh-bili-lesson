/**
 * 缺口3纯函数：家长规则建议、屏幕时间护眼、周报文本。
 * 无副作用、无时间依赖，便于 selftest 与前后端共用同一口径。
 */

export const ADVICE_RULES = [
  { id: 'no_watch', title: '还没开始', condition: '本周看片为 0', action: '今天从今日岛挑一条最短的开始。', threshold: 0, min: 0, max: 0, priority: 10 },
  { id: 'no_answer', title: '看了还没答', condition: '看片超过 0 条但一道题都没答', action: '陪他答一套 3 分钟的小卡，看看懂没懂。', threshold: 0, min: 0, max: 0, priority: 20 },
  { id: 'screen_over', title: '屏幕时间超了', condition: '本周有天数超过每日分钟上限', action: '今天把屏幕换成一起讲片子，休息一下眼睛。', threshold: 0, min: 0, max: 0, priority: 25 },
  { id: 'low_accuracy', title: '正确率偏低', condition: '答题正确率低于阈值', action: '去错题医院陪他把错题怪兽打一轮。', threshold: 80, min: 50, max: 95, priority: 30, unit: '%' },
  { id: 'midweek_drop', title: '后半周掉队', condition: '后半周看片少于前半周', action: '今晚固定 10 分钟一起看一条就好。', threshold: 0, min: 0, max: 0, priority: 40 },
  { id: 'new_mistakes', title: '错题堆积', condition: '本周新错题不少于阈值', action: '周末安排一次 10 分钟错题复习。', threshold: 3, min: 1, max: 20, priority: 50, unit: '道' },
  { id: 'steady', title: '节奏很稳', condition: '以上都没触发', action: '周末挑一条他最喜欢的片子，让他讲给你听。', threshold: 0, min: 0, max: 0, priority: 100, fallback: true },
]

const RULE_BY_ID = new Map(ADVICE_RULES.map(r => [r.id, r]))
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

export function normalizeParentRules(input) {
  const out = {}
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  for (const rule of ADVICE_RULES) {
    if (rule.fallback) continue
    const raw = src[rule.id]
    out[rule.id] = {
      enabled: raw ? raw.enabled !== false : true,
      threshold: clamp(Math.round(num(raw && raw.threshold, rule.threshold)), rule.min, rule.max),
    }
  }
  return out
}

export function screenTimeStatus(weekly, settings) {
  const limitMinutes = clamp(Math.round(num(settings && settings.screenLimitMinutes, 0)), 0, 720)
  const days = ((weekly && weekly.days) || []).map(d => {
    const minutes = Math.max(0, Math.round(num(d && d.minutes, 0)))
    return {
      date: String((d && d.date) || ''),
      minutes,
      over: limitMinutes > 0 && minutes > limitMinutes,
      ratio: limitMinutes > 0 ? Math.round((minutes / limitMinutes) * 1000) / 1000 : 0,
    }
  })
  const overDays = days.filter(d => d.over).length
  const totalMinutes = days.reduce((n, d) => n + d.minutes, 0)
  const level = overDays > 0 ? 'over' : (limitMinutes > 0 && days.some(d => d.ratio >= 0.8) ? 'warn' : 'ok')
  const suggestion = limitMinutes === 0
    ? '还没设每日屏幕分钟上限，可在家长设置里打开护眼提醒。'
    : overDays > 0
      ? '本周有 ' + overDays + ' 天超过每日 ' + limitMinutes + ' 分钟，今晚换成一起讲片子、早点休息眼睛。'
      : level === 'warn'
        ? '有几天接近每日 ' + limitMinutes + ' 分钟，注意中途休息眼睛。'
        : '本周屏幕时间都在每日 ' + limitMinutes + ' 分钟内，节奏不错。'
  return { limitMinutes, days, overDays, totalMinutes, level, suggestion }
}

export function evaluateAdvice(weekly, settings, screen) {
  const rules = normalizeParentRules(settings && settings.parentRules)
  const totals = (weekly && weekly.totals) || {}
  const days = (weekly && weekly.days) || []
  const watched = num(totals.watched)
  const answered = num(totals.answered)
  const accuracy = num(totals.accuracy) * 100
  const newMistakes = num(totals.newMistakes)
  const morning = days.slice(0, 3).reduce((n, d) => n + num(d && d.watched), 0)
  const latter = days.slice(4).reduce((n, d) => n + num(d && d.watched), 0)
  const overDays = screen ? num(screen.overDays) : 0
  const fired = []
  for (const rule of ADVICE_RULES) {
    if (rule.fallback) continue
    const conf = rules[rule.id]
    if (!conf || conf.enabled === false) continue
    let hit = false
    if (rule.id === 'no_watch') hit = watched === 0
    else if (rule.id === 'no_answer') hit = watched > 0 && answered === 0
    else if (rule.id === 'screen_over') hit = screen && screen.limitMinutes > 0 && overDays > 0
    else if (rule.id === 'low_accuracy') hit = answered > 0 && accuracy < conf.threshold
    else if (rule.id === 'midweek_drop') hit = latter < morning
    else if (rule.id === 'new_mistakes') hit = newMistakes >= conf.threshold
    if (!hit) continue
    fired.push({
      id: rule.id,
      title: rule.title,
      condition: rule.condition + (rule.min !== rule.max ? '（当前 ' + conf.threshold + (rule.unit || '') + '）' : ''),
      action: rule.action,
      threshold: conf.threshold,
      priority: rule.priority,
    })
  }
  if (!fired.length) {
    const rule = RULE_BY_ID.get('steady')
    fired.push({ id: rule.id, title: rule.title, condition: rule.condition, action: rule.action, threshold: 0, priority: rule.priority })
  }
  return fired.sort((a, b) => a.priority - b.priority)
}

export function buildParentBrief(weekly, settings) {
  const screen = screenTimeStatus(weekly, settings)
  const advice = evaluateAdvice(weekly, settings, screen)
  const totals = (weekly && weekly.totals) || {}
  const weekStart = String((weekly && weekly.weekStart) || '')
  const lines = [
    '星火课堂 · 本周成长周报',
    '周期：' + weekStart,
    '',
    '五个信号：',
    '· 看片 ' + num(totals.watched) + ' 条 · 答题 ' + num(totals.answered) + ' 道',
    '· 正确率 ' + Math.round(num(totals.accuracy) * 100) + '% · 连续 ' + num(totals.streak) + ' 天',
    '· 新错题 ' + num(totals.newMistakes) + ' 道 · 错题康复 ' + num(totals.resolvedMistakes) + ' 道',
    '· 新勋章 ' + num(totals.medals) + ' 枚 · 新盲盒 ' + num(totals.boxes) + ' 个',
    '· 本周屏幕时间 ' + screen.totalMinutes + ' 分钟' + (screen.limitMinutes > 0 ? '（每日上限 ' + screen.limitMinutes + ' 分钟）' : ''),
    '',
    '如果…就…建议：',
  ]
  for (const a of advice) lines.push('· ' + a.title + '：' + a.action + '  [' + a.condition + ']')
  lines.push('', '护眼提示：' + screen.suggestion, '', '数据都在本机 · 不上传、不公开。')
  return { weekStart, totals, advice, screen, text: lines.join('\n') }
}
