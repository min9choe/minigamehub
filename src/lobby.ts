// 로비 채널(기획안 3장, 10-3~10-5). 로비의 Presence 상태가 곧 접속자 목록이자 게임별 줄이다.
// 서버가 없으므로 모든 브라우저가 같은 줄을 계산하고, 줄 맨 앞 사람만 매칭을 만든다.
import { GAMES } from './games/catalog'
import { getPlayerId } from './identity'
import { openChannel, type ChannelStatus } from './net/realtime'

/** room: 참가 중인 방, watching: 관전 중인 방 */
export type LobbyState = { nick: string; game: string | null; queuedAt: number | null; room: string | null; watching?: string | null }
export type LobbyPlayer = LobbyState & { id: string }
export type Match = {
  roomId: string
  gameId: string
  players: { id: string; nick: string; queuedAt: number | null }[]
}
export type Lobby = ReturnType<typeof createLobby>
/** 로비에서 보이는 진행 중인 판 */
export type LiveRoom = { roomId: string; gameId: string; players: { id: string; nick: string }[]; watchers: number }

/** 방 ID는 '게임ID-...'로 시작한다(startMatch) */
export const gameOfRoom = (roomId: string) => roomId.split('-')[0]

/** 2~4명 게임은 최소 인원이 모이면 이만큼 더 기다렸다가 모인 인원으로 시작한다(초안 값) */
const GATHER_WAIT = 10_000

export function lobbyChannelName(code: string) {
  return code ? `lobby:${code}` : 'lobby'
}

export function createLobby(opts: { nick: string; code: string; onMatch: (m: Match) => void }) {
  const me = getPlayerId()
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((fn) => fn())

  let others: LobbyPlayer[] = []
  let status: ChannelStatus = 'connecting'
  let mine: LobbyState = { nick: opts.nick, game: null, queuedAt: null, room: null, watching: null }
  // 매칭 알림으로 이미 뽑힌 사람: { 플레이어ID: 그때의 줄 선 시각 }.
  // 뽑힌 사람의 줄 이탈이 반영되기 전에 다음 사람이 같은 사람을 또 뽑지 않게 한다(기획안 3장 매칭 규칙 4)
  const matched = new Map<string, number | null>()
  const timers: Record<string, number> = {}
  const started = new Set<string>()

  const ch = openChannel<LobbyState>(lobbyChannelName(opts.code), me, {
    onPresence(members) {
      others = Object.entries(members)
        .filter(([id]) => id !== me)
        .map(([id, s]) => ({ id, ...s }))
      checkMatch()
      emit()
    },
    onStatus(s) {
      status = s
      checkMatch()
      emit()
    },
    messages: { match: onMatchMessage },
  })
  void ch.track(mine)

  /** 내 상태는 서버 반영을 기다리지 않고 바로 쓴다 */
  function players(): LobbyPlayer[] {
    return [{ id: me, ...mine }, ...others]
  }

  /** 한 게임의 줄: 이미 뽑힌 사람을 빼고, 먼저 선 순서대로, 같은 시각이면 ID 순서로 정렬한다 */
  function queueOf(game: string): LobbyPlayer[] {
    return players()
      .filter((p) => p.game === game && p.queuedAt !== null && matched.get(p.id) !== p.queuedAt)
      .sort((a, b) => a.queuedAt! - b.queuedAt! || a.id.localeCompare(b.id))
  }

  function checkMatch() {
    if (status !== 'connected') return
    for (const g of GAMES) {
      if (!g.def) continue
      const q = queueOf(g.id)
      const iAmFirst = q.length >= g.min && q[0].id === me
      if (!iAmFirst) {
        clearTimeout(timers[g.id])
        delete timers[g.id]
        continue
      }
      if (q.length >= g.max) {
        clearTimeout(timers[g.id])
        delete timers[g.id]
        startMatch(g.id, q.slice(0, g.max))
      } else if (!timers[g.id]) {
        timers[g.id] = window.setTimeout(() => {
          delete timers[g.id]
          const now = queueOf(g.id)
          if (status === 'connected' && now.length >= g.min && now[0].id === me) {
            startMatch(g.id, now.slice(0, g.max))
          }
        }, GATHER_WAIT)
      }
    }
  }

  function startMatch(gameId: string, picked: LobbyPlayer[]) {
    // 같은 줄 상태에서 두 번 실행되어도 같은 방이 되도록 맨 앞 사람의 ID와 줄 선 시각으로 방 ID를 만든다
    const roomId = `${gameId}-${picked[0].id.slice(0, 8)}-${picked[0].queuedAt}`
    if (started.has(roomId)) return
    started.add(roomId)
    const m: Match = {
      roomId,
      gameId,
      players: picked.map((p) => ({ id: p.id, nick: p.nick, queuedAt: p.queuedAt })),
    }
    for (const p of m.players) matched.set(p.id, p.queuedAt)
    void ch.send('match', m)
    queueMicrotask(() => opts.onMatch(m)) // 보낸 사람은 자기 메시지를 받지 않으므로 직접 입장한다
  }

  function onMatchMessage(m: Match) {
    for (const p of m.players) matched.set(p.id, p.queuedAt)
    const picked = m.players.find((p) => p.id === me)
    // 그사이 내가 줄을 취소했거나 다른 줄로 옮겼으면 따라가지 않는다
    if (picked && mine.game === m.gameId && mine.queuedAt === picked.queuedAt) opts.onMatch(m)
    checkMatch()
    emit()
  }

  function setMine(next: LobbyState) {
    mine = next
    void ch.track(mine)
    checkMatch()
    emit()
  }

  return {
    players,
    queueOf,
    status: () => status,
    mine: () => mine,
    /** 지금 진행 중인 판 수 */
    roomsInProgress: () => new Set(players().map((p) => p.room).filter(Boolean)).size,
    /** 진행 중인 판들. 참가자는 지금 그 방에 있다고 로비에 알린 사람들이다 */
    liveRooms(): LiveRoom[] {
      const rooms = new Map<string, LiveRoom>()
      for (const p of players()) {
        if (!p.room) continue
        const r = rooms.get(p.room) ?? { roomId: p.room, gameId: gameOfRoom(p.room), players: [], watchers: 0 }
        r.players.push({ id: p.id, nick: p.nick })
        rooms.set(p.room, r)
      }
      for (const p of players()) {
        const r = p.watching ? rooms.get(p.watching) : undefined
        if (r) r.watchers++
      }
      return [...rooms.values()]
    },
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    /** 한 사람은 한 게임의 줄에만 선다. 다른 줄을 고르면 기존 줄에서 자동으로 빠진다 */
    joinQueue(game: string) {
      if (mine.room) return
      setMine({ ...mine, game, queuedAt: Date.now() })
    },
    leaveQueue() {
      setMine({ ...mine, game: null, queuedAt: null })
    },
    /** 방에 들어가면 줄에서 빠지고, 진행 중인 판 수에 잡힌다 */
    setRoom(room: string | null) {
      setMine({ ...mine, game: null, queuedAt: null, room, watching: null })
    },
    /** 관전은 줄을 그대로 둔다. 관전하는 사이 매칭되면 대전으로 옮겨 간다 */
    setWatching(watching: string | null) {
      setMine({ ...mine, watching })
    },
    leave() {
      for (const t of Object.values(timers)) clearTimeout(t)
      listeners.clear()
      ch.leave()
    },
  }
}
