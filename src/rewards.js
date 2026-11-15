/**
 * 奖励：贴纸目录、加权抽奖、判分与盲盒计算。
 * 全部是纯函数（只有随机数默认走 Math.random），selftest 可以直接单测。
 */

/** 得盒门槛：答完全部题目且 score >= 80。 */
export const BOX_SCORE = 80

export const RARITY_LABEL = { common: '常见', rare: '稀有', epic: '珍稀' }

/**
 * 8 个贴纸。权重：common 5 个各 20、rare 2 个各 5、epic 1 个各 2，总权重 112。
 * 顺序固定，抽奖按顺序累加，便于用固定随机数复现结果。
 */
export const STICKERS = [
  { id: 's_rocket', name: '小火箭', emoji: '🚀', rarity: 'common', weight: 20 },
  { id: 's_star', name: '小星星', emoji: '⭐', rarity: 'common', weight: 20 },
  { id: 's_apple', name: '红苹果', emoji: '🍎', rarity: 'common', weight: 20 },
  { id: 's_balloon', name: '彩色气球', emoji: '🎈', rarity: 'common', weight: 20 },
  { id: 's_panda', name: '熊猫滚滚', emoji: '🐼', rarity: 'common', weight: 20 },
  { id: 's_rainbow', name: '彩虹桥', emoji: '🌈', rarity: 'rare', weight: 5 },
  { id: 's_dino', name: '小恐龙', emoji: '🦕', rarity: 'rare', weight: 5 },
  { id: 's_unicorn', name: '独角兽', emoji: '🦄', rarity: 'epic', weight: 2 },
]

export const TOTAL_WEIGHT = STICKERS.reduce((sum, item) => sum + item.weight, 0)

/** 按权重抽一个贴纸。random 取 [0,1)，越小越靠前。 */
export function pickSticker(random = Math.random()) {
  let r = Number(random)
  if (!Number.isFinite(r) || r < 0) r = 0
  if (r >= 1) r = 1 - 1e-9
  const hit = r * TOTAL_WEIGHT
  let acc = 0
  for (const sticker of STICKERS) {
    acc += sticker.weight
    if (hit < acc) return { ...sticker }
  }
  return { ...STICKERS[STICKERS.length - 1] }
}

export function stickerById(id) {
  return STICKERS.find(item => item.id === id) || null
}

function two(n) {
  return String(n).padStart(2, '0')
}

/** 本地日历日 YYYY-MM-DD（得盒按本地日判重，不用 UTC，免得晚上答完算到第二天）。 */
export function localDay(now = Date.now()) {
  const d = new Date(now)
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate())
}

function bad(message) {
  return Object.assign(new Error(message), { status: 400 })
}

/**
 * 校验并收集答案：answers = [{ qid, choice }]，choice 是选项下标。
 * 未知 qid、choice 越界、格式不对一律 400；同一题答两次以最后一次为准。
 */
export function collectAnswers(questions, answers) {
  if (!Array.isArray(answers)) throw bad('answers 要是数组')
  const byQid = new Map(questions.map(question => [question.id, question]))
  const picked = new Map()
  for (const raw of answers) {
    const row = raw && typeof raw === 'object' ? raw : {}
    const qid = typeof row.qid === 'string' ? row.qid.trim() : ''
    if (!qid) throw bad('有一份答案没写 qid')
    const question = byQid.get(qid)
    if (!question) throw bad('课卡里没有这道题：' + qid)
    const choice = Number(row.choice)
    if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) {
      throw bad('「' + (question.prompt || qid) + '」的选项越界')
    }
    picked.set(qid, choice)
  }
  return picked
}

/** 判分：每道题一行 { qid, choice, correct }，没答的记 choice = null。 */
export function gradeAttempt(questions, picked) {
  const rows = questions.map(question => {
    const choice = picked.has(question.id) ? picked.get(question.id) : null
    return { qid: question.id, choice, correct: choice !== null && choice === question.answer }
  })
  const total = questions.length
  const correct = rows.filter(row => row.correct).length
  const answered = rows.filter(row => row.choice !== null).length
  return { rows, total, correct, answered, score: total ? Math.round((correct / total) * 100) : 0 }
}

/** 同一 lessonId 在同一天已经给过盒？ */
export function hasBoxOn(attempts, lessonId, date) {
  return (attempts || []).some(row => row && row.lessonId === lessonId && row.date === date && row.boxGranted)
}

/** 得盒：答完全部题目 + 分数到 80 + 这套课卡今天还没给过。 */
export function boxEligible(attempts, lessonId, date, graded) {
  if (!graded || graded.answered < graded.total) return false
  if (graded.score < BOX_SCORE) return false
  return !hasBoxOn(attempts, lessonId, date)
}

/** earned = boxGranted 为真的 attempts 条数。 */
export function earnedOf(attempts) {
  return (attempts || []).filter(row => row && row.boxGranted).length
}

/** available = earned - draws.length，下限 0。 */
export function availableOf(attempts, draws) {
  const used = Array.isArray(draws) ? draws.length : 0
  return Math.max(0, earnedOf(attempts) - used)
}

/** 本次抽奖记到哪条 attempt 上：最晚一条还没被消耗的得盒记录。 */
export function nextAttemptId(attempts, draws) {
  const used = new Set((draws || []).map(row => row && row.attemptId).filter(Boolean))
  const pending = (attempts || [])
    .filter(row => row && row.boxGranted && !used.has(row.id))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
  if (pending.length) return pending[0].id
  const granted = (attempts || [])
    .filter(row => row && row.boxGranted)
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
  return granted.length ? granted[0].id : ''
}

/** GET /rewards 的响应体：收藏 = draws 聚合计数，不另存库存。 */
export function rewardView(attempts, draws) {
  const list = Array.isArray(draws) ? draws : []
  const counts = {}
  for (const row of list) {
    if (!row || !row.itemId) continue
    counts[row.itemId] = (counts[row.itemId] || 0) + 1
  }
  const items = STICKERS.map(item => ({
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    rarity: item.rarity,
    count: counts[item.id] || 0,
  }))
  const earned = earnedOf(attempts)
  const used = list.length
  return {
    items,
    draws: list.slice().sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0)),
    earned,
    used,
    available: Math.max(0, earned - used),
  }
}
