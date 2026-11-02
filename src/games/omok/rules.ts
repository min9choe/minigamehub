// 오목 판정(기획안 4장). 화면과 분리해 테스트 배치로 검증한다(rules.test.ts).
//
// - 가로·세로·대각선으로 같은 색 5개 이상을 이으면 승리. 6목 이상도 승리로 본다.
// - 흑만 3-3 금수: 한 수로 '열린 3'을 동시에 2개 이상 만드는 자리는 둘 수 없다. 그 수로 5목이 되면 예외로 허용한다.
// - 열린 3: 한 수를 더 두면 '열린 4'(양쪽 끝이 비어 있는 연속 4개)가 되는 3. 4-4와 4-3은 금지하지 않는다.
// - 열린 4를 만드는 그 한 수가 다시 금수인지는 따지지 않는다(기획안 범위를 단순하게 유지).

export const N = 15
export const EMPTY = 0
export const BLACK = 1
export const WHITE = 2
export type Stone = 0 | 1 | 2

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const

export const idx = (x: number, y: number) => y * N + x
const inside = (x: number, y: number) => x >= 0 && x < N && y >= 0 && y < N

/** p를 지나는 dir 방향의 같은 색 연속 구간 [시작, 끝](p에서 몇 칸 떨어졌는지) */
function runThrough(b: Stone[], p: number, dx: number, dy: number, color: Stone): [number, number] {
  const x = p % N
  const y = Math.floor(p / N)
  let back = 0
  while (inside(x - (back + 1) * dx, y - (back + 1) * dy) && b[idx(x - (back + 1) * dx, y - (back + 1) * dy)] === color) back++
  let fwd = 0
  while (inside(x + (fwd + 1) * dx, y + (fwd + 1) * dy) && b[idx(x + (fwd + 1) * dx, y + (fwd + 1) * dy)] === color) fwd++
  return [-back, fwd]
}

/** p에 놓인 돌로 5목 이상이 되었으면 그 줄의 칸들 */
export function fiveLine(b: Stone[], p: number): number[] | null {
  const color = b[p]
  if (color === EMPTY) return null
  const x = p % N
  const y = Math.floor(p / N)
  for (const [dx, dy] of DIRS) {
    const [from, to] = runThrough(b, p, dx, dy, color)
    if (to - from + 1 >= 5) {
      const cells: number[] = []
      for (let k = from; k <= to; k++) cells.push(idx(x + k * dx, y + k * dy))
      return cells
    }
  }
  return null
}

/** p를 지나는 dir 방향에 흑 연속 4개가 있고 양쪽 끝이 판 안의 빈칸인가 */
function openFourThrough(b: Stone[], p: number, dx: number, dy: number): boolean {
  const [from, to] = runThrough(b, p, dx, dy, BLACK)
  if (to - from + 1 !== 4) return false
  const x = p % N
  const y = Math.floor(p / N)
  const [ax, ay] = [x + (from - 1) * dx, y + (from - 1) * dy]
  const [bx, by] = [x + (to + 1) * dx, y + (to + 1) * dy]
  return inside(ax, ay) && inside(bx, by) && b[idx(ax, ay)] === EMPTY && b[idx(bx, by)] === EMPTY
}

/** 흑돌 p가 dir 방향으로 열린 3을 이루는가. b에는 이미 p가 놓여 있다 */
function isOpenThree(b: Stone[], p: number, dx: number, dy: number): boolean {
  // 이미 4개가 이어졌으면 3이 아니라 4다
  const [from, to] = runThrough(b, p, dx, dy, BLACK)
  if (to - from + 1 >= 4) return false
  const x = p % N
  const y = Math.floor(p / N)
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue
    const qx = x + k * dx
    const qy = y + k * dy
    if (!inside(qx, qy) || b[idx(qx, qy)] !== EMPTY) continue
    const q = idx(qx, qy)
    b[q] = BLACK
    const open = openFourThrough(b, p, dx, dy)
    b[q] = EMPTY
    if (open) return true
  }
  return false
}

/** 흑이 p에 두면 3-3 금수인가 */
export function isForbidden(board: Stone[], p: number): boolean {
  if (board[p] !== EMPTY) return false
  const b = [...board]
  b[p] = BLACK
  if (fiveLine(b, p)) return false // 5목이 완성되면 허용
  let threes = 0
  for (const [dx, dy] of DIRS) {
    if (isOpenThree(b, p, dx, dy) && ++threes >= 2) return true
  }
  return false
}

/** 흑 차례에 X로 표시할 금수 자리. 흑돌 근처만 살펴본다 */
export function forbiddenPoints(board: Stone[]): number[] {
  const near = new Set<number>()
  for (let p = 0; p < N * N; p++) {
    if (board[p] !== BLACK) continue
    const x = p % N
    const y = Math.floor(p / N)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        if (inside(x + dx, y + dy) && board[idx(x + dx, y + dy)] === EMPTY) near.add(idx(x + dx, y + dy))
  }
  return [...near].filter((p) => isForbidden(board, p)).sort((a, b) => a - b)
}
