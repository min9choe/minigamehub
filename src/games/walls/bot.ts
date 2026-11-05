// 벽 쌓기 연습 봇: 상대가 나보다 목표에 가까우면 상대 길을 가장 많이 늘리는 벽을 놓고, 아니면 가장 짧은 길로 한 칸 간다.
import { GOALS, legalPawnMoves, legalWall, type Move, type State } from '.'
import { N, distanceMap, distanceToGoal, type Wall } from './rules'

export function wallsBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const them = 1 - me
  const myDist = distanceToGoal(s.walls, s.pawns[me], GOALS[me])
  const theirDist = distanceToGoal(s.walls, s.pawns[them], GOALS[them])

  // 상대가 앞서거나 곧 도착하면 벽으로 막는다
  if (s.left[me] > 0 && (theirDist < myDist || theirDist <= 2)) {
    let best: { w: Wall; gain: number } | null = null
    for (let y = 0; y < N - 1; y++) {
      for (let x = 0; x < N - 1; x++) {
        for (const o of ['h', 'v'] as const) {
          const w: Wall = { x, y, o }
          if (!legalWall(s, w)) continue
          const next = [...s.walls, w]
          // 상대 길이 늘어난 만큼에서 내 길이 늘어난 만큼을 뺀다
          const gain =
            distanceToGoal(next, s.pawns[them], GOALS[them]) - theirDist - (distanceToGoal(next, s.pawns[me], GOALS[me]) - myDist) + random() * 0.1
          if (!best || gain > best.gain) best = { w, gain }
        }
      }
    }
    if (best && best.gain >= 1) return { kind: 'wall', ...best.w }
  }

  const dist = distanceMap(s.walls, GOALS[me])
  const moves = legalPawnMoves(s, me)
  const to = moves.reduce((a, b) => (dist[b] + random() * 0.1 < dist[a] ? b : a), moves[0])
  return { kind: 'move', to }
}
