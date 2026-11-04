// 봇 연습 방(기획안 3장 '혼자 접속했을 때'). 서버 없이 이 브라우저 안에서만 돌고, 게임 화면은 온라인 방과 똑같이 쓴다.
// 시간 제한은 두지 않는다. 결과 화면에서 '다시 하기'를 누르면 봇은 늘 동의한다.
import type { GameDef, Result } from './games/types'
import { getPlayerId } from './identity'
import type { Phase, RoomInfo, RoomLike, RoomView } from './room'

export const BOT_ID = 'bot'
const COUNTDOWN = 3_000
const BOT_DELAY = 700 // 봇이 생각하는 척하는 시간

export function createPracticeRoom(opts: {
  gameId: string
  def: GameDef<any, any>
  bot: (state: any, botId: string) => unknown
  nick: string
}): RoomLike {
  const me = getPlayerId()
  const info: RoomInfo = {
    roomId: 'practice',
    gameId: opts.gameId,
    players: [
      { id: me, nick: opts.nick },
      { id: BOT_ID, nick: '봇' },
    ],
  }
  const order = info.players.map((p) => p.id)
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((fn) => fn())

  let phase: Phase = 'countdown'
  let round = 0
  let state: unknown = null
  let result: Result | null = null
  let countdownEnd: number | null = null
  const forfeited = new Set<string>()
  const rematch = new Set<string>()
  let timer = 0
  let secret: unknown = null

  function startRound() {
    round += 1
    state = opts.def.init(order, Math.floor(Math.random() * 2 ** 31))
    result = null
    forfeited.clear()
    rematch.clear()
    // 비밀을 쓰는 게임(숫자 야구)은 이 브라우저가 방장 노릇을 한다
    if (opts.def.host) {
      const { secret: s, move } = opts.def.host.setup(state)
      secret = s
      state = opts.def.apply(state, me, move) ?? state
    }
    phase = 'countdown'
    countdownEnd = Date.now() + COUNTDOWN
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      phase = 'playing'
      countdownEnd = null
      emit()
      botTurn()
    }, COUNTDOWN)
    emit()
  }

  function apply(by: string, raw: unknown) {
    const move = opts.def.host ? opts.def.host.judge(state, by, raw, secret) : raw
    if (move === null) return false
    const next = opts.def.apply(state, by, move)
    if (next === null) return false
    state = next
    result = opts.def.result(state)
    if (result) phase = 'result'
    emit()
    if (!result) botTurn()
    return true
  }

  function botTurn() {
    if (phase !== 'playing' || opts.def.turnOf(state) !== BOT_ID) return
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (phase === 'playing' && opts.def.turnOf(state) === BOT_ID) apply(BOT_ID, opts.bot(state, BOT_ID))
    }, BOT_DELAY)
  }

  startRound()

  return {
    info,
    view: (): RoomView => ({
      phase,
      round,
      state,
      order,
      present: new Set(order),
      away: new Map(),
      forfeited: new Set(forfeited),
      deadline: null,
      countdownEnd,
      result,
      rematch: new Set(rematch),
    }),
    subscribe(fn) {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
    play(move) {
      if (phase === 'playing' && opts.def.turnOf(state) === me) apply(me, move)
    },
    forfeit() {
      if (phase !== 'playing' && phase !== 'countdown') return
      clearTimeout(timer)
      forfeited.add(me)
      state = opts.def.eliminate(state, me)
      result = opts.def.result(state)
      phase = 'result'
      emit()
    },
    requestRematch() {
      if (phase === 'result') startRound()
    },
    async leave() {
      clearTimeout(timer)
      phase = 'closed'
      emit()
      listeners.clear()
    },
  }
}
