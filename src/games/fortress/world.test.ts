import { describe, expect, it } from 'vitest'
import { BLAST, H, MAX_DAMAGE, crater, damageFrom, fly, makeTerrain, startTanks, tankCenter, windFor, worldWidth } from './world'

describe('지형', () => {
  it('시드가 같으면 같은 지형, 다르면 다른 지형', () => {
    expect(makeTerrain(800, 42)).toEqual(makeTerrain(800, 42))
    expect(makeTerrain(800, 42)).not.toEqual(makeTerrain(800, 43))
  })

  it('높이는 정수이고 화면 안에 있다', () => {
    const g = makeTerrain(worldWidth(4), 7)
    expect(g).toHaveLength(1400)
    expect(g.every((y) => Number.isInteger(y) && y > H * 0.3 && y < H * 0.9)).toBe(true)
  })

  it('바람은 -5~5 정수이고 턴마다 바뀐다', () => {
    const winds = Array.from({ length: 50 }, (_, t) => windFor(9, t))
    expect(winds.every((w) => Number.isInteger(w) && w >= -5 && w <= 5)).toBe(true)
    expect(new Set(winds).size).toBeGreaterThan(5)
  })
})

describe('폭발', () => {
  const flat = Array(400).fill(300)

  it('터진 자리를 원형으로 판다', () => {
    const g = crater(flat, { x: 200, y: 300 })
    expect(g[200]).toBe(300 + BLAST)
    expect(g[200 + BLAST + 1]).toBe(300)
    expect(g[220]).toBeGreaterThan(300)
    expect(g[220]).toBeLessThan(300 + BLAST)
  })

  it('계속 맞으면 바닥까지 파인다', () => {
    let g = flat
    for (let i = 0; i < 10; i++) g = crater(g, { x: 200, y: g[200] })
    expect(g[200]).toBe(H)
  })

  it('가까울수록 피해가 크고 반경 밖은 피해가 없다', () => {
    const tanks = [100, 200, 225, 300].map((x) => ({ x, hp: 100, out: false, angle: 90 }))
    const hit = tankCenter(flat, 200)
    const dmg = damageFrom(flat, tanks, hit)
    expect(dmg[1]).toBe(MAX_DAMAGE)
    expect(dmg[2]).toBeGreaterThan(0)
    expect(dmg[2]).toBeLessThan(MAX_DAMAGE)
    expect(dmg[0]).toBe(0)
    expect(dmg[3]).toBe(0)
  })
})

describe('포탄', () => {
  const flat = Array(800).fill(400)
  const tanks = startTanks(800, 2)

  it('같은 입력이면 같은 곳에 떨어진다', () => {
    const shot = { x: tanks[0].x, angle: 50, power: 60, wind: 2 }
    expect(fly(flat, tanks, 0, shot)).toEqual(fly(flat, tanks, 0, shot))
  })

  it('세게 쏠수록 멀리 간다', () => {
    const near = fly(flat, tanks, 0, { x: 100, angle: 45, power: 30, wind: 0 }).impact!
    const far = fly(flat, tanks, 0, { x: 100, angle: 45, power: 50, wind: 0 }).impact!
    expect(far.x).toBeGreaterThan(near.x)
  })

  it('맞바람이면 덜 간다', () => {
    const calm = fly(flat, tanks, 0, { x: 100, angle: 45, power: 40, wind: 0 }).impact!
    const head = fly(flat, tanks, 0, { x: 100, angle: 45, power: 40, wind: -5 }).impact!
    expect(head.x).toBeLessThan(calm.x)
  })

  it('옆으로 판 밖에 나가면 착탄이 없다', () => {
    expect(fly(flat, tanks, 0, { x: 100, angle: 170, power: 100, wind: 0 }).impact).toBeNull()
  })

  it('상대 탱크 쪽으로 쏘면 탱크 근처에 맞힐 수 있다', () => {
    // 파워를 바꿔 가며 상대 탱크에 가장 가까이 떨어지는 값을 찾는다
    let best = Infinity
    for (let p = 20; p <= 100; p++) {
      const imp = fly(flat, tanks, 0, { x: tanks[0].x, angle: 45, power: p, wind: 0 }).impact
      if (imp) best = Math.min(best, Math.abs(imp.x - tanks[1].x))
    }
    expect(best).toBeLessThan(15)
  })
})
