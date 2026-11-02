// 틱택토 연습 봇(기획안 3장 '연습 모드'). 완벽하게 두면 무승부만 반복되므로 가끔 실수한다.
import { findLine, markOf, type Cell, type Move, type State } from '.'

const MISTAKE = 0.2

export function tictactoeBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const mine = markOf(s, me)
  const theirs: Cell = mine === 1 ? 2 : 1
  const empty = s.board.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0)
  const pick = (cells: number[]) => cells[Math.floor(random() * cells.length)]
  const completes = (mark: Cell) =>
    empty.filter((i) => {
      const b = [...s.board]
      b[i] = mark
      return findLine(b) !== null
    })

  if (random() < MISTAKE) return { cell: pick(empty) }
  // 이길 수 있으면 이기고, 막아야 하면 막고, 가운데와 모서리를 좋아한다
  const win = completes(mine)
  if (win.length) return { cell: pick(win) }
  const block = completes(theirs)
  if (block.length) return { cell: pick(block) }
  if (s.board[4] === 0) return { cell: 4 }
  const corners = [0, 2, 6, 8].filter((i) => s.board[i] === 0)
  return { cell: pick(corners.length ? corners : empty) }
}
