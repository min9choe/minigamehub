import { describe, expect, it } from 'vitest'
import { TURN_LIMIT, fortress, type State } from '.'
import { FUEL, H, tankCenter, windFor } from './world'

const start = (n = 2): State => fortress.init(Array.from({ length: n }, (_, i) => `p${i}`), 4)
const hitOn = (s: State, target: number) => tankCenter(s.ground, s.tanks[target].x)

describe('포트리스 규칙', () => {
  it('맞히면 체력이 줄고 땅이 파이며, 차례와 바람이 바뀐다', () => {
    const s = start()
    const me = s.turn
    const them = 1 - me
    const next = fortress.apply(s, `p${me}`, { x: s.tanks[me].x, angle: 45, power: 50, impact: hitOn(s, them) })!
    expect(next.tanks[them].hp).toBe(65)
    expect(next.ground[s.tanks[them].x]).toBeGreaterThan(s.ground[s.tanks[them].x])
    expect(next.turn).toBe(them)
    expect(next.wind).toBe(windFor(s.seed, 1))
  })

  it('이동 한도를 넘거나 내 차례가 아니면 받지 않는다', () => {
    const s = start()
    const me = s.turn
    expect(fortress.apply(s, `p${me}`, { x: s.tanks[me].x + FUEL + 1, angle: 45, power: 50, impact: null })).toBeNull()
    expect(fortress.apply(s, `p${1 - me}`, { x: s.tanks[1 - me].x, angle: 45, power: 50, impact: null })).toBeNull()
  })

  it('체력이 0이 되면 탈락하고 마지막 남은 사람이 이긴다', () => {
    let s = start()
    const me = s.turn
    const them = 1 - me
    s = { ...s, tanks: s.tanks.map((t, i) => (i === them ? { ...t, hp: 20 } : t)) }
    s = fortress.apply(s, `p${me}`, { x: s.tanks[me].x, angle: 45, power: 50, impact: hitOn(s, them) })!
    expect(s.tanks[them].out).toBe(true)
    expect(fortress.result(s)).toEqual({ winners: [`p${me}`] })
  })

  it('발밑이 바닥까지 파이면 떨어져 탈락한다', () => {
    let s = start(3)
    const me = s.turn
    const them = (me + 1) % 3
    const x = s.tanks[them].x
    s = { ...s, ground: s.ground.map((y, i) => (Math.abs(i - x) < 30 ? H - 10 : y)) }
    s = fortress.apply(s, `p${me}`, { x: s.tanks[me].x, angle: 45, power: 50, impact: { x, y: H - 10 } })!
    expect(s.tanks[them].out).toBe(true)
    expect(s.winners).toBeNull()
  })

  it('턴 상한에 닿으면 체력이 많은 사람이 이긴다', () => {
    let s = start()
    s = { ...s, tanks: s.tanks.map((t, i) => (i === 0 ? { ...t, hp: 90 } : t)) }
    for (let i = 0; i < TURN_LIMIT * 2; i++) s = fortress.skip(s)
    expect(fortress.result(s)).toEqual({ winners: ['p1'] })
  })

  it('3명 중 차례인 사람이 기권하면 다음 사람에게 넘어간다', () => {
    let s = start(3)
    const me = s.turn
    s = fortress.eliminate(s, `p${me}`)
    expect(s.tanks[me].out).toBe(true)
    expect(s.turn).toBe((me + 1) % 3)
  })
})
