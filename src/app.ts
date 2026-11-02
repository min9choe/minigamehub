// 화면이 바뀌어도 로비 접속과 방은 유지되어야 하므로 여기서 한 벌씩만 관리한다.
import { findGame } from './games/catalog'
import { loadProfile, saveProfile } from './identity'
import { createLobby, type Lobby, type Match } from './lobby'
import { isConfigured } from './net/realtime'
import { createPracticeRoom } from './practice'
import { createRoom, type RoomHandle, type RoomInfo, type RoomLike } from './room'
import { go } from './router'

const ROOM_KEY = 'mgh.room'

let lobby: Lobby | null = null
let lobbyKey = ''
let room: RoomHandle | null = null
/** 봇 연습 판. 온라인 방과 동시에 열리지 않는다 */
let practice: RoomLike | null = null
let notice: string | null = null

/** 지금 프로필로 로비에 접속한다. 이미 같은 로비에 있으면 그대로 쓴다 */
export function getLobby(): Lobby | null {
  const profile = loadProfile()
  if (!profile || !isConfigured) return null
  const key = `${profile.nick}|${profile.code}`
  if (lobby && lobbyKey === key) return lobby
  lobby?.leave()
  lobbyKey = key
  lobby = createLobby({ nick: profile.nick, code: profile.code, onMatch: enterMatch })
  return lobby
}

export function stopLobby() {
  void leaveRoom()
  lobby?.leave()
  lobby = null
}

function enterMatch(m: Match) {
  if (room) return
  // 줄을 선 채로 연습하던 중에 매칭되면 연습을 접고 대전으로 간다
  void practice?.leave()
  practice = null
  const info: RoomInfo = {
    roomId: m.roomId,
    gameId: m.gameId,
    players: m.players.map(({ id, nick }) => ({ id, nick })),
  }
  saveRoomInfo(info)
  openRoom(info, false)
  go('/game')
}

function openRoom(info: RoomInfo, rejoin: boolean) {
  const game = findGame(info.gameId)
  if (!game?.def) return
  lobby?.setRoom(info.roomId)
  room = createRoom({
    info,
    def: game.def,
    min: game.min,
    rejoin,
    onClose(reason) {
      notice = reason
      void leaveRoom()
      go('/lobby')
    },
  })
  // 개발 중에만: 콘솔에서 __mghRoom.view()로 판 상태를 들여다본다(배포 빌드에서는 빠진다)
  if (import.meta.env.DEV) Object.assign(window, { __mghRoom: room })
}

/** 봇과 연습한다(틱택토, 오목). 줄을 서 있었다면 그대로 두어 연습 중에도 매칭될 수 있다 */
export function startPractice(gameId: string) {
  const game = findGame(gameId)
  const profile = loadProfile()
  if (!game?.def || !game.bot || !profile || room) return
  void practice?.leave()
  practice = createPracticeRoom({ gameId, def: game.def, bot: game.bot, nick: profile.nick })
  go('/game')
}

/** 진행 중인 방. 새로고침했으면 저장해 둔 방 정보로 다시 들어간다 */
export function currentRoom(): RoomLike | null {
  if (practice) return practice
  if (room) return room
  const saved = loadRoomInfo()
  if (!saved) return null
  if (!getLobby()) return null
  openRoom(saved, true)
  return room
}

export async function leaveRoom() {
  void practice?.leave()
  practice = null
  const r = room
  room = null
  clearRoomInfo()
  if (r) lobby?.setRoom(null)
  await r?.leave()
}

// 친구 초대(기획안 3장): 초대 전용 로비 코드를 만들어 그 로비에서 같은 게임 줄에 선다.
// 링크로 들어온 친구도 같은 로비, 같은 줄에 자동으로 서므로 줄 없이 바로 대전이 된다.
export type Invite = { code: string; gameId: string; link: string }
let invite: Invite | null = null
let pendingQueue: string | null = null

export function makeInvite(gameId: string): Invite | null {
  const profile = loadProfile()
  if (!profile || !findGame(gameId)?.def) return null
  const code = `inv${Math.random().toString(36).slice(2, 7)}`
  const link = `${location.origin}${location.pathname}#/?code=${code}&game=${gameId}`
  saveProfile({ nick: profile.nick, code })
  invite = { code, gameId, link }
  pendingQueue = gameId
  return invite
}

/** 지금 로비가 초대로 만든 로비면 그 초대 */
export function currentInvite(): Invite | null {
  return invite && invite.code === loadProfile()?.code ? invite : null
}

export function closeInvite() {
  invite = null
}

/** 로비에 연결되면 자동으로 설 줄(초대한 사람, 초대 링크로 들어온 사람) */
export function queueOnConnect(gameId: string | null) {
  pendingQueue = gameId && findGame(gameId)?.def ? gameId : null
}

export function takePendingQueue() {
  const g = pendingQueue
  pendingQueue = null
  return g
}

/** 방이 닫힌 이유처럼 로비에서 한 번 보여 줄 안내 */
export function takeNotice() {
  const n = notice
  notice = null
  return n
}

function saveRoomInfo(info: RoomInfo) {
  try {
    sessionStorage.setItem(ROOM_KEY, JSON.stringify(info))
  } catch {
    // 저장이 막혀 있으면 새로고침 후 이어 하기만 안 된다
  }
}

function loadRoomInfo(): RoomInfo | null {
  try {
    const raw = sessionStorage.getItem(ROOM_KEY)
    return raw ? (JSON.parse(raw) as RoomInfo) : null
  } catch {
    return null
  }
}

function clearRoomInfo() {
  try {
    sessionStorage.removeItem(ROOM_KEY)
  } catch {
    // 위와 같다
  }
}
