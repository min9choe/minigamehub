import { describe, expect, it } from 'vitest'
import { COLS, ROWS, four, type State } from '.'
import { fourBot } from './bot'

const start = (): State => ({ ...four.init(['a', 'b'], 0), turn: 0 })
const play = (s: State, cols: number[]) => cols.reduce((st, col) => four.apply(st, st.order[st.turn], { col })!, s)

describe('사목', () => {
  it('돌은 열의 맨 아래 빈칸으로 떨어진다', () => {
    const s = play(start(), [3, 3])
    expect(s.board[(ROWS - 1) * COLS + 3]).toBe(1)
    expect(s.board[(ROWS - 2) * COLS + 3]).toBe(2)
  })

  it('가득 찬 열에는 둘 수 없다', () => {
    const s = play(start(), [0, 0, 0, 0, 0, 0])
    expect(four.apply(s, s.order[s.turn], { col: 0 })).toBeNull()
  })

  it('가로·세로·대각선 4개를 이으면 이긴다', () => {
    expect(four.result(play(start(), [0, 0, 1, 1, 2, 2, 3]))).toEqual({ winners: ['a'] })
    expect(four.result(play(start(), [0, 1, 0, 1, 0, 1, 0]))).toEqual({ winners: ['a'] })
    // 오른쪽 위로 올라가는 대각선
    expect(four.result(play(start(), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]))).toEqual({ winners: ['a'] })
  })

  it('봇은 이길 수를 놓치지 않고, 상대의 이길 수를 막는다', () => {
    const s = play(start(), [0, 6, 1, 6, 2]) // a가 0,1,2 가로, 다음은 b
    expect(fourBot(s, 'b')).toEqual({ col: 3 })
    const t = play(start(), [0, 0, 1, 1, 2, 2]) // a 차례, 3이면 이긴다
    expect(fourBot(t, 'a')).toEqual({ col: 3 })
  })

  it('봇끼리 두면 판이 끝난다', () => {
    let s = four.init(['a', 'b'], 1)
    for (let i = 0; i < 50 && !four.result(s); i++) s = four.apply(s, four.turnOf(s)!, fourBot(s, four.turnOf(s)!))!
    expect(four.result(s)).not.toBeNull()
  })
})
