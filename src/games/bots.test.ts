import { describe, expect, it } from 'vitest'
import { omok, type State as OmokState } from './omok'
import { omokBot } from './omok/bot'
import { BLACK, WHITE, idx, isForbidden } from './omok/rules'
import { tictactoe } from './tictactoe'
import { tictactoeBot } from './tictactoe/bot'

const noMistake = () => 0.5 // 실수 확률(0.2)보다 커서 늘 제대로 둔다

describe('틱택토 봇', () => {
  // seed 0: 0번(p)이 X로 선공, 봇은 O
  const base = tictactoe.init(['p', 'bot'], 0)

  it('이길 수 있으면 이긴다', () => {
    const s = { ...base, board: [2, 2, 0, 1, 1, 0, 0, 0, 0] as (0 | 1 | 2)[], turn: 1 }
    expect(tictactoeBot(s, 'bot', noMistake)).toEqual({ cell: 2 })
  })

  it('상대가 이기려 하면 막는다', () => {
    const s = { ...base, board: [1, 1, 0, 0, 2, 0, 0, 0, 0] as (0 | 1 | 2)[], turn: 1 }
    expect(tictactoeBot(s, 'bot', noMistake)).toEqual({ cell: 2 })
  })

  it('봇의 수는 언제나 규칙에 맞다', () => {
    let s = base
    for (let i = 0; i < 200 && !tictactoe.result(s); i++) {
      const who = tictactoe.turnOf(s)!
      const next = tictactoe.apply(s, who, tictactoeBot(s, who))
      expect(next).not.toBeNull()
      s = next!
    }
    expect(tictactoe.result(s)).not.toBeNull()
  })
})

describe('오목 봇', () => {
  const place = (s: OmokState, cells: [number, number, 1 | 2][]) => {
    const stones = [...s.stones]
    for (const [x, y, c] of cells) stones[idx(x, y)] = c
    return { ...s, stones }
  }
  // seed 0: 0번이 흑. 봇을 1번(백)으로 둔다
  const base = omok.init(['p', 'bot'], 0)

  it('다섯을 만들 수 있으면 만든다', () => {
    const s = place({ ...base, toMove: WHITE }, [
      [3, 3, WHITE], [4, 3, WHITE], [5, 3, WHITE], [6, 3, WHITE],
      [3, 5, BLACK], [4, 5, BLACK], [5, 5, BLACK], [9, 9, BLACK],
    ])
    const m = omokBot(s, 'bot', noMistake)
    expect([idx(2, 3), idx(7, 3)]).toContain(idx(m.x, m.y))
  })

  it('상대의 열린 4를 막는다', () => {
    const s = place({ ...base, toMove: WHITE }, [
      [3, 5, BLACK], [4, 5, BLACK], [5, 5, BLACK], [6, 5, BLACK],
      [10, 10, WHITE], [11, 11, WHITE],
    ])
    const m = omokBot(s, 'bot', noMistake)
    expect([idx(2, 5), idx(7, 5)]).toContain(idx(m.x, m.y))
  })

  it('흑일 때 3-3 금수 자리에는 두지 않는다', () => {
    // 봇이 흑(0번). (7,7)이 3-3 금수가 되는 배치
    let s: OmokState = { ...omok.init(['bot', 'p'], 0), toMove: BLACK }
    s = place(s, [[7, 5, BLACK], [7, 6, BLACK], [8, 7, BLACK], [9, 7, BLACK], [0, 0, WHITE], [1, 0, WHITE], [2, 0, WHITE], [3, 0, WHITE]])
    expect(isForbidden(s.stones, idx(7, 7))).toBe(true)
    for (let i = 0; i < 20; i++) {
      const m = omokBot(s, 'bot')
      expect(omok.apply(s, 'bot', m)).not.toBeNull()
    }
  })
})
