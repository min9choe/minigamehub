// 사목 연습 봇: 이기는 수 > 막는 수 > 상대에게 이길 자리를 내주지 않는 수 중 가운데에 가까운 열.
import { COLS, dropRow, four, lineAt, type Move, type State } from '.'

function winsAt(s: State, col: number, who: number): boolean {
  const row = dropRow(s.board, col)
  if (row < 0) return false
  const board = [...s.board]
  board[row * COLS + col] = (who + 1) as 1 | 2
  return !!lineAt(board, row * COLS + col)
}

export function fourBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const them = 1 - me
  const cols = [...Array(COLS).keys()].filter((c) => dropRow(s.board, c) >= 0)
  const win = cols.find((c) => winsAt(s, c, me))
  if (win !== undefined) return { col: win }
  const block = cols.find((c) => winsAt(s, c, them))
  if (block !== undefined) return { col: block }
  // 내가 두고 나면 상대가 바로 그 위에 두어 이기는 열은 피한다
  const safe = cols.filter((c) => {
    const next = four.apply(s, botId, { col: c })!
    return ![...Array(COLS).keys()].some((k) => winsAt({ ...next, turn: them }, k, them))
  })
  const pool = safe.length ? safe : cols
  const value = (c: number) => -Math.abs(c - 3) + random() * 1.5
  return { col: pool.reduce((a, b) => (value(b) > value(a) ? b : a)) }
}
