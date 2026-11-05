import { describe, expect, it } from 'vitest'
import { GOALS, WALLS_EACH, walls as game, type State } from '.'
import { wallsBot } from './bot'
import { N, blocked, canPlace, cellOf, distanceToGoal, fits, pawnMoves, type Wall } from './rules'

const C = cellOf

describe('벽과 이동', () => {
  it('가로 벽은 두 칸 폭만큼 위아래를 막는다', () => {
    const w: Wall[] = [{ x: 3, y: 4, o: 'h' }]
    expect(blocked(w, C(3, 4), C(3, 5))).toBe(true)
    expect(blocked(w, C(4, 4), C(4, 5))).toBe(true)
    expect(blocked(w, C(5, 4), C(5, 5))).toBe(false)
    expect(blocked(w, C(3, 4), C(4, 4))).toBe(false)
  })

  it('세로 벽은 두 줄 높이만큼 좌우를 막는다', () => {
    const w: Wall[] = [{ x: 3, y: 4, o: 'v' }]
    expect(blocked(w, C(3, 4), C(4, 4))).toBe(true)
    expect(blocked(w, C(3, 5), C(4, 5))).toBe(true)
    expect(blocked(w, C(3, 6), C(4, 6))).toBe(false)
  })

  it('벽은 겹치거나 십자로 엇갈릴 수 없다', () => {
    const w: Wall[] = [{ x: 3, y: 4, o: 'h' }]
    expect(fits(w, { x: 3, y: 4, o: 'v' })).toBe(false)
    expect(fits(w, { x: 4, y: 4, o: 'h' })).toBe(false)
    expect(fits(w, { x: 5, y: 4, o: 'h' })).toBe(true)
    expect(fits(w, { x: 4, y: 4, o: 'v' })).toBe(true)
    expect(fits(w, { x: 8, y: 0, o: 'h' })).toBe(false)
  })

  it('길을 완전히 막는 벽은 놓을 수 없다', () => {
    // 0번 말(4,8)의 좌우를 세로 벽으로 막아 두면, 위쪽을 가로로 덮는 벽은 0번을 가둔다
    const w: Wall[] = [
      { x: 3, y: 7, o: 'v' },
      { x: 4, y: 7, o: 'v' },
    ]
    const pawns = [C(4, 8), C(4, 0)]
    expect(canPlace(w, { x: 3, y: 6, o: 'h' }, pawns, GOALS)).toBe(false)
    expect(canPlace(w, { x: 3, y: 5, o: 'h' }, pawns, GOALS)).toBe(true)
    expect(distanceToGoal([...w, { x: 3, y: 6, o: 'h' }], pawns[0], 0)).toBe(Infinity)
  })

  it('상대 말이 바로 앞이면 넘어가고, 뒤가 막히면 옆으로 비켜 간다', () => {
    expect(pawnMoves([], C(4, 5), C(4, 4))).toEqual(expect.arrayContaining([C(4, 3)]))
    expect(pawnMoves([], C(4, 5), C(4, 4))).not.toContain(C(4, 4))
    const wall: Wall[] = [{ x: 4, y: 3, o: 'h' }] // (4,4) 위를 막는다
    const m = pawnMoves(wall, C(4, 5), C(4, 4))
    expect(m).toEqual(expect.arrayContaining([C(3, 4), C(5, 4)]))
    expect(m).not.toContain(C(4, 3))
  })
})

describe('판 진행', () => {
  const start = (): State => ({ ...game.init(['a', 'b'], 0), turn: 0 })

  it('벽을 놓으면 남은 벽이 줄고 차례가 넘어간다', () => {
    const s = game.apply(start(), 'a', { kind: 'wall', x: 3, y: 3, o: 'h' })!
    expect(s.left).toEqual([WALLS_EACH - 1, WALLS_EACH])
    expect(s.turn).toBe(1)
    expect(game.apply(s, 'b', { kind: 'wall', x: 3, y: 3, o: 'v' })).toBeNull()
  })

  it('벽을 다 쓰면 더 놓을 수 없다', () => {
    const s = { ...start(), left: [0, WALLS_EACH] }
    expect(game.apply(s, 'a', { kind: 'wall', x: 0, y: 0, o: 'h' })).toBeNull()
  })

  it('상대 쪽 끝줄에 닿으면 이긴다', () => {
    const s = { ...start(), pawns: [C(2, 1), C(6, 6)] }
    const won = game.apply(s, 'a', { kind: 'move', to: C(2, 0) })!
    expect(game.result(won)).toEqual({ winners: ['a'] })
  })

  it('봇끼리 두면 결국 누군가 이긴다', () => {
    let s = game.init(['a', 'b'], 3)
    for (let i = 0; i < 400 && s.winner === null; i++) {
      const who = game.turnOf(s)!
      s = game.apply(s, who, wallsBot(s, who)) ?? game.skip(s)
    }
    expect(s.winner).not.toBeNull()
    expect(s.pawns.every((p) => p >= 0 && p < N * N)).toBe(true)
  })
})
