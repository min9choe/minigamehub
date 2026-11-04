// 땅따먹기(기획안 4장): 3번 튕겨 집으로 돌아오면 지나온 도형만큼 땅을 얻는다. 각자 8턴, 땅이 가장 넓은 사람이 이긴다.
// 판정은 rules.ts, 물리는 알까기와 같은 shared/physics.ts를 쓴다.
//
// 동기화: 쏜 사람이 정지 위치(end)까지 계산해 수에 담아 보낸다. 면적은 이 정지 위치로만 계산하므로 모든 화면에서 같다.
import type { GameDef } from '../types'
import { MAX_SPEED, simulate } from '../shared/physics'
import { areaOf, cellAt, claim, cornersFor, houseCenter, initialLand, insideHouse, insidePolygon, type Point } from './rules'
import { mountTerritory } from './view'

export const TURNS_EACH = 8
export const FLICKS = 3

export type State = {
  order: string[]
  corners: number[]
  /** 칸마다 주인. 면적(점수)은 이 칸 수로 센다 */
  land: number[]
  /** 성공한 턴마다 얻은 도형(경로 그대로), 얻은 순서대로. 화면은 칸 대신 이 도형으로 땅을 그린다 */
  claims: { player: number; shape: Point[] }[]
  /** 지금 튕기는 사람(order 번호) */
  turn: number
  /** 이번 턴 출발점 뒤로 멈춘 자리들 */
  stops: Point[]
  stone: Point
  turnsTaken: number[]
  out: number[]
  shotNo: number
  lastShot: { from: Point; vx: number; vy: number; player: number } | null
  /** 방금 끝난 턴 결과. 화면 안내와 도형 표시에 쓴다 */
  lastTurn: { player: number; ok: boolean; gained: number; shape: Point[] } | null
  winners: number[] | null
}
export type Move = { vx: number; vy: number; end: Point & { out: boolean } }

const nextTurn = (s: State, from: number): number | null => {
  for (let i = 1; i <= s.order.length; i++) {
    const p = (from + i) % s.order.length
    if (!s.out.includes(p) && s.turnsTaken[p] < TURNS_EACH) return p
  }
  return null
}

function finish(s: State): State {
  const alive = s.order.map((_, i) => i).filter((i) => !s.out.includes(i))
  const best = Math.max(...alive.map((i) => areaOf(s.land, i)))
  return { ...s, winners: alive.filter((i) => areaOf(s.land, i) === best) }
}

/** 이번 턴을 끝내고 다음 사람 집에서 돌을 출발시킨다 */
function endTurn(s: State, lastTurn: State['lastTurn']): State {
  const turnsTaken = [...s.turnsTaken]
  turnsTaken[s.turn] += 1
  const ended = { ...s, turnsTaken, stops: [], lastTurn }
  const next = nextTurn(ended, s.turn)
  if (next === null) return finish(ended)
  return { ...ended, turn: next, stone: houseCenter(s.corners[next]) }
}

/** 한 번 튕긴 결과를 적용한다. 3번째이거나 판 밖으로 나가면 턴이 끝난다 */
export function applyFlick(s: State, move: Move): State {
  const lastShot = { from: s.stone, vx: move.vx, vy: move.vy, player: s.turn }
  const base: State = { ...s, shotNo: s.shotNo + 1, lastShot }
  const start = houseCenter(s.corners[s.turn])
  if (move.end.out) return endTurn(base, { player: s.turn, ok: false, gained: 0, shape: [start, ...s.stops] })

  const end = { x: move.end.x, y: move.end.y }
  const stops = [...s.stops, end]
  if (stops.length < FLICKS) return { ...base, stops, stone: end }

  const shape = [start, ...stops]
  if (!ownsAt(s, s.turn, end)) return endTurn(base, { player: s.turn, ok: false, gained: 0, shape })
  const { land, gained } = claim(s.land, shape, s.turn)
  const claims = [...s.claims, { player: s.turn, shape }]
  return endTurn({ ...base, land, claims }, { player: s.turn, ok: true, gained, shape })
}

/**
 * 이 자리가 player의 땅인가: 집 안, 내 칸, 또는 예전에 얻은 내 도형 안(남의 칸이 아니면).
 * 도형 가장자리는 칸 중심이 바깥이라 칸으로는 안 잡히는 자리가 있어서 도형으로도 확인한다.
 */
export function ownsAt(s: Pick<State, 'land' | 'corners' | 'claims'>, player: number, p: Point): boolean {
  const owner = s.land[cellAt(p)]
  if (owner === player) return true
  if (insideHouse(s.corners[player], p)) return true
  if (owner !== -1) return false
  return s.claims.some((c) => c.player === player && insidePolygon(p.x, p.y, c.shape))
}

export const territory: GameDef<State, Move> = {
  turnSeconds: 30,

  init(order, seed) {
    const corners = cornersFor(order.length)
    // 시작하는 사람은 시드로 정하고, 그다음은 줄 선 순서대로 돈다
    const first = seed % order.length
    return {
      order,
      corners,
      land: initialLand(corners),
      claims: [],
      turn: first,
      stops: [],
      stone: houseCenter(corners[first]),
      turnsTaken: order.map(() => 0),
      out: [],
      shotNo: 0,
      lastShot: null,
      lastTurn: null,
      winners: null,
    }
  },

  turnOf: (s) => (s.winners ? null : s.order[s.turn]),

  apply(s, by, move) {
    if (s.winners || s.order.indexOf(by) !== s.turn) return null
    const { vx, vy, end } = move
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || Math.sqrt(vx * vx + vy * vy) > MAX_SPEED * 1.001) return null
    if (typeof end !== 'object' || end === null || typeof end.out !== 'boolean') return null
    if (!end.out && !(Number.isFinite(end.x) && Number.isFinite(end.y) && end.x >= 0 && end.x <= 1 && end.y >= 0 && end.y <= 1)) {
      return null
    }
    return applyFlick(s, move)
  },

  /** 시간 안에 튕기지 않으면 이번 턴은 실패로 끝난다 */
  skip: (s) =>
    s.winners ? s : endTurn(s, { player: s.turn, ok: false, gained: 0, shape: [houseCenter(s.corners[s.turn]), ...s.stops] }),

  eliminate(s, id) {
    const p = s.order.indexOf(id)
    if (s.winners || p < 0 || s.out.includes(p)) return s
    const next = { ...s, out: [...s.out, p] }
    const alive = s.order.map((_, i) => i).filter((i) => !next.out.includes(i))
    if (alive.length === 1) return { ...next, winners: alive }
    if (s.turn !== p) return next
    const t = nextTurn(next, p)
    if (t === null) return finish(next)
    return { ...next, turn: t, stops: [], stone: houseCenter(s.corners[t]) }
  },

  result: (s) => (s.winners ? { winners: s.winners.map((i) => s.order[i]) } : null),

  mount: (el, ctx) => mountTerritory(el, ctx),
}

/** 쏜 사람 화면에서 정지 위치까지 계산한다 */
export function flick(from: Point, vx: number, vy: number): Move {
  const [d] = simulate([{ x: from.x, y: from.y, owner: 0, out: false }], { id: 0, vx, vy })
  return { vx, vy, end: { x: d.x, y: d.y, out: d.out } }
}

