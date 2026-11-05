// 만칼라 연습 봇: 몇 수 앞까지 내 창고와 상대 창고의 차이를 보고 고른다(한 번 더 하는 수는 같은 사람이 이어서 둔다).
import { pitsOf, sow, store, type Move, type State } from '.'

const DEPTH = 4

function search(s: State, me: number, depth: number): number {
  if (s.done || depth === 0) return s.board[store(me)] - s.board[store(1 - me)]
  const options = pitsOf(s.turn).filter((p) => s.board[p] > 0)
  const values = options.map((p) => {
    const next = sow(s, p)!
    return search(next, me, next.turn === s.turn ? depth : depth - 1)
  })
  return s.turn === me ? Math.max(...values) : Math.min(...values)
}

export function mancalaBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const options = pitsOf(me).filter((p) => s.board[p] > 0)
  let best = options[0]
  let bestV = -Infinity
  for (const p of options) {
    const next = sow(s, p)!
    const v = search(next, me, next.turn === me ? DEPTH : DEPTH - 1) + random() * 0.5
    if (v > bestV) {
      bestV = v
      best = p
    }
  }
  return { pit: best }
}
