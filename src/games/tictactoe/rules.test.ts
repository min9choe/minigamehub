import { describe, expect, it } from 'vitest'
import { MAX_MARKS, fadingCell, tictactoe, type State } from '.'

// seed 0: p0이 X로 선공
const start = (): State => tictactoe.init(['p0', 'p1'], 0)
const play = (s: State, ...cells: number[]) =>
  cells.reduce<State>((st, cell) => {
    const next = tictactoe.apply(st, tictactoe.turnOf(st)!, { cell })
    if (!next) throw new Error(`둘 수 없는 자리: ${cell}`)
    return next
  }, s)

describe('틱택토: 표시는 3개까지', () => {
  it('4번째를 놓으면 가장 먼저 놓은 표시가 사라진다', () => {
    // X: 0, 4, 8? 은 줄이 되므로 0, 1, 5로 두고 O는 3, 6, 7
    let s = play(start(), 0, 3, 1, 6, 5, 7)
    expect(s.board.filter((c) => c === 1)).toHaveLength(MAX_MARKS)
    expect(fadingCell(s, 0)).toBe(0)
    s = play(s, 8) // X의 4번째
    expect(s.board[0]).toBe(0)
    expect(s.board[8]).toBe(1)
    expect(s.board.filter((c) => c === 1)).toHaveLength(MAX_MARKS)
  })

  it('사라지는 표시로는 줄을 만들 수 없다', () => {
    // X가 0, 1, 5에 있고 2를 두면 0이 먼저 사라지므로 0-1-2 줄이 아니다
    let s = play(start(), 0, 3, 1, 6, 5, 7)
    s = play(s, 2)
    expect(s.wins).toEqual([0, 0])
    expect(s.board[0]).toBe(0)
  })

  it('표시가 사라진 칸에는 다시 둘 수 있다', () => {
    let s = play(start(), 0, 3, 1, 6, 5, 7, 8)
    expect(tictactoe.apply(s, 'p1', { cell: 0 })).not.toBeNull()
  })

  it('판이 차지 않으므로 무승부가 없고, 아무렇게나 둬도 결국 누군가 이긴다', () => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    let s = start()
    for (let i = 0; i < 5000 && !tictactoe.result(s); i++) {
      expect(s.board.filter((c) => c !== 0).length).toBeLessThanOrEqual(MAX_MARKS * 2)
      const empty = s.board.map((c, k) => (c === 0 ? k : -1)).filter((k) => k >= 0)
      s = play(s, empty[Math.floor(random() * empty.length)])
    }
    expect(tictactoe.result(s)).not.toBeNull()
    expect(Math.max(...s.wins)).toBe(2)
  })

  it('판을 이기면 다음 판은 비어 있고 기록도 새로 시작한다', () => {
    const s = play(start(), 0, 3, 1, 4, 2) // X가 윗줄
    expect(s.wins).toEqual([1, 0])
    expect(s.board.every((c) => c === 0)).toBe(true)
    expect(s.history).toEqual([[], []])
  })
})
