// 벽 쌓기 판정. 화면과 분리해 테스트한다(rules.test.ts).
//
// 판: 9×9 칸. 칸 번호는 y * N + x, y=0이 위쪽 끝줄이다.
// 벽: 두 칸 길이. 칸 사이 홈의 교차점(x, y)(0~7)을 가운데로 두고 가로(h) 또는 세로(v)로 놓는다.
// - 가로 벽 (x, y): y줄과 y+1줄 사이를 x, x+1 두 칸 폭만큼 막는다.
// - 세로 벽 (x, y): x칸과 x+1칸 사이를 y, y+1 두 줄 높이만큼 막는다.
// 벽끼리는 겹치거나 같은 교차점에서 십자로 엇갈릴 수 없고, 누구든 목표 줄로 가는 길이 하나는 남아 있어야 한다.

export const N = 9
export type Wall = { x: number; y: number; o: 'h' | 'v' }

export const cellOf = (x: number, y: number) => y * N + x
export const xy = (c: number) => [c % N, Math.floor(c / N)] as const

/** 이웃한 두 칸 사이가 벽으로 막혔나 */
export function blocked(walls: Wall[], a: number, b: number): boolean {
  const [ax, ay] = xy(a)
  const [bx, by] = xy(b)
  if (ay === by) {
    // 좌우 이동: 세로 벽이 x = min, 줄 y 또는 y-1에 있으면 막힌다
    const x = Math.min(ax, bx)
    return walls.some((w) => w.o === 'v' && w.x === x && (w.y === ay || w.y === ay - 1))
  }
  const y = Math.min(ay, by)
  return walls.some((w) => w.o === 'h' && w.y === y && (w.x === ax || w.x === ax - 1))
}

const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const

/** 벽만 보고 갈 수 있는 이웃 칸(말은 무시) */
export function neighbors(walls: Wall[], c: number): number[] {
  const [x, y] = xy(c)
  const out: number[] = []
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue
    const n = cellOf(nx, ny)
    if (!blocked(walls, c, n)) out.push(n)
  }
  return out
}

/** 목표 줄까지 남은 걸음 수(말은 무시). 길이 없으면 Infinity */
export function distanceToGoal(walls: Wall[], from: number, goalRow: number): number {
  const dist = new Map<number, number>([[from, 0]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]
    const d = dist.get(c)!
    if (xy(c)[1] === goalRow) return d
    for (const n of neighbors(walls, c)) {
      if (dist.has(n)) continue
      dist.set(n, d + 1)
      queue.push(n)
    }
  }
  return Infinity
}

/** 칸마다 목표 줄까지 남은 걸음 수(말은 무시). 봇이 길을 고를 때 쓴다 */
export function distanceMap(walls: Wall[], goalRow: number): number[] {
  const dist = Array(N * N).fill(Infinity)
  const queue: number[] = []
  for (let x = 0; x < N; x++) {
    dist[cellOf(x, goalRow)] = 0
    queue.push(cellOf(x, goalRow))
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i]
    for (const n of neighbors(walls, c)) {
      if (dist[n] !== Infinity) continue
      dist[n] = dist[c] + 1
      queue.push(n)
    }
  }
  return dist
}

/**
 * 말이 갈 수 있는 칸. 상대 말이 바로 옆이면 넘어서 한 칸 더 간다.
 * 넘어갈 자리가 벽이나 판 끝으로 막혀 있으면 상대 말 옆(대각선)으로 비켜 간다.
 */
export function pawnMoves(walls: Wall[], me: number, other: number): number[] {
  const [x, y] = xy(me)
  const out: number[] = []
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue
    const n = cellOf(nx, ny)
    if (blocked(walls, me, n)) continue
    if (n !== other) {
      out.push(n)
      continue
    }
    const jx = nx + dx
    const jy = ny + dy
    const straight = jx >= 0 && jx < N && jy >= 0 && jy < N ? cellOf(jx, jy) : -1
    if (straight >= 0 && !blocked(walls, n, straight)) {
      out.push(straight)
      continue
    }
    // 옆으로 비켜 가기: 진행 방향에 수직인 두 방향
    for (const [sx, sy] of [
      [dy, dx],
      [-dy, -dx],
    ]) {
      const ex = nx + sx
      const ey = ny + sy
      if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue
      const e = cellOf(ex, ey)
      if (!blocked(walls, n, e) && e !== me) out.push(e)
    }
  }
  return out
}

const inRange = (w: Wall) =>
  Number.isInteger(w.x) && Number.isInteger(w.y) && w.x >= 0 && w.x < N - 1 && w.y >= 0 && w.y < N - 1 && (w.o === 'h' || w.o === 'v')

/** 다른 벽과 겹치거나 엇갈리지 않는가(길이 막히는지는 따로 본다) */
export function fits(walls: Wall[], w: Wall): boolean {
  if (!inRange(w)) return false
  return !walls.some(
    (o) =>
      (o.x === w.x && o.y === w.y) || // 같은 교차점: 같은 벽이거나 십자로 엇갈림
      (w.o === 'h' && o.o === 'h' && o.y === w.y && Math.abs(o.x - w.x) === 1) ||
      (w.o === 'v' && o.o === 'v' && o.x === w.x && Math.abs(o.y - w.y) === 1)
  )
}

/** 벽을 놓을 수 있나: 겹치지 않고, 두 사람 모두 목표 줄로 가는 길이 남는다 */
export function canPlace(walls: Wall[], w: Wall, pawns: number[], goals: number[]): boolean {
  if (!fits(walls, w)) return false
  const next = [...walls, w]
  return pawns.every((p, i) => distanceToGoal(next, p, goals[i]) < Infinity)
}
