// 포트리스 세계(기획안 4장): 지형, 포탄 궤적, 폭발 피해. 화면과 분리해 테스트한다(world.test.ts).
//
// - 지형은 열마다 땅 윗면의 높이(위에서부터 잰 y)만 기록한다. 시드가 같으면 모든 기기에서 같은 지형이 나온다.
// - 포탄은 고정 간격으로 중력과 바람을 받아 날아가고, 땅이나 탱크에 닿으면 터진다.
// - 터진 자리는 원형으로 파이고, 반경 안의 탱크는 가까울수록 큰 피해를 입는다.
// - 기기마다 궤적이 미세하게 다를 수 있으므로 착탄 위치는 쏜 사람이 계산한 값으로 모두 맞춘다.

export const H = 480 // 세계 높이
export const FUEL = 80 // 한 턴에 움직일 수 있는 거리
export const BLAST = 40 // 폭발 반경
export const MAX_DAMAGE = 35 // 한가운데 맞았을 때 피해(직격은 30 안팎)
export const TANK_R = 12 // 포탄이 탱크에 맞았다고 보는 거리
export const TANK_LIFT = 8 // 땅 윗면에서 탱크 중심까지 높이
export const DT = 1 / 120
const GRAVITY = 300
const WIND_ACCEL = 12 // 바람 1칸당 가로 가속
const SPEED_PER_POWER = 5.2
const MAX_STEPS = 120 * 15

export type Point = { x: number; y: number }
export type Tank = { x: number; hp: number; out: boolean; angle: number }
export type Shot = { x: number; angle: number; power: number; wind: number }

/** 인원이 많을수록 지형을 넓힌다(초안) */
export const worldWidth = (players: number) => 600 + 200 * players

/** 시드로 정해지는 난수(mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 완만한 언덕 몇 개를 겹친 지형. 높이는 정수로 반올림해 기기마다 같게 한다 */
export function makeTerrain(width: number, seed: number): number[] {
  const r = rng(seed)
  const waves = [0, 1, 2].map((i) => ({
    amp: (0.05 + r() * 0.07) * H / (i + 1),
    freq: ((1 + r() * 2) * (i + 1) * Math.PI * 2) / width,
    phase: r() * Math.PI * 2,
  }))
  return Array.from({ length: width }, (_, x) => {
    const y = H * 0.62 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.freq * x + w.phase), 0)
    return Math.round(Math.min(H * 0.88, Math.max(H * 0.32, y)))
  })
}

/** 턴마다 바뀌는 바람: -5(왼쪽)~5(오른쪽) */
export function windFor(seed: number, turnNo: number): number {
  return Math.floor(rng(seed * 31 + turnNo * 7919 + 1)() * 11) - 5
}

/** 처음 탱크 위치: 지형 위에 고르게 늘어놓는다 */
export function startTanks(width: number, players: number): Tank[] {
  return Array.from({ length: players }, (_, i) => {
    const x = Math.round((width * (i + 1)) / (players + 1))
    return { x, hp: 100, out: false, angle: x < width / 2 ? 50 : 130 }
  })
}

export const tankCenter = (ground: number[], x: number): Point => ({ x, y: ground[x] - TANK_LIFT })

/** 포탄을 쏘아 착탄 위치와 지나간 자리를 구한다. 옆으로 판 밖에 나가면 impact는 null */
export function fly(ground: number[], tanks: Tank[], shooter: number, shot: Shot): { path: Point[]; impact: Point | null } {
  const rad = (shot.angle * Math.PI) / 180
  const speed = shot.power * SPEED_PER_POWER
  const start = tankCenter(ground, shot.x)
  let x = start.x + Math.cos(rad) * 14
  let y = start.y - 4 - Math.sin(rad) * 14
  let vx = Math.cos(rad) * speed
  let vy = -Math.sin(rad) * speed
  const path: Point[] = [{ x, y }]
  for (let i = 0; i < MAX_STEPS; i++) {
    vx += shot.wind * WIND_ACCEL * DT
    vy += GRAVITY * DT
    x += vx * DT
    y += vy * DT
    path.push({ x, y })
    if (x < 0 || x >= ground.length) return { path, impact: null }
    if (y >= H) return { path, impact: { x, y: H } }
    if (y >= ground[Math.floor(x)]) return { path, impact: { x, y } }
    for (let t = 0; t < tanks.length; t++) {
      if (tanks[t].out) continue
      // 쏜 탱크는 포탄이 포신을 벗어난 뒤부터 맞을 수 있다
      if (t === shooter && i < 12) continue
      const c = tankCenter(ground, t === shooter ? shot.x : tanks[t].x)
      if (Math.hypot(c.x - x, c.y - y) < TANK_R) return { path, impact: { x, y } }
    }
  }
  return { path, impact: null }
}

/** 폭발 반경 안을 원형으로 판다. 땅이 바닥까지 파이면 그 열의 높이는 H가 된다 */
export function crater(ground: number[], impact: Point): number[] {
  const next = [...ground]
  const from = Math.max(0, Math.ceil(impact.x - BLAST))
  const to = Math.min(ground.length - 1, Math.floor(impact.x + BLAST))
  for (let x = from; x <= to; x++) {
    const half = Math.sqrt(BLAST * BLAST - (x - impact.x) ** 2)
    // 원이 땅 윗면에 닿는 열만 판다(땅속 동굴은 만들지 않는다)
    if (impact.y - half <= next[x]) next[x] = Math.min(H, Math.max(next[x], Math.round(impact.y + half)))
  }
  return next
}

/** 탱크마다 받는 피해: 폭발 중심에서 가까울수록 크다 */
export function damageFrom(ground: number[], tanks: Tank[], impact: Point): number[] {
  return tanks.map((t) => {
    if (t.out) return 0
    const c = tankCenter(ground, t.x)
    const d = Math.hypot(c.x - impact.x, c.y - impact.y)
    return d >= BLAST ? 0 : Math.round(MAX_DAMAGE * (1 - d / BLAST))
  })
}
