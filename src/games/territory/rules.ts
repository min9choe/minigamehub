// 땅따먹기 판정(기획안 4장). 판을 G×G 칸으로 나눠 칸마다 주인을 기록하고, 면적은 칠한 칸 수로 센다.
//
// - 모서리마다 집(판 면적의 약 6%)이 있고, 처음에는 집만 내 땅이다. 2명은 마주 보는 모서리, 3~4명은 하나씩 쓴다.
// - 한 턴에 내 집 가운데에서 출발해 최대 3번 튕긴다. 3번째 정지 위치가 내 땅 안이면 성공이고,
//   출발점과 정지점 3개를 이은 도형의 안쪽이 내 땅이 된다. 이미 남의 땅인 칸은 빼앗지 않는다.
// - 칸 중심이 도형 안인지는 even-odd 규칙으로 판정한다. 도형이 꼬여도 모든 기기에서 같은 칸이 칠해진다.

export const G = 50
const HOUSE = 12 // 집 한 변의 칸 수: 12×12 = 144칸, 판의 5.8%

export type Point = { x: number; y: number }

/** 모서리 번호: 0 왼쪽 아래, 1 오른쪽 아래, 2 오른쪽 위, 3 왼쪽 위 */
export function cornersFor(players: number): number[] {
  return players === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, players)
}

function houseOrigin(corner: number): [number, number] {
  const right = corner === 1 || corner === 2
  const bottom = corner === 0 || corner === 1
  return [right ? G - HOUSE : 0, bottom ? G - HOUSE : 0]
}

export function houseCenter(corner: number): Point {
  const [cx, cy] = houseOrigin(corner)
  return { x: (cx + HOUSE / 2) / G, y: (cy + HOUSE / 2) / G }
}

/** 집이 차지하는 사각형(판 좌표 0~1) */
export function houseRect(corner: number): { x: number; y: number; size: number } {
  const [cx, cy] = houseOrigin(corner)
  return { x: cx / G, y: cy / G, size: HOUSE / G }
}

export function insideHouse(corner: number, p: Point): boolean {
  const r = houseRect(corner)
  return p.x >= r.x && p.x <= r.x + r.size && p.y >= r.y && p.y <= r.y + r.size
}

export function houseCells(corner: number): number[] {
  const [cx, cy] = houseOrigin(corner)
  const cells: number[] = []
  for (let y = cy; y < cy + HOUSE; y++) for (let x = cx; x < cx + HOUSE; x++) cells.push(y * G + x)
  return cells
}

/** 처음 땅: 칸마다 주인 번호, 빈 땅은 -1 */
export function initialLand(corners: number[]): number[] {
  const land = Array(G * G).fill(-1)
  corners.forEach((corner, player) => {
    for (const c of houseCells(corner)) land[c] = player
  })
  return land
}

export function cellAt(p: Point): number {
  const x = Math.min(G - 1, Math.max(0, Math.floor(p.x * G)))
  const y = Math.min(G - 1, Math.max(0, Math.floor(p.y * G)))
  return y * G + x
}

/** even-odd 규칙: 점에서 오른쪽으로 그은 선이 도형의 변과 홀수 번 만나면 안쪽 */
export function insidePolygon(px: number, py: number, pts: Point[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 도형 안의 빈 칸을 player의 땅으로 칠한 새 땅과 새로 얻은 칸 수 */
export function claim(land: number[], pts: Point[], player: number): { land: number[]; gained: number } {
  const next = [...land]
  let gained = 0
  const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x)) * G))
  const maxX = Math.min(G - 1, Math.floor(Math.max(...pts.map((p) => p.x)) * G))
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y)) * G))
  const maxY = Math.min(G - 1, Math.floor(Math.max(...pts.map((p) => p.y)) * G))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const c = y * G + x
      if (next[c] !== -1) continue
      if (insidePolygon((x + 0.5) / G, (y + 0.5) / G, pts)) {
        next[c] = player
        gained++
      }
    }
  }
  return { land: next, gained }
}

export function areaOf(land: number[], player: number): number {
  return land.reduce((n, owner) => n + (owner === player ? 1 : 0), 0)
}
