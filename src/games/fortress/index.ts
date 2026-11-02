// 포트리스(기획안 4장): 2~4명 개인전. 내 차례에 정해진 거리만큼 움직인 뒤 각도와 파워를 정해 쏜다.
// 체력이 0이 되거나 발밑이 바닥까지 파여 떨어지면 탈락하고, 마지막까지 남은 사람이 이긴다.
// 계산은 world.ts에 있다.
//
// 동기화: 한 턴에 메시지 하나만 보낸다. 움직인 위치, 각도, 파워와 쏜 사람이 계산한 착탄 위치(impact)를 담는다.
// 모두가 같은 착탄 위치로 지형을 파고 피해를 계산하므로 지형과 체력이 모든 화면에서 같다.
import type { GameDef } from '../types'
import { mountFortress } from './view'
import { FUEL, H, crater, damageFrom, makeTerrain, startTanks, windFor, worldWidth, type Point, type Tank } from './world'

/** 끝없이 빗나갈 때를 위한 상한: 각자 이만큼 쏘면 체력이 가장 많은 사람이 이긴다 */
export const TURN_LIMIT = 20

export type State = {
  order: string[]
  seed: number
  ground: number[]
  tanks: Tank[]
  turn: number
  /** 지금까지 지난 턴 수. 바람은 이 번호로 정해진다 */
  turnNo: number
  wind: number
  shotNo: number
  lastShot: {
    player: number
    fromX: number
    x: number
    angle: number
    power: number
    wind: number
    impact: Point | null
    damage: number[]
    /** 쏘기 전 지형과 탱크. 다른 화면에서 날아가는 모습을 그대로 재생하는 데 쓴다 */
    ground: number[]
    tanks: Tank[]
  } | null
  winners: number[] | null
}
export type Move = { x: number; angle: number; power: number; impact: Point | null }

const alive = (s: State) => s.tanks.map((t, i) => (t.out ? -1 : i)).filter((i) => i >= 0)

function nextTurn(s: State): State {
  const left = alive(s)
  if (left.length <= 1) return { ...s, winners: left }
  const turnNo = s.turnNo + 1
  if (turnNo >= TURN_LIMIT * s.order.length) {
    const best = Math.max(...left.map((i) => s.tanks[i].hp))
    return { ...s, turnNo, winners: left.filter((i) => s.tanks[i].hp === best) }
  }
  let turn = s.turn
  do turn = (turn + 1) % s.order.length
  while (s.tanks[turn].out)
  return { ...s, turn, turnNo, wind: windFor(s.seed, turnNo) }
}

export const fortress: GameDef<State, Move> = {
  turnSeconds: 20,

  init(order, seed) {
    const width = worldWidth(order.length)
    return {
      order,
      seed,
      ground: makeTerrain(width, seed),
      tanks: startTanks(width, order.length),
      turn: seed % order.length,
      turnNo: 0,
      wind: windFor(seed, 0),
      shotNo: 0,
      lastShot: null,
      winners: null,
    }
  },

  turnOf: (s) => (s.winners ? null : s.order[s.turn]),

  apply(s, by, { x, angle, power, impact }) {
    const me = s.order.indexOf(by)
    if (s.winners || me !== s.turn) return null
    const tank = s.tanks[me]
    if (!Number.isInteger(x) || x < 0 || x >= s.ground.length || Math.abs(x - tank.x) > FUEL || s.ground[x] >= H) return null
    if (!Number.isFinite(angle) || angle < 0 || angle > 180 || !Number.isFinite(power) || power < 0 || power > 100) return null
    if (impact !== null && !(Number.isFinite(impact?.x) && Number.isFinite(impact?.y) && impact.y <= H)) return null

    const moved = s.tanks.map((t, i) => (i === me ? { ...t, x, angle } : t))
    let ground = s.ground
    let damage = moved.map(() => 0)
    let tanks = moved
    if (impact) {
      damage = damageFrom(s.ground, moved, impact)
      ground = crater(s.ground, impact)
      // 체력이 다하거나 발밑이 바닥까지 파였으면 탈락
      tanks = moved.map((t, i) => {
        const hp = Math.max(0, t.hp - damage[i])
        return { ...t, hp, out: t.out || hp === 0 || ground[t.x] >= H }
      })
    }
    const lastShot = { player: me, fromX: tank.x, x, angle, power, wind: s.wind, impact, damage, ground: s.ground, tanks: moved }
    return nextTurn({ ...s, ground, tanks, shotNo: s.shotNo + 1, lastShot })
  },

  /** 시간 안에 쏘지 않으면 차례만 넘어간다 */
  skip: (s) => (s.winners ? s : nextTurn(s)),

  eliminate(s, id) {
    const p = s.order.indexOf(id)
    if (s.winners || p < 0 || s.tanks[p].out) return s
    const next = { ...s, tanks: s.tanks.map((t, i) => (i === p ? { ...t, out: true } : t)) }
    const left = alive(next)
    if (left.length <= 1) return { ...next, winners: left }
    return s.turn === p ? nextTurn(next) : next
  },

  result: (s) => (s.winners ? { winners: s.winners.map((i) => s.order[i]) } : null),

  mount: (el, ctx) => mountFortress(el, ctx),
}
