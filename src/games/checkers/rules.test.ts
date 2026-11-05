import { describe, expect, it } from 'vitest'
import { N, checkers, legalSteps, type Cell, type State } from '.'
import { checkersBot } from './bot'

const C = (x: number, y: number) => y * N + x
const empty = (): State => ({ ...checkers.init(['a', 'b'], 0), board: Array(N * N).fill(0), turn: 0 })
const put = (s: State, pieces: [number, number, Cell][]): State => {
  const board = [...s.board]
  for (const [x, y, v] of pieces) board[C(x, y)] = v
  return { ...s, board }
}

describe('체커', () => {
  it('처음에는 각자 12개, 앞쪽 대각선으로만 움직인다', () => {
    const s = { ...checkers.init(['a', 'b'], 0), turn: 0 }
    expect(s.board.filter((v) => v === 1)).toHaveLength(12)
    expect(s.board.filter((v) => v === 3)).toHaveLength(12)
    expect(legalSteps(s)).toHaveLength(7)
    expect(legalSteps(s).every((m) => m.to < m.from)).toBe(true)
  })

  it('잡을 수 있으면 반드시 잡아야 한다', () => {
    const s = put(empty(), [
      [2, 5, 1],
      [3, 4, 3],
      [6, 5, 1],
      [0, 0, 3],
    ])
    const steps = legalSteps(s)
    expect(steps).toEqual([{ from: C(2, 5), to: C(4, 3), captured: C(3, 4) }])
  })

  it('잡은 말이 또 잡을 수 있으면 같은 말로 이어서 잡는다', () => {
    let s = put(empty(), [
      [1, 6, 1],
      [2, 5, 3],
      [4, 3, 3],
      [7, 0, 3],
    ])
    s = checkers.apply(s, 'a', { from: C(1, 6), to: C(3, 4) })!
    expect(s.turn).toBe(0)
    expect(s.chain).toBe(C(3, 4))
    s = checkers.apply(s, 'a', { from: C(3, 4), to: C(5, 2) })!
    expect(s.turn).toBe(1)
    expect(s.board.filter((v) => v === 3)).toHaveLength(1)
  })

  it('끝줄에 닿으면 왕이 되어 뒤로도 움직인다', () => {
    let s = put(empty(), [
      [1, 1, 1],
      [6, 6, 3],
    ])
    s = checkers.apply(s, 'a', { from: C(1, 1), to: C(0, 0) })!
    expect(s.board[C(0, 0)]).toBe(2)
    s = checkers.apply(s, 'b', { from: C(6, 6), to: C(5, 7) })!
    expect(s.board[C(5, 7)]).toBe(4)
    expect(legalSteps(s).map((m) => m.to)).toContain(C(1, 1))
  })

  it('상대 말을 모두 잡으면 이긴다', () => {
    const s = put(empty(), [
      [2, 5, 1],
      [3, 4, 3],
    ])
    const t = checkers.apply(s, 'a', { from: C(2, 5), to: C(4, 3) })!
    expect(checkers.result(t)).toEqual({ winners: ['a'] })
  })

  it('봇끼리 두면 판이 끝난다', () => {
    let s = checkers.init(['a', 'b'], 1)
    for (let i = 0; i < 400 && !s.done; i++) s = checkers.apply(s, s.order[s.turn], checkersBot(s, s.order[s.turn]))!
    expect(s.done).toBe(true)
  })
})
