// 로그인 대신 브라우저에 저장한 게스트 ID와 닉네임으로 사람을 구분한다(기획안 3장 '신원과 닉네임').

const ID_KEY = 'mgh.playerId'
const NICK_KEY = 'mgh.nick'
const CODE_KEY = 'mgh.lobbyCode'

export const NICK_MIN = 2
export const NICK_MAX = 8
export const CODE_MAX = 20

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 시크릿 창 등에서 저장이 막혀도 이번 접속 동안은 메모리 값으로 동작한다
  }
}

function randomId(): string {
  // randomUUID는 https나 localhost에서만 있다. 휴대폰으로 http://192.168.x.x 개발 서버에 붙을 때를 위한 대체 경로
  if (crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

let playerId: string | null = null

export function getPlayerId(): string {
  if (!playerId) {
    playerId = storageGet(ID_KEY) ?? randomId()
    storageSet(ID_KEY, playerId)
  }
  return playerId
}

export type Profile = { nick: string; code: string }

let profile: Profile | null = null

export function loadProfile(): Profile | null {
  if (profile) return profile
  const nick = storageGet(NICK_KEY)
  if (!nick || validateNick(nick)) return null
  profile = { nick, code: normalizeCode(storageGet(CODE_KEY) ?? '') }
  return profile
}

export function saveProfile(next: Profile) {
  profile = next
  storageSet(NICK_KEY, next.nick)
  storageSet(CODE_KEY, next.code)
}

export function cleanNick(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** 닉네임이 올바르면 null, 아니면 화면에 보여 줄 오류 문구 */
export function validateNick(nick: string): string | null {
  const len = Array.from(nick).length
  if (len < NICK_MIN || len > NICK_MAX) return `닉네임은 ${NICK_MIN}~${NICK_MAX}자로 정해 주세요.`
  return null
}

/** 로비 코드는 채널 이름에 들어가므로 소문자, 숫자, 한글, -, _만 남긴다 */
export function normalizeCode(raw: string): string {
  return Array.from(raw.trim().toLowerCase().replace(/[^0-9a-z가-힣_-]/g, ''))
    .slice(0, CODE_MAX)
    .join('')
}

/** 같은 닉네임이 둘 이상이면 게스트 ID 앞 4글자를 붙여 구분한다(예: 민수#3f2a) */
export function displayNames(players: { id: string; nick: string }[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const p of players) count.set(p.nick, (count.get(p.nick) ?? 0) + 1)
  return new Map(
    players.map((p) => [p.id, count.get(p.nick)! > 1 ? `${p.nick}#${p.id.slice(0, 4)}` : p.nick])
  )
}
