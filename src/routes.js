/**
 * /bili-lesson/* 的 HTTP 路由。
 * 每个请求先过 connection 的 Host/Origin 与登录凭证检查（照抄 dsh-wanfeng-studio/src/routes.js:152-176）。
 * 数据全在本机 JSON 里，接口只做增删改查与一次 B 站校验，不落任何远端。
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchVideo, parseBvid } from './bili.js'
import { autoFill, mondayOf, normalizePlan, toDate, weekDates } from './plan.js'
import { normalizeLesson } from './lesson.js'
import { suggestLessonDraft } from './draft.js'
import { buildContentPack, applyContentPack } from './contentpack.js'
import { DEFAULT_SETTINGS, Store } from './store.js'
import {
  availableOf,
  boxEligible,
  collectAnswers,
  localDay,
  gradeAttempt,
  nextAttemptId,
  pickSticker,
  rewardView,
} from './rewards.js'
import { RARITY_KEYS, RARITY_LABEL, RARITY_WEIGHT, countUsage, defaultPool, drawable, normalizePool, pickPrize, poolOf, prizeView } from './prizes.js'
import { medalView, mergeMedals, normalizeMedals, progressOf, studyStats } from './medals.js'

export const PREFIX = '/bili-lesson'
const MAX_JSON = 1_000_000
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const ASSETS = { 'deck-bg.jpg': 'image/jpeg' }

/** 学习闭环新增的两个数据文件，沿用 Store 的 tmp + rename 与串行写。 */
const LEDGER_FILES = { attempts: 'attempts.json', rewards: 'rewards.json', honors: 'honors.json', mistakes: 'mistakes.json' }

class LedgerStore extends Store {
  path(name) {
    return join(this.dir, LEDGER_FILES[name])
  }
}

function newId(prefix) {
  return prefix + randomUUID().replace(/-/g, '').slice(0, 8)
}

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_JSON) throw Object.assign(new Error('请求内容太大'), { status: 413 })
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function cleanVideo(row) {
  return {
    id: row.id,
    bvid: row.bvid,
    title: row.title,
    cover: row.cover,
    duration: Number(row.duration) || 0,
    owner: row.owner || '',
    category: row.category || '未分类',
    minAge: Number(row.minAge) || 3,
    reason: row.reason || '',
    caution: row.caution || '',
    note: row.note || '',
    dead: Boolean(row.dead),
    addedAt: Number(row.addedAt) || Date.now(),
    checkedAt: Number(row.checkedAt) || 0,
  }
}

export class Routes {
  constructor(ctx, store) {
    this.ctx = ctx
    this.store = store
    this.ledger = new LedgerStore(store.dir)
  }

  /** attempts.json 里的数组（读失败当空）。 */
  async attempts() {
    const data = await this.ledger.read('attempts')
    return data && Array.isArray(data.attempts) ? data.attempts : []
  }

  /** rewards.json 里的抽奖记录（读失败当空）。 */
  async draws() {
    const data = await this.ledger.read('rewards')
    return data && Array.isArray(data.draws) ? data.draws : []
  }

  /** 奖品池（没存过就用默认 54 格目录）。 */
  async prizePool() {
    return poolOf(await this.store.read('prizes'))
  }

  async prizeItems() {
    return (await this.prizePool()).items
  }

  /** 勋章配置：内置 8 枚 + 家长改过的阈值与奖励。 */
  async medalConfig() {
    const saved = await this.store.read('medals')
    const ids = new Set((await this.prizeItems()).map(item => item.id))
    return mergeMedals(saved, ids)
  }

  /** honors.json：星火点数与已得勋章。 */
  async honors() {
    const data = await this.ledger.read('honors')
    return {
      xp: Number(data && data.xp) || 0,
      earned: data && Array.isArray(data.earned) ? data.earned : [],
    }
  }

  /** 抽中记录 + 勋章赠送，都算奖品消耗（[{ itemId, date }]）。 */
  prizeEvents(draws, honors) {
    const rows = []
    for (const row of draws || []) {
      if (row && row.itemId) rows.push({ itemId: row.itemId, date: localDay(Number(row.at) || 0) })
    }
    for (const row of (honors && honors.earned) || []) {
      if (row && row.prizeId) rows.push({ itemId: row.prizeId, date: localDay(Number(row.at) || 0) })
    }
    return rows
  }

  async studyStats() {
    const [videos, watch, attempts] = await Promise.all([
      this.store.read('videos'),
      this.store.read('watch'),
      this.attempts(),
    ])
    return studyStats({
      videos: Object.values(videos || {}).map(cleanVideo),
      watch: Array.isArray(watch) ? watch : [],
      attempts,
    })
  }

  /** 家长驾驶舱：按周聚合观看/答题/错题/勋章/盲盒，只读，不写任何 ledger。 */
  async familyWeekly(weekStart) {
    const dates = weekDates(weekStart)
    const inWeek = new Set(dates)
    const day = date => ({ date, watched: 0, correct: 0, answered: 0, minutes: 0 })
    const days = dates.map(day)
    const byDate = new Map(days.map(row => [row.date, row]))

    const [videos, watch, attempts, mistakes, honors, rewards] = await Promise.all([
      this.store.read('videos'),
      this.store.read('watch'),
      this.attempts(),
      this.ledger.read('mistakes'),
      this.honors(),
      this.ledger.read('rewards'),
    ])

    const videoById = new Map()
    for (const row of Object.values(videos || {})) {
      if (row && row.id) videoById.set(row.id, row)
    }

    const doneDays = new Set()
    const categories = new Map()
    for (const row of Array.isArray(watch) ? watch : []) {
      if (!row || row.done !== true) continue
      doneDays.add(row.date)
      const bucket = byDate.get(row.date)
      if (bucket) bucket.watched += 1
      const video = videoById.get(row.videoId)
      if (bucket && video) bucket.minutes += Math.round((Number(video.duration) || 0) / 60)
      if (bucket && video) {
        const name = text(video.category) || '未分类'
        categories.set(name, (categories.get(name) || 0) + 1)
      }
    }

    for (const row of attempts) {
      if (!row) continue
      const bucket = byDate.get(localDay(Number(row.createdAt) || 0))
      if (!bucket) continue
      bucket.correct += Number(row.correct) || 0
      const answers = Array.isArray(row.answers) ? row.answers.length : (Number(row.total) || 0)
      bucket.answered += answers
    }

    const totals = {
      watched: 0,
      correct: 0,
      answered: 0,
      minutes: 0,
      accuracy: 0,
      streak: 0,
      newMistakes: 0,
      resolvedMistakes: 0,
      medals: 0,
      boxes: 0,
    }
    for (const row of days) {
      totals.watched += row.watched
      totals.correct += row.correct
      totals.answered += row.answered
      totals.minutes += row.minutes
    }
    totals.accuracy = totals.answered ? Math.round((totals.correct / totals.answered) * 1000) / 1000 : 0

    let cursor = localDay()
    if (!doneDays.has(cursor)) {
      const d = new Date(cursor + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - 1)
      cursor = d.toISOString().slice(0, 10)
    }
    while (doneDays.has(cursor)) {
      totals.streak += 1
      const d = new Date(cursor + 'T00:00:00Z')
      d.setUTCDate(d.getUTCDate() - 1)
      cursor = d.toISOString().slice(0, 10)
    }

    const reviewed = mistakes && mistakes.reviewed && typeof mistakes.reviewed === 'object' ? mistakes.reviewed : {}
    for (const state of Object.values(reviewed)) {
      if (state && state.resolved && inWeek.has(localDay(Number(state.at) || 0))) totals.resolvedMistakes += 1
    }

    // 错误题派生口径与 GET /mistakes 一致：attempt.answers 中 correct === false 的题，按 key 去重取最近一次。
    const wrongLatest = new Map()
    for (const attempt of attempts.slice().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))) {
      if (!attempt || !attempt.lessonId) continue
      for (const row of Array.isArray(attempt.answers) ? attempt.answers : []) {
        if (!row || row.correct !== false) continue
        const key = attempt.lessonId + ':' + row.qid
        if (!wrongLatest.has(key)) wrongLatest.set(key, Number(attempt.createdAt) || 0)
      }
    }
    for (const stamp of wrongLatest.values()) {
      if (inWeek.has(localDay(stamp))) totals.newMistakes += 1
    }

    for (const row of (honors && honors.earned) || []) {
      if (row && inWeek.has(localDay(Number(row.at) || 0))) totals.medals += 1
    }
    for (const row of (rewards && Array.isArray(rewards.draws) ? rewards.draws : [])) {
      if (row && inWeek.has(localDay(Number(row.at) || 0))) totals.boxes += 1
    }

    return {
      weekStart,
      days,
      totals,
      categories: Array.from(categories, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }
  }

  /**
   * 结算勋章：条件满足且还没得过就记一条 honors，并累加星火。
   * 幂等：同一枚只记一次。
   */
  async settleMedals() {
    const config = await this.medalConfig()
    const stats = await this.studyStats()
    const current = await this.honors()
    const had = new Set(current.earned.map(row => row && row.id).filter(Boolean))
    const fresh = config.items
      .filter(medal => medal.enabled !== false && !had.has(medal.id))
      .filter(medal => progressOf(medal, stats).earned)
    if (!fresh.length) return current
    return this.ledger.update('honors', data => {
      const next = {
        xp: Number(data && data.xp) || 0,
        earned: data && Array.isArray(data.earned) ? data.earned.slice() : [],
      }
      const seen = new Set(next.earned.map(row => row && row.id).filter(Boolean))
      let changed = false
      for (const medal of fresh) {
        if (seen.has(medal.id)) continue
        seen.add(medal.id)
        next.xp += Number(medal.xp) || 0
        next.earned.push({ id: medal.id, at: Date.now(), xp: Number(medal.xp) || 0, prizeId: medal.prizeId || '' })
        changed = true
      }
      return changed ? next : undefined
    })
  }

  rejection(req) {
    const connection = this.ctx.get('connection')
    if (typeof connection?.requestRejection !== 'function') return 403
    return connection.requestRejection({ headers: req.headers })
  }

  async handle(req, res) {
    const rejection = this.rejection(req)
    if (rejection) {
      json(res, rejection, { error: '未授权' })
      return
    }
    const url = new URL(req.url || '/', 'http://localhost')
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : url.pathname
    try {
      await this.dispatch(path.replace(/^\/+/, ''), url, req, res)
    } catch (error) {
      if (res.headersSent) {
        res.end()
        return
      }
      json(res, error?.status || 500, { error: error?.message || String(error) })
    }
  }

  async settings() {
    const saved = await this.store.read('settings')
    return { ...DEFAULT_SETTINGS, ...(saved || {}) }
  }

  async publicSettings() {
    const { parentPin, ...rest } = await this.settings()
    return { ...rest, parentPinSet: Boolean(parentPin) }
  }

  async dispatch(route, url, req, res) {
    const method = (req.method || 'GET').toUpperCase()
    const q = Object.fromEntries(url.searchParams.entries())
    const parts = route.split('/').filter(Boolean)
    const head = parts[0] || ''
    const tail = parts[1] || ''
    const settings = await this.settings()

    if (head === 'assets') {
      if (method !== 'GET') return json(res, 405, { error: '资源只支持 GET' })
      const type = ASSETS[tail]
      if (!type) return json(res, 404, { error: '没有这个资源' })
      const buf = await readFile(join(ASSET_DIR, tail))
      res.statusCode = 200
      res.setHeader('content-type', type)
      res.setHeader('cache-control', 'public, max-age=86400')
      res.setHeader('content-length', String(buf.length))
      res.end(buf)
      return
    }

    if (head === 'health') {
      const [videos, lessons] = await Promise.all([this.store.read('videos'), this.store.read('lessons')])
      return json(res, 200, {
        ok: true,
        videos: Object.keys(videos).length,
        lessons: lessons.length,
        dataDir: this.store.dir,
        settings,
      })
    }

    /* ---------------- 片库 ---------------- */

    if (head === 'videos' && !tail) {
      if (method === 'GET') {
        const all = Object.values(await this.store.read('videos')).map(cleanVideo)
        const keyword = text(q.q).toLowerCase()
        const category = text(q.category)
        const minAge = Number(q.minAge) || 0
        const includeDead = q.includeDead === '1' || q.includeDead === 'true'
        const items = all
          .filter(row => (includeDead ? true : !row.dead))
          .filter(row => (category ? row.category === category : true))
          .filter(row => (minAge ? row.minAge <= minAge : true))
          .filter(row => {
            if (!keyword) return true
            return [row.title, row.owner, row.category, row.reason, row.bvid]
              .join(' ')
              .toLowerCase()
              .includes(keyword)
          })
          .sort((a, b) => (a.minAge - b.minAge) || (b.addedAt - a.addedAt))
        return json(res, 200, {
          items,
          categories: Array.from(new Set(all.map(row => row.category))).sort(),
          stats: { total: all.length, dead: all.filter(row => row.dead).length },
        })
      }
      if (method === 'POST') {
        const body = await readJson(req)
        const bvid = parseBvid(body.bvid || body.url || '')
        if (!bvid) throw Object.assign(new Error('没认出 BV 号：粘整条链接也行'), { status: 400 })
        const result = await fetchVideo(bvid)
        if (!result.item) throw Object.assign(new Error('B 站说这条视频不可用：' + (result.message || '')), { status: 404 })
        const saved = await this.store.update('videos', current => {
          const existed = current[bvid]
          const row = cleanVideo({
            ...(existed || {}),
            ...result.item,
            id: bvid,
            category: text(body.category) || (existed && existed.category) || '未分类',
            minAge: Number(body.minAge) || (existed && existed.minAge) || settings.maxAge || 3,
            reason: text(body.reason) || (existed && existed.reason) || '',
            caution: text(body.caution) || (existed && existed.caution) || '',
            note: text(body.note) || (existed && existed.note) || '',
            dead: false,
            addedAt: (existed && existed.addedAt) || Date.now(),
            checkedAt: Date.now(),
          })
          return { ...current, [bvid]: row }
        })
        return json(res, 200, { item: cleanVideo(saved[bvid]) })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    if (head === 'videos' && tail === 'refresh' && method === 'POST') {
      const ALL_AT_ONCE = 30
      const all = Object.values(await this.store.read('videos'))
      const batch = all.slice(0, ALL_AT_ONCE)
      const dead = []
      let checked = 0
      for (const row of batch) {
        try {
          const result = await fetchVideo(row.bvid)
          checked += 1
          await this.store.update('videos', current => {
            const target = current[row.bvid]
            if (!target) return undefined
            if (result.item) {
              return {
                ...current,
                [row.bvid]: cleanVideo({
                  ...target,
                  title: result.item.title || target.title,
                  cover: result.item.cover || target.cover,
                  duration: result.item.duration || target.duration,
                  owner: result.item.owner || target.owner,
                  dead: false,
                  checkedAt: Date.now(),
                }),
              }
            }
            return { ...current, [row.bvid]: cleanVideo({ ...target, dead: true, checkedAt: Date.now() }) }
          })
          if (!result.item) dead.push(row.bvid)
        } catch {
          checked += 1
        }
        await sleep(350)
      }
      return json(res, 200, { checked, dead, remaining: Math.max(0, all.length - batch.length) })
    }

    if (head === 'videos' && tail && method === 'PATCH') {
      const body = await readJson(req)
      const updated = await this.store.update('videos', current => {
        const target = current[tail]
        if (!target) return undefined
        const row = cleanVideo({
          ...target,
          title: text(body.title) || target.title,
          category: text(body.category) || target.category,
          minAge: Number(body.minAge) || target.minAge,
          reason: typeof body.reason === 'string' ? body.reason.trim() : target.reason,
          caution: typeof body.caution === 'string' ? body.caution.trim() : target.caution,
          note: typeof body.note === 'string' ? body.note.trim() : target.note,
        })
        return { ...current, [tail]: row }
      })
      if (!updated[tail]) throw Object.assign(new Error('片库里没有这条'), { status: 404 })
      return json(res, 200, { item: cleanVideo(updated[tail]) })
    }

    if (head === 'videos' && tail && method === 'DELETE') {
      await this.store.update('videos', current => {
        const next = { ...current }
        delete next[tail]
        return next
      })
      await this.store.update('plans', current => {
        const next = {}
        for (const [week, plan] of Object.entries(current || {})) {
          next[week] = {
            ...plan,
            days: (plan.days || []).map(day => ({ ...day, videoIds: (day.videoIds || []).filter(id => id !== tail) })),
          }
        }
        return next
      })
      await this.store.update('watch', current => {
        const list = Array.isArray(current) ? current : []
        const next = list.filter(row => row.videoId !== tail)
        return next.length === list.length ? undefined : next
      })
      return json(res, 200, { ok: true })
    }

    /* ---------------- 一周计划 ---------------- */

    if (head === 'plan' && !tail) {
      if (method === 'GET') {
        const weekStart = mondayOf(q.weekStart)
        const plans = await this.store.read('plans')
        const videos = await this.store.read('videos')
        const plan = normalizePlan(plans[weekStart], settings.perDay)
        const byId = {}
        for (const day of plan.days) {
          for (const id of day.videoIds) {
            if (videos[id]) byId[id] = cleanVideo(videos[id])
          }
        }
        return json(res, 200, { plan, byId })
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        const plan = normalizePlan(body, settings.perDay)
        await this.store.update('plans', current => ({ ...current, [plan.weekStart]: plan }))
        return json(res, 200, { plan })
      }
      if (method === 'POST') {
        throw Object.assign(new Error('保存计划请用 PUT /plan'), { status: 405 })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    if (head === 'plan' && tail === 'auto' && method === 'POST') {
      const body = await readJson(req)
      const weekStart = mondayOf(body.weekStart)
      const perDay = Math.max(1, Math.min(6, Number(body.perDay) || settings.perDay || 2))
      const plans = await this.store.read('plans')
      const videos = Object.keys(await this.store.read('videos')).length
        ? Object.values(await this.store.read('videos')).map(cleanVideo)
        : []
      const horizon = Date.now() - 21 * 86400000
      const recent = new Set()
      for (const [week, plan] of Object.entries(plans || {})) {
        if (week === weekStart) continue
        const stamp = new Date(week + 'T00:00:00Z').getTime()
        if (Number.isFinite(stamp) && stamp < horizon) continue
        for (const day of plan.days || []) for (const id of day.videoIds || []) recent.add(id)
      }
      const base = normalizePlan({ ...(plans[weekStart] || {}), weekStart, perDay }, perDay)
      const plan = autoFill(base, videos, recent)
      await this.store.update('plans', current => ({ ...current, [plan.weekStart]: plan }))
      return json(res, 200, { plan })
    }

    /* ---------------- 观看记录 ---------------- */

    if (head === 'watch') {
      if (method === 'GET') {
        const from = toDate(q.from)
        const to = toDate(q.to)
        const records = (await this.store.read('watch')) || []
        const items = records
          .filter(row => (from ? row.date >= from : true))
          .filter(row => (to ? row.date <= to : true))
          .sort((a, b) => (a.date === b.date ? b.at - a.at : a.date < b.date ? 1 : -1))
        return json(res, 200, { records: items, summary: summarize(items) })
      }
      if (method === 'POST') {
        const body = await readJson(req)
        const videoId = text(body.videoId)
        const date = toDate(body.date) || new Date().toISOString().slice(0, 10)
        if (!videoId) throw Object.assign(new Error('缺少 videoId'), { status: 400 })
        const records = await this.store.update('watch', current => {
          const list = Array.isArray(current) ? [...current] : []
          const index = list.findIndex(row => row.videoId === videoId && row.date === date)
          const row = { videoId, date, done: Boolean(body.done), at: Date.now() }
          if (index >= 0) list[index] = row
          else list.push(row)
          return list
        })
        return json(res, 200, { records, summary: summarize(records) })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    /* ---------------- 答题（学习闭环） ---------------- */

    if (head === 'lessons' && parts[2] === 'attempt') {
      if (method !== 'POST') throw Object.assign(new Error('答题请用 POST'), { status: 405 })
      const lessons = await this.store.read('lessons')
      const lesson = (Array.isArray(lessons) ? lessons : []).find(row => row && row.id === parts[1])
      if (!lesson) throw Object.assign(new Error('没有这张课卡'), { status: 404 })
      const body = await readJson(req)
      const picked = collectAnswers(lesson.questions, body.answers)
      const date = localDay()
      const graded = gradeAttempt(lesson.questions, picked)
      let record = null
      const saved = await this.ledger.update('attempts', current => {
        const list = current && Array.isArray(current.attempts) ? current.attempts.slice() : []
        record = {
          id: newId('at_'),
          lessonId: lesson.id,
          videoId: lesson.videoId,
          date,
          answers: graded.rows,
          correct: graded.correct,
          total: graded.total,
          score: graded.score,
          boxGranted: boxEligible(list, lesson.id, date, graded),
          createdAt: Date.now(),
        }
        list.push(record)
        return { attempts: list }
      })
      const attempts = saved && Array.isArray(saved.attempts) ? saved.attempts : []
      return json(res, 200, {
        ok: true,
        attempt: record,
        available: availableOf(attempts, await this.draws()),
        newBox: record.boxGranted,
      })
    }

    /* ---------------- 课卡草稿建议 ---------------- */

    if (head === 'lessons' && tail === 'draft') {
      if (method !== 'GET') throw Object.assign(new Error('课卡草稿请用 GET'), { status: 405 })
      const videoId = text(q.videoId)
      if (!videoId) throw Object.assign(new Error('缺少 videoId'), { status: 400 })
      const videos = await this.store.read('videos')
      const video = videos && videos[videoId]
      if (!video) throw Object.assign(new Error('片库里没有这条'), { status: 404 })
      const suggestion = suggestLessonDraft({
        title: video.title,
        desc: video.reason || video.note || '',
        owner: video.owner,
        category: video.category,
        videoId,
      })
      return json(res, 200, {
        item: {
          videoId,
          topic: suggestion.topic,
          questions: Array.isArray(suggestion.questions) ? suggestion.questions : [],
        },
      })
    }

    /* ---------------- 课卡 ---------------- */

    if (head === 'lessons') {
      if (method === 'GET') {
        const items = (await this.store.read('lessons')) || []
        const filtered = tail ? items.filter(row => row.videoId === tail) : items
        return json(res, 200, { items: filtered.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)) })
      }
      if (method === 'POST') {
        const body = await readJson(req)
        const lesson = normalizeLesson(body)
        // 一条视频只留一张课卡：面板按 videoId 找已有课卡，重复保存＝覆盖那张
        const saved = await this.store.update('lessons', current => {
          const list = (Array.isArray(current) ? current : []).filter(row => row.videoId !== lesson.videoId)
          list.unshift(lesson)
          return list
        })
        return json(res, 200, { item: saved.find(row => row.id === lesson.id) || lesson })
      }
      if (tail && method === 'PATCH') {
        const body = await readJson(req)
        let result = null
        await this.store.update('lessons', current => {
          const list = Array.isArray(current) ? [...current] : []
          const index = list.findIndex(row => row.id === tail)
          if (index < 0) return undefined
          const merged = normalizeLesson({ ...list[index], ...body, id: tail })
          list[index] = { ...merged, createdAt: list[index].createdAt }
          result = list[index]
          return list
        })
        if (!result) throw Object.assign(new Error('没有这张课卡'), { status: 404 })
        return json(res, 200, { item: result })
      }
      if (tail && method === 'DELETE') {
        await this.store.update('lessons', current => (Array.isArray(current) ? current.filter(row => row.id !== tail) : []))
        return json(res, 200, { ok: true })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    /* ---------------- 草稿建议与内容包 ---------------- */

    if (head === 'content-pack' && tail === 'export') {
      if (method !== 'POST') throw Object.assign(new Error('导出内容包请用 POST'), { status: 405 })
      const body = await readJson(req)
      return json(res, 200, await buildContentPack(this.store, body))
    }

    if (head === 'content-pack' && tail === 'import') {
      if (method !== 'POST') throw Object.assign(new Error('导入内容包请用 POST'), { status: 405 })
      const body = await readJson(req)
      const result = await applyContentPack(this.store, body)
      return json(res, 200, { ok: true, ...result })
    }

    /* ---------------- 奖励（学习闭环） ---------------- */

    if (head === 'rewards' && !tail) {
      if (method === 'GET') {
        const honors = await this.settleMedals()
        const weekStart = mondayOf(localDay())
        const [attempts, draws, items, config] = await Promise.all([
          this.attempts(),
          this.draws(),
          this.prizeItems(),
          this.medalConfig(),
        ])
        const usage = countUsage(this.prizeEvents(draws, honors), weekStart)
        const view = rewardView(attempts, draws)
        const counts = {}
        for (const row of view.draws) if (row.itemId) counts[row.itemId] = (counts[row.itemId] || 0) + 1
        const pool = prizeView(items, usage, weekStart).map(row => ({
          ...row,
          count: row.used,
          drawn: counts[row.id] || 0,
        }))
        const limit = Number(settings.weeklyBoxLimit) || 0
        const weekDraws = (draws || []).filter(row => localDay(Number(row.at) || 0) >= weekStart).length
        return json(res, 200, {
          ...view,
          items: pool,
          medals: medalView(config, await this.studyStats(), honors),
          xpBonus: honors.xp,
          limits: { weeklyBoxLimit: limit, weekDraws, weeklyRemaining: limit ? Math.max(0, limit - weekDraws) : null },
        })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    if (head === 'rewards' && tail === 'draw') {
      if (method !== 'POST') throw Object.assign(new Error('抽盒请用 POST'), { status: 405 })
      const attempts = await this.attempts()
      const honors = await this.settleMedals()
      const items = await this.prizeItems()
      const weekStart = mondayOf(localDay())
      const limit = Number(settings.weeklyBoxLimit) || 0
      let refusal = ''
      let drawn = null
      const saved = await this.ledger.update('rewards', current => {
        const list = current && Array.isArray(current.draws) ? current.draws.slice() : []
        if (availableOf(attempts, list) <= 0) {
          refusal = '没有可抽的盲盒了'
          return undefined
        }
        const weekDraws = list.filter(row => localDay(Number(row.at) || 0) >= weekStart).length
        if (limit > 0 && weekDraws >= limit) {
          refusal = '本周的抽盒次数已经用完（' + weekDraws + '/' + limit + '）'
          return undefined
        }
        const usage = countUsage(this.prizeEvents(list, honors), weekStart)
        const pool = drawable(items, usage)
        if (!pool.length) {
          refusal = '奖品池里没有可抽的奖品了：都被抽完或本周到上限了'
          return undefined
        }
        const item = pickPrize(pool)
        const draw = {
          id: newId('dr_'),
          at: Date.now(),
          attemptId: nextAttemptId(attempts, list),
          itemId: item.id,
          rarity: item.rarity,
        }
        list.push(draw)
        drawn = { item, draw }
        return { draws: list }
      })
      if (refusal) return json(res, 409, { ok: false, error: refusal })
      const draws = saved && Array.isArray(saved.draws) ? saved.draws : []
      const weekDraws = draws.filter(row => localDay(Number(row.at) || 0) >= weekStart).length
      return json(res, 200, {
        ok: true,
        item: drawn.item,
        draw: drawn.draw,
        available: availableOf(attempts, draws),
        limits: { weeklyBoxLimit: limit, weekDraws, weeklyRemaining: limit ? Math.max(0, limit - weekDraws) : null },
      })
    }

    /* ---------------- 奖品池（家长设置） ---------------- */

    if (head === 'prizes' && !tail) {
      const weekStart = mondayOf(localDay())
      if (method === 'GET') {
        const [items, draws, honors] = await Promise.all([this.prizeItems(), this.draws(), this.honors()])
        const usage = countUsage(this.prizeEvents(draws, honors), weekStart)
        const rows = prizeView(items, usage, weekStart)
        const limit = Number(settings.weeklyBoxLimit) || 0
        const weekDraws = (draws || []).filter(row => localDay(Number(row.at) || 0) >= weekStart).length
        return json(res, 200, {
          items: rows,
          rarities: RARITY_KEYS.map(key => ({ key, label: RARITY_LABEL[key], weight: RARITY_WEIGHT[key] })),
          limits: { weeklyBoxLimit: limit, weekDraws, weeklyRemaining: limit ? Math.max(0, limit - weekDraws) : null },
          stats: {
            total: rows.length,
            enabled: rows.filter(row => row.enabled).length,
            drawable: drawable(items, usage).length,
          },
        })
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        const saved = await this.store.write('prizes', normalizePool(body.items))
        return json(res, 200, { ok: true, items: saved.items })
      }
      if (method === 'POST') {
        const body = await readJson(req)
        if (text(body.action) === 'reset') {
          const saved = await this.store.write('prizes', { version: 1, items: defaultPool() })
          return json(res, 200, { ok: true, items: saved.items })
        }
        throw Object.assign(new Error('只认 action: reset'), { status: 400 })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    /* ---------------- 勋章与规则（家长设置） ---------------- */

    if (head === 'medals' && !tail) {
      if (method === 'GET') {
        const [config, items] = await Promise.all([this.medalConfig(), this.prizeItems()])
        const honors = await this.settleMedals()
        const stats = await this.studyStats()
        const view = medalView(config, stats, honors)
        const names = {}
        const emojis = {}
        for (const item of items) {
          names[item.id] = item.name
          emojis[item.id] = item.emoji
        }
        return json(res, 200, {
          ...view,
          items: view.items.map(row => ({
            ...row,
            prizeName: row.prizeId ? (names[row.prizeId] || '') : '',
            prizeEmoji: row.prizeId ? (emojis[row.prizeId] || '') : '',
          })),
          stats,
          prizes: items.map(item => ({ id: item.id, name: item.name, emoji: item.emoji, rarity: item.rarity })),
        })
      }
      if (method === 'PUT') {
        const body = await readJson(req)
        const ids = new Set((await this.prizeItems()).map(item => item.id))
        const saved = await this.store.write('medals', normalizeMedals(body.items, ids))
        const honors = await this.settleMedals()
        const stats = await this.studyStats()
        return json(res, 200, { ok: true, ...medalView(saved, stats, honors) })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    /* ---------------- 设置 ---------------- */

    if (head === 'settings') {
      if (tail === 'pin') {
        if (method !== 'POST') throw Object.assign(new Error('不支持的方法'), { status: 405 })
        const body = await readJson(req)
        const current = await this.settings()
        const action = String(body.action || 'verify')
        if (action === 'verify') return json(res, 200, { ok: pinMatches(current.parentPin, body.pin) })
        if (action === 'set') {
          const pin = String(body.pin || '').trim()
          if (!/^\d{4}$/.test(pin)) throw Object.assign(new Error('PIN 必须是 4 位数字'), { status: 400 })
          if (current.parentPin && !pinMatches(current.parentPin, body.currentPin)) {
            throw Object.assign(new Error('当前 PIN 不正确'), { status: 400 })
          }
          const salt = randomBytes(8).toString('hex')
          const saved = await this.store.update('settings', (s) => ({ ...s, parentPin: salt + ':' + pinHash(pin, salt) }))
          return json(res, 200, { ok: true, parentPinSet: Boolean(saved.parentPin) })
        }
        if (action === 'clear') {
          if (current.parentPin && !pinMatches(current.parentPin, body.currentPin)) {
            throw Object.assign(new Error('当前 PIN 不正确'), { status: 400 })
          }
          const saved = await this.store.update('settings', (s) => ({ ...s, parentPin: '' }))
          return json(res, 200, { ok: true, parentPinSet: Boolean(saved.parentPin) })
        }
        throw Object.assign(new Error('未知的 PIN 操作'), { status: 400 })
      }
      if (method === 'GET') return json(res, 200, await this.publicSettings())
      if (method === 'PUT') {
        const body = await readJson(req)
        const saved = await this.store.update('settings', current => ({
          ...current,
          parentPin: current.parentPin || '',
          perDay: Math.max(1, Math.min(6, Number(body.perDay) || current.perDay || 2)),
          maxAge: Math.max(1, Math.min(12, Number(body.maxAge) || current.maxAge || 6)),
          embedPlay: typeof body.embedPlay === 'boolean' ? body.embedPlay : (current.embedPlay !== false),
          weeklyBoxLimit: body.weeklyBoxLimit === undefined
            ? (Number(current.weeklyBoxLimit) || 0)
            : Math.max(0, Math.min(20, Math.round(Number(body.weeklyBoxLimit) || 0))),
        }))
        const { parentPin, ...rest } = saved
        return json(res, 200, { ...rest, parentPinSet: Boolean(parentPin) })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    /* ---------------- 错题本 ---------------- */

    if (head === 'mistakes') {
      if (tail === 'answer') {
        if (method !== 'POST') throw Object.assign(new Error('答题请用 POST'), { status: 405 })
        const body = await readJson(req)
        const key = text(body.key)
        const cut = key.indexOf(':')
        if (cut <= 0) throw Object.assign(new Error('缺少 lessonId:qid 形式的 key'), { status: 400 })
        const lessonId = key.slice(0, cut)
        const qid = key.slice(cut + 1)
        const lessons = await this.store.read('lessons')
        const lesson = (Array.isArray(lessons) ? lessons : []).find(row => row && row.id === lessonId)
        const question = lesson ? (lesson.questions || []).find(row => row && row.id === qid) : null
        if (!question) throw Object.assign(new Error('这道题已经不在课卡里了'), { status: 404 })
        const options = Array.isArray(question.options) ? question.options : []
        const choice = Number(body.choice)
        if (!Number.isInteger(choice) || choice < 0 || choice >= options.length) {
          throw Object.assign(new Error('选项越界'), { status: 400 })
        }
        const correct = choice === Number(question.answer)
        const saved = await this.ledger.update('mistakes', current => {
          const reviewed = current && current.reviewed && typeof current.reviewed === 'object' ? { ...current.reviewed } : {}
          const prev = reviewed[key] || {}
          reviewed[key] = {
            resolved: correct,
            tries: (Number(prev.tries) || 0) + 1,
            lastChoice: choice,
            at: Date.now(),
          }
          return { reviewed }
        })
        const state = saved && saved.reviewed ? saved.reviewed[key] : null
        return json(res, 200, {
          ok: true,
          correct,
          answer: Number(question.answer),
          resolved: Boolean(state && state.resolved),
          tries: state ? Number(state.tries) || 1 : 1,
        })
      }
      if (method === 'GET') {
        const [attempts, lessons, videos, ledger] = await Promise.all([
          this.attempts(),
          this.store.read('lessons'),
          this.store.read('videos'),
          this.ledger.read('mistakes'),
        ])
        const reviewed = ledger && ledger.reviewed && typeof ledger.reviewed === 'object' ? ledger.reviewed : {}
        const lessonById = new Map()
        for (const row of Array.isArray(lessons) ? lessons : []) {
          if (row && row.id) lessonById.set(row.id, row)
        }
        const videoOf = (id) => {
          if (!id) return null
          if (Array.isArray(videos)) return videos.find(row => row && row.id === id) || null
          return (videos && videos[id]) || null
        }
        const map = new Map()
        const ordered = attempts.slice().sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
        for (const attempt of ordered) {
          if (!attempt) continue
          const lesson = lessonById.get(attempt.lessonId)
          for (const row of Array.isArray(attempt.answers) ? attempt.answers : []) {
            if (!row || row.correct !== false) continue
            const key = attempt.lessonId + ':' + row.qid
            const seen = map.get(key)
            if (seen) {
              seen.wrongCount += 1
              continue
            }
            const question = lesson ? (lesson.questions || []).find(item => item && item.id === row.qid) : null
            const video = videoOf(attempt.videoId || (lesson && lesson.videoId))
            const state = reviewed[key]
            map.set(key, {
              key,
              qid: row.qid,
              lessonId: attempt.lessonId,
              videoId: attempt.videoId || (lesson && lesson.videoId) || '',
              videoTitle: (video && video.title) || (lesson && lesson.title) || '（这条片子已不在片库）',
              category: (video && video.category) || '',
              prompt: question ? question.prompt : '（这道题已经从课卡里删掉了）',
              spokenPrompt: question ? question.spokenPrompt || '' : '',
              options: question && Array.isArray(question.options) ? question.options : [],
              answer: question ? Number(question.answer) : -1,
              hint: question ? question.hint || '' : '',
              explanation: question ? question.explanation || '' : '',
              difficulty: question ? Number(question.difficulty) || 1 : 1,
              lastChoice: Number(row.choice),
              lastAt: Number(attempt.createdAt) || 0,
              wrongCount: 1,
              tries: state ? Number(state.tries) || 0 : 0,
              resolved: Boolean(state && state.resolved),
            })
          }
        }
        const items = Array.from(map.values()).sort((a, b) => b.lastAt - a.lastAt)
        const pending = items.filter(item => !item.resolved).length
        const categories = new Map()
        for (const item of items) {
          const name = item.category || '未分类'
          categories.set(name, (categories.get(name) || 0) + 1)
        }
        return json(res, 200, {
          items,
          summary: {
            total: items.length,
            pending,
            resolved: items.length - pending,
            videos: new Set(items.map(item => item.videoId).filter(Boolean)).size,
            categories: Array.from(categories, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
          },
        })
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    /* ---------------- 家长驾驶舱 / 成长海报周报 ---------------- */

    if (head === 'family' && tail === 'weekly') {
      if (method !== 'GET') throw Object.assign(new Error('周报只支持 GET'), { status: 405 })
      const rawWeek = toDate(q.weekStart)
      const parsed = rawWeek ? new Date(rawWeek + 'T00:00:00Z') : null
      const valid = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === rawWeek
      const weekStart = mondayOf(valid ? rawWeek : localDay())
      return json(res, 200, await this.familyWeekly(weekStart))
    }

    /* ---------------- 导出给小步乐园 ---------------- */

    if (head === 'export' && method === 'GET') {
      const weekStart = mondayOf(q.weekStart)
      const [videos, lessons, plans, attempts, draws] = await Promise.all([
        this.store.read('videos'),
        this.store.read('lessons'),
        this.store.read('plans'),
        this.attempts(),
        this.draws(),
      ])
      const plan = normalizePlan(plans[weekStart], settings.perDay)
      const plannedIds = new Set()
      for (const day of plan.days) for (const id of day.videoIds) plannedIds.add(id)
      const exportLessons = (lessons || []).filter(row => !plannedIds.size || plannedIds.has(row.videoId))
      const exportVideos = Array.from(plannedIds).map(id => videos[id]).filter(Boolean).map(cleanVideo)
      return json(res, 200, {
        generatedAt: new Date().toISOString(),
        source: 'dsh-bili-lesson',
        weekStart,
        plan,
        videos: exportVideos,
        lessons: exportLessons,
        attempts,
        rewards: rewardView(attempts, draws),
      })
    }

    throw Object.assign(new Error('没有这个接口：' + (route || '/')), { status: 404 })
  }
}

function pinHash(pin, salt) {
  return createHash('sha256').update(salt + '|' + String(pin)).digest('hex')
}

function pinMatches(stored, pin) {
  if (!stored || !pin) return false
  const [salt, hash] = String(stored).split(':')
  if (!salt || !hash) return false
  return pinHash(pin, salt) === hash
}

function summarize(records) {
  const byDate = {}
  for (const row of records || []) {
    if (!byDate[row.date]) byDate[row.date] = { total: 0, done: 0 }
    byDate[row.date].total += 1
    if (row.done) byDate[row.date].done += 1
  }
  return { byDate }
}