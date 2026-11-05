import { describe, expect, it } from 'vitest'
import { PITS, SEEDS, mancala, store, type State } from '.'
import { mancalaBot } from './bot'

const start = (): State => ({ ...mancala.init(['a', 'b'], 0), turn: 0 })

describe('만칼라', () => {
  it('씨앗을 한 알씩 뿌리고, 마지막이 내 창고면 한 번 더 한다', () => {
    const s = mancala.apply(start(), 'a', { pit: 2 })! // 4알: 3, 4, 5, 창고
    expect(s.board.slice(0, 7)).toEqual([4, 4, 0, 5, 5, 5, 1])
    expect(s.extra).toBe(true)
    expect(s.turn).toBe(0)
    const t = mancala.apply(s, 'a', { pit: 0 })! // 4알: 1, 2, 3, 4 → 차례가 넘어간다
    expect(t.turn).toBe(1)
  })

  it('상대 창고는 건너뛴다', () => {
    const s = { ...start(), board: [0, 0, 0, 0, 0, 14, 0, 1, 1, 1, 1, 1, 1, 0] }
    const t = mancala.apply(s, 'a', { pit: 5 })!
    expect(t.board[store(1)]).toBe(0)
    expect(t.board[store(0)]).toBe(2) // 14알이 한 바퀴를 돌며 내 창고를 두 번 지난다
  })

  it('비어 있던 내 구멍에 마지막 씨앗이 떨어지면 맞은편 씨앗까지 가져온다', () => {
    const s = { ...start(), board: [1, 0, 4, 4, 4, 4, 0, 4, 4, 4, 4, 7, 4, 0] }
    const t = mancala.apply(s, 'a', { pit: 0 })! // 1번 구멍(비어 있음)에 떨어진다. 맞은편은 11번(7알)
    expect(t.board[1]).toBe(0)
    expect(t.board[11]).toBe(0)
    expect(t.board[store(0)]).toBe(8)
    expect(t.captured).toEqual([1, 11])
  })

  it('한쪽이 비면 끝나고 남은 씨앗은 각자 창고로 간다', () => {
    const s = { ...start(), board: [0, 0, 0, 0, 0, 1, 10, 2, 2, 0, 0, 0, 0, 5] }
    const t = mancala.apply(s, 'a', { pit: 5 })!
    expect(t.done).toBe(true)
    expect(t.board[store(0)]).toBe(11)
    expect(t.board[store(1)]).toBe(9)
    expect(mancala.result(t)).toEqual({ winners: ['a'] })
  })

  it('씨앗 수는 늘 그대로이고, 봇끼리 두면 끝난다', () => {
    let s = mancala.init(['a', 'b'], 1)
    for (let i = 0; i < 300 && !s.done; i++) s = mancala.apply(s, s.order[s.turn], mancalaBot(s, s.order[s.turn]))!
    expect(s.done).toBe(true)
    expect(s.board.reduce((a, b) => a + b, 0)).toBe(PITS * 2 * SEEDS)
  })
})
