/**
 * B 站公开接口：只读 view，不登录、不带 cookie。
 * 失效视频（接口 code != 0）标记 dead，保留条目让家长自己决定删不删。
 */
const VIEW = 'https://api.bilibili.com/x/web-interface/view?bvid='
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) dsh-bili-lesson/0.1'

export function parseBvid(input) {
  const text = String(input || '').trim()
  const direct = /^(BV[0-9A-Za-z]{10})$/.exec(text)
  if (direct) return direct[1]
  const found = /(BV[0-9A-Za-z]{10})/.exec(text)
  return found ? found[1] : ''
}

function https(url) {
  return String(url || '').replace(/^http:\/\//, 'https://')
}

export async function fetchVideo(bvid) {
  let res
  try {
    res = await fetch(VIEW + encodeURIComponent(bvid), {
      headers: { referer: 'https://www.bilibili.com/', 'user-agent': UA },
      signal: AbortSignal.timeout(15000),
    })
  } catch (error) {
    throw Object.assign(new Error('连不上 B 站接口：' + (error && error.message ? error.message : error)), { status: 502 })
  }
  if (!res.ok) throw Object.assign(new Error('B 站接口 HTTP ' + res.status), { status: 502 })
  const body = await res.json()
  if (!body || body.code !== 0 || !body.data) {
    return { dead: true, message: (body && body.message) || '视频不可用', item: null }
  }
  const data = body.data
  return {
    dead: false,
    item: {
      bvid,
      title: String(data.title || '').trim(),
      cover: https(data.pic),
      duration: Number(data.duration) || 0,
      owner: data.owner && data.owner.name ? String(data.owner.name) : '',
    },
  }
}

export function embedUrl(bvid, autoplay = true) {
  const params = [
    'bvid=' + encodeURIComponent(bvid),
    'high_quality=1',
    'danmaku=0',
    'as_wide=1',
    'autoplay=' + (autoplay ? 1 : 0),
  ]
  return 'https://player.bilibili.com/player.html?' + params.join('&')
}
