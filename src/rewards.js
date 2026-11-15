/**
 * 奖励：贴纸目录、加权抽奖、判分与盲盒计算。
 * 全部是纯函数（只有随机数默认走 Math.random），selftest 可以直接单测。
 */

/** 得盒门槛：答完全部题目且 score >= 80。 */
export const BOX_SCORE = 80

export const RARITY_LABEL = { common: '常见', rare: '稀有', epic: '珍稀' }

/**
 * 8 个贴纸。权重：common 5 个各 20、rare 2 个各 5、epic 1 个各 2。
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

/**
 * 小步乐园盲盒的 46 个奖品：starlight 16（常见，权重 5）、galaxy 16（稀有，3）、crown 14（珍稀，1）。
 * 盗自小程序 cloudfunctions/starcore-api/reward-engine.js 的 REWARD_TEMPLATES，名称取 shortLabel。
 */
export const PRIZES = [
  { id: 'p_star-story', name: '睡前故事', emoji: '📖', rarity: 'common', weight: 5 },
  { id: 'p_star-play-five', name: '一起玩', emoji: '🧩', rarity: 'common', weight: 5 },
  { id: 'p_star-sticker', name: '小贴纸', emoji: '🌟', rarity: 'common', weight: 5 },
  { id: 'p_star-fruit', name: '选水果', emoji: '🍎', rarity: 'common', weight: 5 },
  { id: 'p_star-song', name: '睡前歌', emoji: '🎵', rarity: 'common', weight: 5 },
  { id: 'p_star-pajamas', name: '选睡衣', emoji: '🧸', rarity: 'common', weight: 5 },
  { id: 'p_star-breakfast', name: '选早餐', emoji: '🥣', rarity: 'common', weight: 5 },
  { id: 'p_star-hug', name: '抱一抱', emoji: '🤗', rarity: 'common', weight: 5 },
  { id: 'p_star-walk', name: '选路线', emoji: '👣', rarity: 'common', weight: 5 },
  { id: 'p_star-helper', name: '小帮手', emoji: '🏅', rarity: 'common', weight: 5 },
  { id: 'p_star-music', name: '选音乐', emoji: '🎶', rarity: 'common', weight: 5 },
  { id: 'p_star-craft', name: '做手工', emoji: '✂️', rarity: 'common', weight: 5 },
  { id: 'p_star-board-game', name: '选桌游', emoji: '🎲', rarity: 'common', weight: 5 },
  { id: 'p_star-character', name: '选主角', emoji: '🦄', rarity: 'common', weight: 5 },
  { id: 'p_star-blocks', name: '搭积木', emoji: '🧱', rarity: 'common', weight: 5 },
  { id: 'p_star-bath-toy', name: '选玩具', emoji: '🫧', rarity: 'common', weight: 5 },
  { id: 'p_galaxy-ice-cream', name: '冰淇淋', emoji: '🍦', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-tv-five', name: '看电视', emoji: '📺', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-park', name: '去公园', emoji: '🌳', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-weekend', name: '周末活动', emoji: '🗓️', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-bake', name: '一起烘焙', emoji: '🧁', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-picnic', name: '去野餐', emoji: '🧺', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-library', name: '图书馆', emoji: '📚', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-ride', name: '去骑车', emoji: '🛴', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-dinner', name: '选晚餐', emoji: '🍲', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-seed', name: '种种子', emoji: '🌱', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-playground', name: '游乐场', emoji: '🛝', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-experiment', name: '小实验', emoji: '🔬', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-album', name: '照片小册', emoji: '📷', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-treasure', name: '家庭寻宝', emoji: '🗺️', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-ball', name: '一起玩球', emoji: '⚽', rarity: 'rare', weight: 3 },
  { id: 'p_galaxy-build', name: '搭大作品', emoji: '🏗️', rarity: 'rare', weight: 3 },
  { id: 'p_crown-toy', name: '小玩具', emoji: '🎁', rarity: 'epic', weight: 1 },
  { id: 'p_crown-trip', name: '亲子出游', emoji: '🚗', rarity: 'epic', weight: 1 },
  { id: 'p_crown-special', name: '特别体验', emoji: '✨', rarity: 'epic', weight: 1 },
  { id: 'p_crown-zoo', name: '动物园', emoji: '🦁', rarity: 'epic', weight: 1 },
  { id: 'p_crown-aquarium', name: '水族馆', emoji: '🐠', rarity: 'epic', weight: 1 },
  { id: 'p_crown-museum', name: '博物馆', emoji: '🏛️', rarity: 'epic', weight: 1 },
  { id: 'p_crown-theatre', name: '儿童剧', emoji: '🎭', rarity: 'epic', weight: 1 },
  { id: 'p_crown-train', name: '探索日', emoji: '🚆', rarity: 'epic', weight: 1 },
  { id: 'p_crown-camping', name: '户外一日', emoji: '⛺', rarity: 'epic', weight: 1 },
  { id: 'p_crown-sport', name: '运动体验', emoji: '🏊', rarity: 'epic', weight: 1 },
  { id: 'p_crown-workshop', name: '手作体验', emoji: '🎨', rarity: 'epic', weight: 1 },
  { id: 'p_crown-photo', name: '照片日', emoji: '📸', rarity: 'epic', weight: 1 },
  { id: 'p_crown-route', name: '一日路线', emoji: '🧭', rarity: 'epic', weight: 1 },
  { id: 'p_crown-cooking', name: '烹饪派对', emoji: '👨‍🍳', rarity: 'epic', weight: 1 },
]

export const CATALOG = [...STICKERS, ...PRIZES]

export const TOTAL_WEIGHT = CATALOG.reduce((sum, item) => sum + item.weight, 0)

/** 按权重抽一个贴纸。random 取 [0,1)，越小越靠前。 */
export function pickSticker(random = Math.random()) {
  let r = Number(random)
  if (!Number.isFinite(r) || r < 0) r = 0
  if (r >= 1) r = 1 - 1e-9
  const hit = r * TOTAL_WEIGHT
  let acc = 0
  for (const sticker of CATALOG) {
    acc += sticker.weight
    if (hit < acc) return { ...sticker }
  }
  return { ...CATALOG[CATALOG.length - 1] }
}

export function stickerById(id) {
  return CATALOG.find(item => item.id === id) || null
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
  const items = CATALOG.map(item => ({
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
