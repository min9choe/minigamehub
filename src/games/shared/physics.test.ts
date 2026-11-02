import { describe, expect, it } from 'vitest'
import { initialDiscs } from '../alkkagi'
import { MAX_SPEED, R, simulate, type Disc } from './physics'

const disc = (x: number, y: number, owner = 0): Disc => ({ x, y, owner, out: false })

describe('돌 튕기기 물리', () => {
  it('약하게 튕기면 판 안에서 멈춘다', () => {
    const [end] = simulate([disc(0.5, 0.8)], { id: 0, vx: 0, vy: -0.5 })
    expect(end.out).toBe(false)
    expect(end.y).toBeLessThan(0.8)
    expect(end.y).toBeGreaterThan(0.5)
  })

  it('세게 튕기면 판 밖으로 떨어진다', () => {
    const [end] = simulate([disc(0.5, 0.8)], { id: 0, vx: 0, vy: -MAX_SPEED })
    expect(end.out).toBe(true)
  })

  it('정면으로 맞히면 맞은 돌이 밀려나고 쏜 돌은 거의 멈춘다', () => {
    const [a, b] = simulate([disc(0.5, 0.8), disc(0.5, 0.5, 1)], { id: 0, vx: 0, vy: -1.2 })
    expect(b.y).toBeLessThan(0.5)
    expect(a.y).toBeGreaterThan(b.y + 2 * R - 1e-9)
    expect(Math.abs(a.x - 0.5)).toBeLessThan(1e-9)
  })

  it('강하게 맞히면 상대 돌을 판 밖으로 쳐낸다', () => {
    const [a, b] = simulate([disc(0.5, 0.5), disc(0.5, 0.2, 1)], { id: 0, vx: 0, vy: -MAX_SPEED })
    expect(b.out).toBe(true)
    expect(a.out).toBe(false)
  })

  it('비스듬히 맞히면 맞은 돌이 옆으로 튄다', () => {
    const [, b] = simulate([disc(0.5, 0.8), disc(0.5 + R, 0.5, 1)], { id: 0, vx: 0, vy: -1.2 })
    expect(b.x).toBeGreaterThan(0.5 + R)
  })

  it('같은 입력이면 결과가 똑같다', () => {
    const shot = { id: 2, vx: 0.3, vy: -2 }
    expect(simulate(initialDiscs(), shot)).toEqual(simulate(initialDiscs(), shot))
  })

  it('끝나면 겹친 돌이 없다', () => {
    const end = simulate(initialDiscs(), { id: 2, vx: 0.1, vy: -MAX_SPEED }).filter((d) => !d.out)
    for (let i = 0; i < end.length; i++)
      for (let j = i + 1; j < end.length; j++)
        expect(Math.hypot(end[i].x - end[j].x, end[i].y - end[j].y)).toBeGreaterThan(2 * R - 1e-3)
  })
})
