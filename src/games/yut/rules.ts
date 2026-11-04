// 윷놀이 판정. 화면과 분리해 테스트한다(rules.test.ts).
//
// 판: 바깥 네모 20칸(0=출발점, 오른쪽 아래)과 두 대각선(가운데에서 만남).
// - 모서리(5, 10)나 가운데에 '멈추면' 다음 이동은 지름길(대각선)로 간다. 가운데에 멈추면 출발점 쪽 가장 짧은 길로 간다.
// - 출발점에 도착하거나 지나가면 완주. 말을 모두 완주시킨 사람이 이긴다.
// 윷: 막대 4개(그중 하나에 빽도 표시). 평평한 면이 위로 온 수가 1=도(표시 막대면 빽도), 2=개, 3=걸, 4=윷, 0=모.
// - 윷과 모는 한 번 더 던진다. 상대 말을 잡아도 한 번 더 던진다.
// - 던져 모은 결과를 하나씩 골라 원하는 말에 쓴다. 같은 자리의 내 말은 업혀서 함께 움직인다.

export const FINISH = -1
const OUTER = [...Array(20).keys(), FINISH]
// 대각선 칸 번호: a1 20, a2 21, 가운데 22, a3 23, a4 24 / b1 25, b2 26, b3 27, b4 28
export const CENTER = 22
const ROUTES = {
  O: OUTER,
  A: [5, 20, 21, 22, 23, 24, 15, 16, 17, 18, 19, FINISH], // 오른쪽 위 모서리에서 가운데를 지나 왼쪽 아래로
  B: [10, 25, 26, 22, 27, 28, FINISH], // 왼쪽 위 모서리에서 가운데를 지나 출발점으로
  C: [22, 27, 28, FINISH], // 가운데에 멈춘 뒤 출발점으로
} as const
export type RouteName = keyof typeof ROUTES

/** 말 하나: 아직 안 나간 말은 started=false, 완주한 말은 done=true */
export type Piece = { route: RouteName; idx: number; started: boolean; done: boolean }

export const VALUE_NAMES: Record<number, string> = { [-1]: '빽도', 1: '도', 2: '개', 3: '걸', 4: '윷', 5: '모' }

export const newPiece = (): Piece => ({ route: 'O', idx: 0, started: false, done: false })

/** 말이 서 있는 칸(판 위에 없으면 null) */
export function nodeOf(p: Piece): number | null {
  if (!p.started || p.done) return null
  return ROUTES[p.route][p.idx]
}

/** value만큼 움직인 결과. 움직일 수 없으면 null(안 나간 말에 빽도, 완주한 말) */
export function moved(p: Piece, value: number): Piece | null {
  if (p.done) return null
  if (value < 0) {
    if (!p.started) return null
    // 빽도: 지금 길에서 한 칸 뒤로. 길의 첫 칸(모서리·가운데)이면 바깥 길의 한 칸 앞 칸으로
    if (p.idx > 0) return { ...p, idx: p.idx - 1 }
    const node = ROUTES[p.route][0]
    if (p.route === 'O') return p // 출발점에 서 있는 말은 더 물러날 곳이 없다
    if (p.route === 'C') return { route: 'A', idx: 2, started: true, done: false } // 가운데 → 그 앞 대각선 칸
    return { route: 'O', idx: node - 1, started: true, done: false }
  }
  // 멈춰 있는 자리가 모서리나 가운데면 지름길로 들어간다
  let route: RouteName = p.route
  let idx = p.idx
  const node = nodeOf(p)
  if (node === 5 && route === 'O') [route, idx] = ['A', 0]
  else if (node === 10 && route === 'O') [route, idx] = ['B', 0]
  else if (node === CENTER) [route, idx] = ['C', 0]
  const path = ROUTES[route]
  const next = idx + value
  if (next >= path.length - 1) return { route, idx: path.length - 1, started: true, done: true }
  return { route, idx: next, started: true, done: false }
}

/** 막대 4개를 던진 결과: 평평한 면이 위인지(true), 0번 막대에 빽도 표시 */
export function throwValue(sticks: boolean[]): number {
  const flat = sticks.filter(Boolean).length
  if (flat === 0) return 5
  if (flat === 1) return sticks[0] ? -1 : 1
  return flat
}

/** 시드와 던진 횟수로 정해지는 막대 4개. 모두가 같은 결과를 얻는다 */
export function sticksFor(seed: number, throwNo: number): boolean[] {
  let a = (seed * 2654435761 + throwNo * 40503 + 12345) >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return [0, 1, 2, 3].map(() => next() < 0.5)
}

/** 판에 그릴 칸 위치(0~1). 출발점은 오른쪽 아래, 반시계 방향으로 돈다 */
export function nodePos(node: number): { x: number; y: number } {
  const lo = 0.08
  const hi = 0.92
  const step = (hi - lo) / 5
  if (node < 5) return { x: hi, y: hi - step * node }
  if (node < 10) return { x: hi - step * (node - 5), y: lo }
  if (node < 15) return { x: lo, y: lo + step * (node - 10) }
  if (node < 20) return { x: lo + step * (node - 15), y: hi }
  const mid = 0.5
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const c = { x: mid, y: mid }
  const tr = { x: hi, y: lo }
  const bl = { x: lo, y: hi }
  const tl = { x: lo, y: lo }
  const br = { x: hi, y: hi }
  switch (node) {
    case 20: return lerp(tr, c, 1 / 3)
    case 21: return lerp(tr, c, 2 / 3)
    case CENTER: return c
    case 23: return lerp(c, bl, 1 / 3)
    case 24: return lerp(c, bl, 2 / 3)
    case 25: return lerp(tl, c, 1 / 3)
    case 26: return lerp(tl, c, 2 / 3)
    case 27: return lerp(c, br, 1 / 3)
    case 28: return lerp(c, br, 2 / 3)
  }
  return c
}

export const ALL_NODES = Array.from({ length: 29 }, (_, i) => i)
