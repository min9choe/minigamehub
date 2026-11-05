// 체커 연습 봇: 몇 수 앞까지 말 수(왕은 1.6개)를 비교해 고른다. 연속 잡기는 같은 사람이 이어서 두는 수로 본다.
import { legalSteps, ownerOf, step, type Move, type State } from '.'

const DEPTH = 4

function material(s: State, me: number): number {
  if (s.done) return s.winner === me ? 100 : s.winner === null ? 0 : -100
  let v = 0
  for (const c of s.board) {
    if (!c) continue
    const w = c === 2 || c === 4 ? 1.6 : 1
    v += ownerOf(c) === me ? w : -w
  }
  return v
}

function search(s: State, me: number, depth: number): number {
  if (s.done || depth === 0) return material(s, me)
  const values = legalSteps(s).map((m) => {
    const next = step(s, m)!
    return search(next, me, next.turn === s.turn ? depth : depth - 1)
  })
  return s.turn === me ? Math.max(...values) : Math.min(...values)
}

export function checkersBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  let best: Move | null = null
  let bestV = -Infinity
  for (const m of legalSteps(s)) {
    const next = step(s, m)!
    // 앞으로 나아가는 것을 조금 좋아한다(왕이 되기 위해)
    const ahead = me === 0 ? -(m.to - m.from) : m.to - m.from
    const v = search(next, me, next.turn === me ? DEPTH : DEPTH - 1) + ahead * 0.002 + random() * 0.1
    if (v > bestV) {
      bestV = v
      best = { from: m.from, to: m.to }
    }
  }
  return best!
}
