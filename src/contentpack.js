/**
 * 内容包：把家长挑好的视频与课卡搬到另一台机器。
 * 导入是合并而非覆盖；任何来源的凭证字段（token/key/secret/password）都不会落盘，
 * 目标机器标死的视频也不会被包里的 alive 状态复活。
 */
import { normalizeLesson } from './lesson.js'

const FORMAT = 'dsh-bili-lesson-content-pack'
const VERSION = 1
const SENSITIVE = /token|key|secret|password/i

function stripSensitive(value) {
  if (Array.isArray(value)) return value.map(stripSensitive)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE.test(key)) continue
      out[key] = stripSensitive(item)
    }
    return out
  }
  return value
}

function empty(value) {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function mergedVideo(existing, incoming, id) {
  const out = existing && typeof existing === 'object' ? { ...existing } : {}
  const source = incoming && typeof incoming === 'object' ? incoming : {}
  for (const [key, value] of Object.entries(source)) {
    if (SENSITIVE.test(key)) continue
    if (key === 'dead') {
      if (value === true) out.dead = true
      continue
    }
    if (key === 'id' || empty(value)) continue
    out[key] = value
  }
  out.id = id
  return out
}

function invalid(message) {
  return Object.assign(new Error(message), { status: 400 })
}

/** 按 ids 挑片；没给 ids 就导出全部未失效的视频及其课卡。weekStart 预留，当前不收窄范围。 */
export async function buildContentPack(store, options = {}) {
  const { ids, weekStart } = options || {}
  void weekStart
  const [storedVideos, storedLessons] = await Promise.all([store.read('videos'), store.read('lessons')])
  const videos = storedVideos && typeof storedVideos === 'object' && !Array.isArray(storedVideos) ? storedVideos : {}
  const lessons = Array.isArray(storedLessons) ? storedLessons : []
  const chosen = Array.isArray(ids) && ids.length
    ? ids.map(id => videos[String(id)]).filter(Boolean)
    : Object.values(videos).filter(video => video && !video.dead)
  const included = new Set(chosen.map(video => String(video.id || video.bvid || '').trim()).filter(Boolean))
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    videos: stripSensitive(chosen),
    lessons: stripSensitive(lessons.filter(lesson => lesson && included.has(String(lesson.videoId || '').trim()))),
  }
}

/** 校验后按 id / videoId 合并回本地；只认新时间戳的课卡，返回四类计数与跳过数。 */
export async function applyContentPack(store, pack) {
  if (!pack || typeof pack !== 'object') throw invalid('内容包不是对象')
  if (pack.format !== FORMAT) throw invalid('内容包格式不对')
  if (pack.version !== VERSION) throw invalid('内容包版本不支持：' + String(pack.version))
  if (!Array.isArray(pack.videos) || !Array.isArray(pack.lessons)) throw invalid('内容包缺少视频或课卡数组')

  const [storedVideos, storedLessons] = await Promise.all([store.read('videos'), store.read('lessons')])
  const videos = storedVideos && typeof storedVideos === 'object' && !Array.isArray(storedVideos) ? { ...storedVideos } : {}
  const lessons = Array.isArray(storedLessons) ? storedLessons.slice() : []
  let addedVideos = 0
  let updatedVideos = 0
  let addedLessons = 0
  let updatedLessons = 0
  let skipped = 0

  for (const row of pack.videos) {
    const source = stripSensitive(row)
    const id = source && typeof source === 'object' ? String(source.id || source.bvid || '').trim() : ''
    if (!id) {
      skipped += 1
      continue
    }
    if (videos[id]) {
      videos[id] = mergedVideo(videos[id], source, id)
      updatedVideos += 1
    } else {
      videos[id] = mergedVideo(null, source, id)
      addedVideos += 1
    }
  }

  const incoming = new Map()
  for (const row of pack.lessons) {
    if (!row || typeof row !== 'object') {
      skipped += 1
      continue
    }
    const videoId = String(row.videoId || '').trim()
    const stamp = Number(row.updatedAt) || 0
    const prev = incoming.get(videoId)
    if (!videoId || (prev && prev.stamp >= stamp)) {
      skipped += 1
      continue
    }
    incoming.set(videoId, { row: stripSensitive(row), stamp })
  }

  for (const { row, stamp } of incoming.values()) {
    let lesson
    try {
      lesson = normalizeLesson(row)
    } catch {
      skipped += 1
      continue
    }
    const index = lessons.findIndex(item => item && String(item.videoId || '').trim() === lesson.videoId)
    if (index < 0) {
      lessons.push(lesson)
      addedLessons += 1
      continue
    }
    if (stamp > (Number(lessons[index].updatedAt) || 0)) {
      lessons[index] = lesson
      updatedLessons += 1
    } else {
      skipped += 1
    }
  }

  if (addedVideos || updatedVideos) await store.write('videos', videos)
  if (addedLessons || updatedLessons) await store.write('lessons', lessons)
  return { addedVideos, updatedVideos, addedLessons, updatedLessons, skipped }
}
