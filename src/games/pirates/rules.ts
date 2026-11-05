// 해적선 찾기 판정. 화면과 분리해 테스트한다(rules.test.ts).
// 8×8 바다에 배 4척(4칸, 3칸, 3칸, 2칸)을 가로나 세로로 겹치지 않게 놓는다. 칸 번호는 y * 8 + x.

export const N = 8
export const SHIPS = [4, 3, 3, 2]

export type Fleet = number[][]

/** 배치가 규칙에 맞나: 크기가 맞고, 일직선으로 이어지고, 겹치지 않는다 */
export function validFleet(fleet: unknown): fleet is Fleet {
  if (!Array.isArray(fleet) || fleet.length !== SHIPS.length) return false
  const sizes = fleet.map((s) => (Array.isArray(s) ? s.length : -1)).sort((a, b) => b - a)
  if (sizes.join() !== [...SHIPS].sort((a, b) => b - a).join()) return false
  const seen = new Set<number>()
  for (const ship of fleet as unknown[][]) {
    if (!ship.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < N * N)) return false
    const cells = [...(ship as number[])].sort((a, b) => a - b)
    const xs = cells.map((c) => c % N)
    const ys = cells.map((c) => Math.floor(c / N))
    const flat = ys.every((y) => y === ys[0]) && xs.every((x, i) => x === xs[0] + i)
    const tall = xs.every((x) => x === xs[0]) && ys.every((y, i) => y === ys[0] + i)
    if (!flat && !tall) return false
    for (const c of cells) {
      if (seen.has(c)) return false
      seen.add(c)
    }
  }
  return true
}

/** 칸 둘레 8칸(판 안쪽만) */
const around = (c: number) => {
  const x = c % N
  const y = Math.floor(c / N)
  const out: number[] = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx)
    }
  return out
}

/** 무작위 배치. 배끼리 붙으면 한 척처럼 보이므로 대각선까지 한 칸씩 띄운다. random은 테스트에서 바꿔 끼운다 */
export function randomFleet(random: () => number = Math.random): Fleet {
  for (;;) {
    const used = new Set<number>()
    const fleet: Fleet = []
    let ok = true
    for (const size of SHIPS) {
      let placed = false
      for (let tries = 0; tries < 100 && !placed; tries++) {
        const tall = random() < 0.5
        const x = Math.floor(random() * (tall ? N : N - size + 1))
        const y = Math.floor(random() * (tall ? N - size + 1 : N))
        const cells = Array.from({ length: size }, (_, k) => (tall ? (y + k) * N + x : y * N + x + k))
        if (cells.some((c) => around(c).some((n) => used.has(n)))) continue
        cells.forEach((c) => used.add(c))
        fleet.push(cells)
        placed = true
      }
      if (!placed) ok = false
    }
    if (ok) return fleet
  }
}

/** 지문에 넣는 배치 글자. 배 순서와 칸 순서를 정렬해 누가 만들어도 같은 글자가 된다 */
export const fleetText = (fleet: Fleet) =>
  JSON.stringify(fleet.map((s) => [...s].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]))

/** 이 칸을 쏘면 받는 답: 맞았나, 그래서 가라앉은 배(그 배의 모든 칸) */
export function answerFor(fleet: Fleet, hitsBefore: number[], cell: number): { hit: boolean; sunk: number[] | null } {
  const ship = fleet.find((s) => s.includes(cell))
  if (!ship) return { hit: false, sunk: null }
  const hits = new Set([...hitsBefore, cell])
  return { hit: true, sunk: ship.every((c) => hits.has(c)) ? [...ship].sort((a, b) => a - b) : null }
}
