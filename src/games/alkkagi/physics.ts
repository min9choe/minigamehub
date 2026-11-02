// 알까기 물리(기획안 4장). 판은 가로세로 1인 정사각형이고, 돌 중심이 판 밖으로 나가면 떨어진다.
// 같은 입력이면 어느 기기에서든 거의 같은 결과가 나오도록 고정 간격으로 계산한다.
// 그래도 기기마다 미세한 오차가 날 수 있으므로, 최종 위치는 쏜 사람이 계산한 값으로 모두 맞춘다.

export type Disc = { x: number; y: number; owner: number; out: boolean }
export type Body = Disc & { vx: number; vy: number }

export const R = 0.042 // 돌 반지름
export const MAX_SPEED = 2.4 // 가장 세게 튕길 때 속도(판 길이/초)
export const DT = 1 / 120
const DECEL = 1.1 // 마찰로 줄어드는 속도(판 길이/초²)
const DAMP = 0.4 // 빠를수록 더 줄어드는 저항(1/초)
const RESTITUTION = 0.92 // 돌끼리 부딪힐 때 남는 탄성
const STOP_SPEED = 0.01
const MAX_STEPS = 120 * 10 // 아무리 길어도 10초면 멈춘 것으로 본다

const len = (x: number, y: number) => Math.sqrt(x * x + y * y)

export function toBodies(discs: Disc[]): Body[] {
  return discs.map((d) => ({ ...d, vx: 0, vy: 0 }))
}

export function toDiscs(bodies: Body[]): Disc[] {
  return bodies.map(({ x, y, owner, out }) => ({ x, y, owner, out }))
}

/** 한 간격만큼 움직인다. 아직 움직이는 돌이 있으면 true */
export function step(bodies: Body[]): boolean {
  let moving = false
  for (const b of bodies) {
    if (b.out) continue
    const speed = len(b.vx, b.vy)
    if (speed < STOP_SPEED) {
      b.vx = b.vy = 0
      continue
    }
    b.x += b.vx * DT
    b.y += b.vy * DT
    const next = Math.max(0, speed - DECEL * DT) * (1 - DAMP * DT)
    b.vx *= next / speed
    b.vy *= next / speed
    if (b.x < 0 || b.x > 1 || b.y < 0 || b.y > 1) {
      b.out = true
      b.vx = b.vy = 0
      continue
    }
    moving = true
  }

  // 같은 무게의 돌끼리 부딪히면 부딪힌 방향의 속도를 주고받는다
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]
    if (a.out) continue
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]
      if (b.out) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const dist = len(dx, dy)
      if (dist >= 2 * R || dist === 0) continue
      const nx = dx / dist
      const ny = dy / dist
      // 겹친 만큼 반씩 밀어낸다
      const push = (2 * R - dist) / 2
      a.x -= nx * push
      a.y -= ny * push
      b.x += nx * push
      b.y += ny * push
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
      if (approach <= 0) continue
      const impulse = (approach * (1 + RESTITUTION)) / 2
      a.vx -= impulse * nx
      a.vy -= impulse * ny
      b.vx += impulse * nx
      b.vy += impulse * ny
      moving = true
    }
  }
  return moving
}

export type Shot = { id: number; vx: number; vy: number }

/** 시작 배치에서 한 번 튕긴 뒤 모두 멈췄을 때의 배치 */
export function simulate(from: Disc[], shot: Shot): Disc[] {
  const bodies = toBodies(from)
  bodies[shot.id].vx = shot.vx
  bodies[shot.id].vy = shot.vy
  for (let i = 0; i < MAX_STEPS && step(bodies); i++);
  return toDiscs(bodies)
}

/** 처음 배치: 양쪽 5개씩 줄지어 놓는다. owner 0은 아래쪽, 1은 위쪽 */
export function initialDiscs(): Disc[] {
  const xs = [0.2, 0.35, 0.5, 0.65, 0.8]
  return [
    ...xs.map((x) => ({ x, y: 0.8, owner: 0, out: false })),
    ...xs.map((x) => ({ x, y: 0.2, owner: 1, out: false })),
  ]
}
