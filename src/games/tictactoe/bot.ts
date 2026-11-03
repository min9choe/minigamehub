// 틱택토 연습 봇(기획안 3장 '연습 모드'). 완벽하게 두면 승부가 끝나지 않으므로 가끔 실수한다.
// 4번째 표시를 두면 가장 오래된 표시가 사라지는 규칙을 반영해 '두고 난 뒤의 판'으로 따진다.
import { boardAfter, findLine, type Move, type State } from '.'

const MISTAKE = 0.2

export function tictactoeBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const opp = 1 - me
  const empty = s.board.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0)
  const pick = (cells: number[]) => cells[Math.floor(random() * cells.length)]
  const wins = (player: number) => empty.filter((i) => findLine(boardAfter(s, player, i)) !== null)

  if (random() < MISTAKE) return { cell: pick(empty) }
  // 이길 수 있으면 이기고, 상대가 다음에 이길 자리는 막고, 가운데와 모서리를 좋아한다
  const win = wins(me)
  if (win.length) return { cell: pick(win) }
  const block = wins(opp)
  if (block.length) return { cell: pick(block) }
  if (s.board[4] === 0) return { cell: 4 }
  const corners = [0, 2, 6, 8].filter((i) => s.board[i] === 0)
  return { cell: pick(corners.length ? corners : empty) }
}
