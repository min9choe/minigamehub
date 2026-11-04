// 리버시 연습 봇: 모서리를 가장 좋아하고, 빈 모서리 옆 칸은 피하며, 나머지는 많이 뒤집는 수를 고른다.
import { N, colorOf, flipsFor, legalMoves, type Move, type State } from '.'

const CORNERS = [0, N - 1, N * (N - 1), N * N - 1]
/** 빈 모서리 바로 옆(상대에게 모서리를 내주기 쉬운 자리) */
const NEAR_CORNER: Record<number, number[]> = {
  0: [1, N, N + 1],
  [N - 1]: [N - 2, 2 * N - 1, 2 * N - 2],
  [N * (N - 1)]: [N * (N - 2), N * (N - 1) + 1, N * (N - 2) + 1],
  [N * N - 1]: [N * N - 2, N * (N - 1) - 1, N * (N - 1) - 2],
}

export function reversiBot(s: State, botId: string, random = Math.random): Move {
  const color = colorOf(s, s.order.indexOf(botId))
  const moves = legalMoves(s.board, color)
  const value = (m: number) => {
    if (CORNERS.includes(m)) return 100
    const risky = Object.entries(NEAR_CORNER).some(([c, near]) => s.board[Number(c)] === 0 && near.includes(m))
    const edge = m % N === 0 || m % N === N - 1 || m < N || m >= N * (N - 1)
    return flipsFor(s.board, m, color).length + (edge ? 3 : 0) - (risky ? 20 : 0) + random()
  }
  const scored = moves.map((m) => ({ m, v: value(m) }))
  return { cell: scored.reduce((a, b) => (b.v > a.v ? b : a)).m }
}
