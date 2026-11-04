// 윷놀이 연습 봇: 던질 차례면 던지고, 옮길 때는 잡을 수 있는 수 > 완주 > 가장 앞선 말 > 새 말 순으로 고른다.
import { canUse, type Move, type State } from '.'
import { moved, nodeOf } from './rules'

export function yutBot(s: State, botId: string): Move {
  if (s.phase === 'throw') return { kind: 'throw' }
  const me = s.order.indexOf(botId)
  const mine = s.pieces[me]
  const enemyNodes = new Set(s.pieces.flatMap((ps, p) => (p === me ? [] : ps.map(nodeOf))).filter((n) => n !== null))
  let best: { move: Move; v: number } | null = null
  s.pending.forEach((value, use) => {
    if (!canUse(mine, value)) return
    mine.forEach((pc, piece) => {
      const d = moved(pc, value)
      if (!d || d === pc) return
      const node = nodeOf(d)
      const v = (node !== null && enemyNodes.has(node) ? 100 : 0) + (d.done ? 50 : 0) + (pc.started ? d.idx : 5) + value
      if (!best || v > best.v) best = { move: { kind: 'move', piece, use }, v }
    })
  })
  return best ? (best as { move: Move }).move : { kind: 'move', piece: 0, use: 0 }
}
