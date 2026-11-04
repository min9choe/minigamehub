// 대전 방(기획안 3장 '판정 담당', 10-6). 게임 규칙은 GameDef가 갖고, 이 파일은 순서·시간·접속을 맡는다.
//
// 메시지 흐름: 턴 주인은 자기 수를 'intent'로 방장에게 보내고, 방장이 규칙을 검사해 'apply'로 모두에게 알린다.
// 모두가 방장이 정한 순서대로만 상태를 바꾸므로 화면이 엇갈리지 않는다. 시간 초과와 기권 판정도 방장만 내린다.
// 방장은 방에 있는 사람 중 판 상태를 가진, 줄 선 순서가 가장 빠른 사람이다. 방장이 나가면 다음 사람이 이어받는다.
import type { GameDef, Result } from './games/types'
import { getPlayerId } from './identity'
import { openChannel } from './net/realtime'

export type RoomPlayer = { id: string; nick: string }
export type RoomInfo = { roomId: string; gameId: string; players: RoomPlayer[] }
export type Phase = 'waiting' | 'countdown' | 'playing' | 'result' | 'closed'

export type RoomView = {
  phase: Phase
  round: number
  state: unknown
  /** 이번 판 참가자(턴 순서) */
  order: string[]
  present: Set<string>
  /** 연결이 끊긴 사람 → 기권패 처리되는 시각 */
  away: Map<string, number>
  forfeited: Set<string>
  /** 이번 턴이 끝나는 시각(이 기기 기준) */
  deadline: number | null
  countdownEnd: number | null
  result: Result | null
  rematch: Set<string>
}

export type RoomHandle = ReturnType<typeof createRoom>

/** 게임 화면이 쓰는 방의 겉모습. 온라인 방(createRoom)과 봇 연습 방(practice.ts)이 함께 따른다 */
export type RoomLike = {
  info: RoomInfo
  view(): RoomView
  subscribe(fn: () => void): () => void
  play(move: unknown): void
  forfeit(): void
  requestRematch(): void
  leave(): Promise<void>
}

type Presence = { hasState: boolean }
type GameEvent = { v: number; kind: 'move' | 'timeout' | 'forfeit'; by: string; move?: unknown }
type StartMsg = { round: number; seed: number; order: string[] }
type SyncMsg = {
  round: number
  v: number
  state: unknown
  order: string[]
  timeouts: [string, number][]
  forfeited: string[]
  rematch: string[]
}

const ENTRY_TIMEOUT = 10_000 // 매칭 후 전원 입장을 기다리는 시간(기획안 3장 매칭 규칙 6)
const COUNTDOWN = 3_000
const RECONNECT_WAIT = 30_000 // 연결이 끊긴 사람을 기다리는 시간(매칭 규칙 8)
const MAX_TIMEOUTS = 2 // 연속으로 턴 시간을 넘기면 기권패
const SYNC_RETRY = 2_000
const SYNC_GIVE_UP = 10_000
const INTENT_RETRY = 3_000

export function createRoom(opts: {
  info: RoomInfo
  def: GameDef<any, any>
  min: number
  /** 새로고침 등으로 진행 중인 방에 다시 들어온 경우. 방장에게 판 상태를 받아 이어 간다 */
  rejoin: boolean
  onClose: (reason: string) => void
}) {
  const { info, def } = opts
  const me = getPlayerId()
  const ids = info.players.map((p) => p.id)
  const turnMs = def.turnSeconds * 1000
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((fn) => fn())

  let phase: Phase = 'waiting'
  let round = 0
  let v = 0 // 이번 판에서 적용된 사건 수. 메시지가 빠지거나 겹쳤는지 이 번호로 안다
  let state: unknown = null
  let order: string[] = []
  let result: Result | null = null
  let hasState = !opts.rejoin
  let deadline: number | null = null
  let countdownEnd: number | null = null
  let wasHost = false
  let connectedOnce = false
  let syncing = false
  let pending: { round: number; v: number; move: unknown } | null = null

  const members = new Map<string, Presence>()
  const away = new Map<string, number>()
  const awayTimers = new Map<string, number>()
  const timeouts = new Map<string, number>()
  const forfeited = new Set<string>()
  const rematch = new Set<string>()
  let entryTimer = 0
  let countdownTimer = 0
  let turnTimer = 0
  let syncTimer = 0
  let intentTimer = 0

  // 내 판 상태는 서버에 반영되기를 기다리지 않고 내가 아는 값으로 판단한다
  const hostId = () => ids.find((id) => (id === me ? hasState && members.has(me) : members.get(id)?.hasState))
  const iAmHost = () => hostId() === me
  const present = () => ids.filter((id) => members.has(id))
  const live = () => phase === 'countdown' || phase === 'playing'

  const ch = openChannel<Presence>(`room:${info.roomId}`, me, {
    onPresence: onMembers,
    onStatus(s) {
      if (s === 'connected') onConnected()
    },
    messages: {
      start: (p: StartMsg) => {
        if (p.round > round) beginRound(p)
      },
      intent: onIntent,
      apply: onApply,
      sync: onSync,
      // 묻는 사람보다 새 상태를 가진 사람은 누구든 답한다. 같은 상태를 여러 번 받아도 받는 쪽에서 걸러진다
      'need-sync': (p: { round: number; v: number }) => {
        if (round > p.round || (round === p.round && v > p.v)) sendSync()
      },
      rematch: (p: { id: string; round: number }) => {
        if (p.round === round) vote(p.id)
      },
      cancel: () => close('상대가 들어오지 않아 방을 닫았어요.'),
    },
  })
  void ch.track({ hasState })

  if (!opts.rejoin) {
    entryTimer = window.setTimeout(() => {
      if (round > 0) return
      if (iAmHost()) {
        // 최소 정원이 모였으면 그 인원으로 시작하고, 모자라면 방을 해산한다
        if (present().length >= opts.min) startRound()
        else {
          void ch.send('cancel', {})
          close('상대가 들어오지 않아 방을 닫았어요.')
        }
      } else {
        // 방장이 처리해 주기를 조금 더 기다렸다가 포기한다
        entryTimer = window.setTimeout(() => {
          if (round === 0) close('방에 연결하지 못했어요.')
        }, 5_000)
      }
    }, ENTRY_TIMEOUT)
  }

  function setHasState(next: boolean) {
    if (hasState === next) return
    hasState = next
    void ch.track({ hasState })
  }

  function onConnected() {
    // 처음 들어왔는데 판 상태가 없거나(새로고침), 연결이 잠깐 끊겼다 돌아왔으면(그 사이 놓친 사건이 있을 수 있다)
    // 최신 상태를 받는다. 모두가 동시에 끊겼다 돌아올 수도 있으므로 가진 상태는 내려놓지 않는다
    if (!hasState || (connectedOnce && round > 0)) askSync()
    connectedOnce = true
  }

  /** 나보다 새 상태를 가진 사람에게 상태를 받는다. 판 상태가 아예 없으면 끝내 못 받을 때 방을 닫는다 */
  function askSync() {
    clearInterval(syncTimer)
    syncing = true
    const giveUp = Date.now() + SYNC_GIVE_UP
    const ask = () => {
      if (!syncing) return clearInterval(syncTimer)
      if (Date.now() > giveUp) {
        clearInterval(syncTimer)
        syncing = false
        if (!hasState) close('진행 중인 판을 찾지 못했어요.')
        return
      }
      void ch.send('need-sync', { round: hasState ? round : 0, v: hasState ? v : 0 })
    }
    ask()
    syncTimer = window.setInterval(ask, SYNC_RETRY)
  }

  function onMembers(m: Record<string, Presence>) {
    members.clear()
    for (const [id, p] of Object.entries(m)) members.set(id, p)

    for (const id of order) {
      if (id === me || forfeited.has(id)) continue
      const here = members.has(id)
      if (!here && live() && !away.has(id)) {
        away.set(id, Date.now() + RECONNECT_WAIT)
      } else if (here && away.has(id)) {
        away.delete(id)
        clearTimeout(awayTimers.get(id))
        awayTimers.delete(id)
        if (iAmHost()) sendSync() // 자리를 비운 사이 놓친 사건을 채워 준다
      }
    }

    const host = iAmHost()
    if (host) armAwayTimers()
    if (host && !wasHost && phase === 'playing') armTurnTimer() // 방장을 이어받았다
    wasHost = host

    if (host && round === 0 && ids.every((id) => members.has(id))) startRound()
    if (phase === 'result') checkRematch()
    emit()
  }

  function armAwayTimers() {
    for (const [id, until] of away) {
      if (awayTimers.has(id)) continue
      awayTimers.set(
        id,
        window.setTimeout(() => {
          awayTimers.delete(id)
          if (away.has(id) && iAmHost() && live()) hostApply({ v, kind: 'forfeit', by: id })
        }, Math.max(0, until - Date.now()))
      )
    }
  }

  function clearAway() {
    away.clear()
    for (const t of awayTimers.values()) clearTimeout(t)
    awayTimers.clear()
  }

  // 방장만 아는 비밀(숫자 야구 정답). 상태에는 넣지 않고, 방장이 새로고침해도 남도록 이 탭에만 저장한다
  const secretKey = (r: number) => `mgh.secret:${info.roomId}:${r}`
  const secrets = new Map<number, unknown>()
  function getSecret(): unknown {
    if (secrets.has(round)) return secrets.get(round)
    try {
      const raw = sessionStorage.getItem(secretKey(round))
      if (raw !== null) {
        secrets.set(round, JSON.parse(raw))
        return secrets.get(round)
      }
    } catch {
      // 저장소를 못 쓰면 메모리에 있는 것만 쓴다
    }
    return undefined
  }
  function keepSecret(value: unknown) {
    secrets.set(round, value)
    try {
      sessionStorage.setItem(secretKey(round), JSON.stringify(value))
    } catch {
      // 위와 같다
    }
  }
  /** 방장이 수를 알리기 전에 비밀로 판정을 붙인다. 비밀을 모르는 방장(이어받은 사람)은 판정하지 않는다 */
  function judged(by: string, move: unknown): unknown {
    if (!def.host) return move
    const secret = getSecret()
    if (secret === undefined) return null
    return def.host.judge(state, by, move, secret)
  }

  function startRound() {
    clearTimeout(entryTimer)
    const msg: StartMsg = { round: round + 1, seed: Math.floor(Math.random() * 2 ** 31), order: present() }
    void ch.send('start', msg)
    beginRound(msg)
    if (def.host) {
      // 비밀을 만들고, 모두에게는 지문 같은 공개용 값만 첫 사건으로 알린다
      const { secret, move } = def.host.setup(state)
      keepSecret(secret)
      hostApply({ v, kind: 'move', by: me, move })
    }
  }

  function beginRound(p: StartMsg) {
    clearTimeout(entryTimer)
    clearInterval(syncTimer)
    clearInterval(intentTimer)
    syncing = false
    round = p.round
    order = p.order
    state = def.init(order, p.seed)
    v = 0
    result = null
    pending = null
    timeouts.clear()
    forfeited.clear()
    rematch.clear()
    clearAway()
    setHasState(true)

    phase = 'countdown'
    countdownEnd = Date.now() + COUNTDOWN
    deadline = null
    clearTimeout(countdownTimer)
    countdownTimer = window.setTimeout(() => {
      if (phase !== 'countdown') return
      phase = 'playing'
      countdownEnd = null
      deadline = Date.now() + turnMs
      if (iAmHost()) armTurnTimer()
      emit()
    }, COUNTDOWN)
    emit()
  }

  function armTurnTimer() {
    clearTimeout(turnTimer)
    if (phase !== 'playing') return
    const who = def.turnOf(state)
    if (!who) return
    // 비밀을 모르는 방장은 판정을 못 하니 시간도 재지 않는다(원래 방장이 돌아오거나 30초 뒤 기권 처리될 때까지)
    if (def.host && getSecret() === undefined) return
    const atV = v
    turnTimer = window.setTimeout(() => {
      if (v !== atV || phase !== 'playing' || !iAmHost()) return
      const n = (timeouts.get(who) ?? 0) + 1
      hostApply({ v, kind: n >= MAX_TIMEOUTS ? 'forfeit' : 'timeout', by: who })
    }, turnMs)
  }

  /** 방장만 부른다: 사건을 적용하고 모두에게 알린다 */
  function hostApply(ev: GameEvent) {
    if (applyEvent(ev)) void ch.send('apply', { round, ...ev })
  }

  function applyEvent(ev: GameEvent): boolean {
    if (ev.v !== v || state === null || !live() || forfeited.has(ev.by)) return false
    let next: unknown
    if (ev.kind === 'move') {
      next = def.apply(state, ev.by, ev.move)
      if (next === null) return false
      timeouts.set(ev.by, 0)
    } else if (ev.kind === 'timeout') {
      next = def.skip(state)
      timeouts.set(ev.by, (timeouts.get(ev.by) ?? 0) + 1)
    } else {
      next = def.eliminate(state, ev.by)
      forfeited.add(ev.by)
      away.delete(ev.by)
    }
    state = next
    v += 1
    if (pending && pending.v < v) {
      pending = null
      clearInterval(intentTimer)
    }

    result = def.result(state)
    if (result) {
      phase = 'result'
      deadline = null
      countdownEnd = null
      clearTimeout(turnTimer)
      clearTimeout(countdownTimer)
      clearAway()
    } else if (phase === 'playing') {
      deadline = Date.now() + turnMs
      if (iAmHost()) armTurnTimer()
    }
    emit()
    return true
  }

  function onIntent(p: GameEvent & { round: number }) {
    if (!iAmHost() || p.round !== round) return
    if (p.kind === 'forfeit') hostApply({ v, kind: 'forfeit', by: p.by })
    else if (p.kind === 'move' && p.v === v) {
      const move = judged(p.by, p.move)
      if (move !== null) hostApply({ v, kind: 'move', by: p.by, move })
    }
    else if (p.kind === 'move' && p.v < v) sendSync() // 이미 반영된 수를 다시 보냈다면 결과를 놓친 것이다
  }

  function onApply(p: GameEvent & { round: number }) {
    if (p.round !== round || !hasState || p.v < v) return
    if (p.v > v || !applyEvent(p)) askSync()
  }

  function sendSync() {
    if (round === 0 || state === null || !hasState) return
    const msg: SyncMsg = {
      round,
      v,
      state,
      order,
      timeouts: [...timeouts],
      forfeited: [...forfeited],
      rematch: [...rematch],
    }
    void ch.send('sync', msg)
  }

  function onSync(p: SyncMsg) {
    if (hasState && p.round === round && p.v === v) {
      // 이미 최신이다. 물어본 게 나라면 더 묻지 않는다
      syncing = false
      clearInterval(syncTimer)
      return
    }
    if (p.round < round || (hasState && p.round === round && p.v < v)) return
    clearTimeout(entryTimer)
    clearTimeout(countdownTimer)
    clearInterval(syncTimer)
    syncing = false
    round = p.round
    v = p.v
    state = p.state
    order = p.order
    timeouts.clear()
    for (const [id, n] of p.timeouts) timeouts.set(id, n)
    forfeited.clear()
    for (const id of p.forfeited) forfeited.add(id)
    rematch.clear()
    for (const id of p.rematch) rematch.add(id)
    if (pending && (pending.round !== round || pending.v < v)) {
      pending = null
      clearInterval(intentTimer)
    }
    result = def.result(state)
    phase = result ? 'result' : 'playing'
    deadline = result ? null : Date.now() + turnMs
    countdownEnd = null
    setHasState(true)
    emit()
  }

  function vote(id: string) {
    rematch.add(id)
    checkRematch()
    emit()
  }

  /** 방에 남아 있는 사람이 모두 '다시 하기'를 누르면 방장이 새 판을 시작한다 */
  function checkRematch() {
    if (phase !== 'result' || !iAmHost()) return
    const here = present()
    if (here.length >= opts.min && here.every((id) => rematch.has(id))) startRound()
  }

  function shutdown() {
    if (phase === 'closed') return false
    phase = 'closed'
    for (const t of [entryTimer, countdownTimer, turnTimer]) clearTimeout(t)
    clearInterval(syncTimer)
    clearInterval(intentTimer)
    clearAway()
    ch.leave()
    emit()
    listeners.clear()
    return true
  }

  function close(reason: string) {
    if (shutdown()) opts.onClose(reason)
  }

  return {
    info,
    view: (): RoomView => ({
      phase,
      round,
      state,
      order,
      present: new Set(members.keys()),
      away: new Map(away),
      forfeited: new Set(forfeited),
      deadline,
      countdownEnd,
      result,
      rematch: new Set(rematch),
    }),
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    play(move: unknown) {
      if (phase !== 'playing' || state === null || pending || def.turnOf(state) !== me) return
      // 비밀을 쓰는 게임은 판정이 붙어야 규칙 검사가 되므로 미리 검사하지 않는다(방장이 판정할 때 검사한다)
      if (!def.host && def.apply(state, me, move) === null) return
      if (iAmHost()) {
        const m = judged(me, move)
        if (m !== null) hostApply({ v, kind: 'move', by: me, move: m })
        return
      }
      pending = { round, v, move }
      const sendIntent = () => {
        if (!pending) return clearInterval(intentTimer)
        if (iAmHost()) {
          // 기다리는 사이 내가 방장이 되었다
          const p = pending
          pending = null
          clearInterval(intentTimer)
          const m = p.round === round ? judged(me, p.move) : null
          if (m !== null) hostApply({ v: p.v, kind: 'move', by: me, move: m })
          return
        }
        void ch.send('intent', { round: pending.round, v: pending.v, kind: 'move', by: me, move: pending.move })
      }
      sendIntent()
      clearInterval(intentTimer)
      intentTimer = window.setInterval(sendIntent, INTENT_RETRY)
    },
    forfeit() {
      if (!live() || !order.includes(me) || forfeited.has(me)) return
      if (iAmHost()) hostApply({ v, kind: 'forfeit', by: me })
      else void ch.send('intent', { round, v, kind: 'forfeit', by: me })
    },
    requestRematch() {
      if (phase !== 'result') return
      void ch.send('rematch', { id: me, round })
      vote(me)
    },
    /** 방을 나간다. 판이 진행 중이면 기권으로 처리하고 나간다 */
    async leave() {
      if (phase === 'closed') return
      if (live() && order.includes(me) && !forfeited.has(me)) {
        if (iAmHost()) {
          const ev: GameEvent = { v, kind: 'forfeit', by: me }
          if (applyEvent(ev)) await ch.send('apply', { round, ...ev })
        } else {
          await ch.send('intent', { round, v, kind: 'forfeit', by: me })
        }
      }
      shutdown()
    },
  }
}
