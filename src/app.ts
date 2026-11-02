// 화면이 바뀌어도 로비 접속과 방은 유지되어야 하므로 여기서 한 벌씩만 관리한다.
import { findGame } from './games/catalog'
import { loadProfile } from './identity'
import { createLobby, type Lobby, type Match } from './lobby'
import { isConfigured } from './net/realtime'
import { createRoom, type RoomHandle, type RoomInfo } from './room'
import { go } from './router'

const ROOM_KEY = 'mgh.room'

let lobby: Lobby | null = null
let lobbyKey = ''
let room: RoomHandle | null = null
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
}

/** 진행 중인 방. 새로고침했으면 저장해 둔 방 정보로 다시 들어간다 */
export function currentRoom(): RoomHandle | null {
  if (room) return room
  const saved = loadRoomInfo()
  if (!saved) return null
  if (!getLobby()) return null
  openRoom(saved, true)
  return room
}

export async function leaveRoom() {
  const r = room
  room = null
  clearRoomInfo()
  if (r) lobby?.setRoom(null)
  await r?.leave()
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
