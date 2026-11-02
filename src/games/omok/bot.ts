// 오목 연습 봇: 놓을 만한 자리마다 '내가 두면 얼마나 좋은지(공격)'와 '상대가 두면 얼마나 위험한지(수비)'를 점수로 매겨
// 가장 높은 자리에 둔다. 흑일 때는 3-3 금수 자리를 피한다. 깊이 읽지 않으므로 사람이 충분히 이길 수 있다.
import type { Move, State } from '.'
import { BLACK, EMPTY, N, WHITE, idx, isForbidden, type Stone } from './rules'

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

/** p에 color를 놓았다고 칠 때 한 방향으로 이어지는 개수와 열린 끝 수에 따른 점수 */
function lineScore(b: Stone[], x: number, y: number, dx: number, dy: number, color: Stone): number {
  let count = 1
  let open = 0
  for (const sign of [1, -1]) {
    let k = 1
    while (true) {
      const nx = x + dx * k * sign
      const ny = y + dy * k * sign
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) break
      const c = b[idx(nx, ny)]
      if (c === color) {
        count++
        k++
        continue
      }
      if (c === EMPTY) open++
      break
    }
  }
  if (count >= 5) return 1_000_000
  if (open === 0) return 0
  const table: Record<number, [number, number]> = { 4: [5_000, 50_000], 3: [400, 4_000], 2: [30, 300], 1: [2, 10] }
  return table[count][open - 1]
}

function score(b: Stone[], x: number, y: number, color: Stone) {
  return DIRS.reduce((sum, [dx, dy]) => sum + lineScore(b, x, y, dx, dy, color), 0)
}

export function omokBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const mine: Stone = me === s.black ? BLACK : WHITE
  const theirs: Stone = mine === BLACK ? WHITE : BLACK
  if (!s.stones.includes(BLACK) && !s.stones.includes(WHITE)) return { x: 7, y: 7 }

  let best: { p: number; v: number }[] = []
  for (let p = 0; p < N * N; p++) {
    if (s.stones[p] !== EMPTY) continue
    const x = p % N
    const y = Math.floor(p / N)
    // 돌 근처(2칸 안)만 살펴본다
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy++)
      for (let dx = -2; dx <= 2 && !near; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && nx < N && ny >= 0 && ny < N && s.stones[idx(nx, ny)] !== EMPTY) near = true
      }
    if (!near) continue
    if (mine === BLACK && isForbidden(s.stones, p)) continue
    // 같은 점수면 공격을 조금 더 높게 친다. 작은 난수로 매번 같은 수만 두지 않게 한다
    const v = score(s.stones, x, y, mine) * 1.1 + score(s.stones, x, y, theirs) + random()
    if (!best.length || v > best[0].v) best = [{ p, v }]
  }
  const p = best[0]?.p ?? s.stones.indexOf(EMPTY)
  return { x: p % N, y: Math.floor(p / N) }
}
