/**
 * /bili-lesson/* 的 HTTP 路由。
 * 每个请求先过 connection 的 Host/Origin 与登录凭证检查（照抄 dsh-wanfeng-studio/src/routes.js:152-176）。
 * 数据全在本机 JSON 里，接口只做增删改查与一次 B 站校验，不落任何远端。
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchVideo, parseBvid } from './bili.js'
import { autoFill, mondayOf, normalizePlan, toDate } from './plan.js'
import { normalizeLesson } from './lesson.js'
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

export const PREFIX = '/bili-lesson'
const MAX_JSON = 1_000_000
const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const ASSETS = { 'deck-bg.jpg': 'image/jpeg' }

/** 学习闭环新增的两个数据文件，沿用 Store 的 tmp + rename 与串行写。 */
const LEDGER_FILES = { attempts: 'attempts.json', rewards: 'rewards.json' }

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

    /* ---------------- 奖励（学习闭环） ---------------- */

    if (head === 'rewards' && !tail) {
      if (method === 'GET') {
        const [attempts, draws] = await Promise.all([this.attempts(), this.draws()])
        return json(res, 200, rewardView(attempts, draws))
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
    }

    if (head === 'rewards' && tail === 'draw') {
      if (method !== 'POST') throw Object.assign(new Error('抽盒请用 POST'), { status: 405 })
      const attempts = await this.attempts()
      let refusal = ''
      let drawn = null
      const saved = await this.ledger.update('rewards', current => {
        const list = current && Array.isArray(current.draws) ? current.draws.slice() : []
        if (availableOf(attempts, list) <= 0) {
          refusal = '没有可抽的盲盒了'
          return undefined
        }
        const item = pickSticker()
        const draw = { id: newId('dr_'), at: Date.now(), attemptId: nextAttemptId(attempts, list), itemId: item.id }
        list.push(draw)
        drawn = { item, draw }
        return { draws: list }
      })
      if (refusal) return json(res, 409, { ok: false, error: refusal })
      const draws = saved && Array.isArray(saved.draws) ? saved.draws : []
      return json(res, 200, {
        ok: true,
        item: drawn.item,
        draw: drawn.draw,
        available: availableOf(attempts, draws),
      })
    }

    /* ---------------- 设置 ---------------- */

    if (head === 'settings') {
      if (method === 'GET') return json(res, 200, settings)
      if (method === 'PUT') {
        const body = await readJson(req)
        const saved = await this.store.update('settings', current => ({
          perDay: Math.max(1, Math.min(6, Number(body.perDay) || current.perDay || 2)),
          maxAge: Math.max(1, Math.min(12, Number(body.maxAge) || current.maxAge || 6)),
          embedPlay: typeof body.embedPlay === 'boolean' ? body.embedPlay : (current.embedPlay !== false),
        }))
        return json(res, 200, saved)
      }
      throw Object.assign(new Error('不支持的方法'), { status: 405 })
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

function summarize(records) {
  const byDate = {}
  for (const row of records || []) {
    if (!byDate[row.date]) byDate[row.date] = { total: 0, done: 0 }
    byDate[row.date].total += 1
    if (row.done) byDate[row.date].done += 1
  }
  return { byDate }
}
