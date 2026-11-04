import { describe, expect, it } from 'vitest'
import { TURNS_EACH, applyFlick, territory, type State } from '.'
import { G, areaOf, cellAt, claim, cornersFor, houseCenter, initialLand, insidePolygon } from './rules'

const P = (x: number, y: number) => ({ x, y })

describe('땅 칠하기', () => {
  it('처음에는 각자 집 144칸만 가진다', () => {
    const land = initialLand(cornersFor(4))
    for (let p = 0; p < 4; p++) expect(areaOf(land, p)).toBe(144)
  })

  it('2명은 마주 보는 모서리를 쓴다', () => {
    expect(cornersFor(2)).toEqual([0, 2])
    expect(houseCenter(0)).toEqual({ x: 6 / G, y: 44 / G })
    expect(houseCenter(2)).toEqual({ x: 44 / G, y: 6 / G })
  })

  it('삼각형 안의 칸 중심만 칠한다', () => {
    const land = Array(G * G).fill(-1)
    // 판의 왼쪽 아래 절반 삼각형: 대각선 아래 칸은 모두, 중심이 대각선에 딱 걸친 칸은 계산 오차에 따라 들어가기도 한다
    const { gained, land: next } = claim(land, [P(0, 0), P(1, 1), P(0, 1)], 0)
    expect(gained).toBeGreaterThanOrEqual((G * (G - 1)) / 2)
    expect(gained).toBeLessThanOrEqual((G * (G + 1)) / 2)
    expect(next[cellAt(P(0.1, 0.9))]).toBe(0)
    expect(next[cellAt(P(0.9, 0.1))]).toBe(-1)
  })

  it('남의 땅은 빼앗지 않는다', () => {
    const land = initialLand(cornersFor(2))
    const { land: next, gained } = claim(land, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], 0)
    expect(areaOf(next, 1)).toBe(144)
    expect(gained).toBe(G * G - 288)
  })

  it('꼬인 도형(나비넥타이)은 양쪽 삼각형이 모두 안쪽이다', () => {
    const bowtie = [P(0.2, 0.2), P(0.8, 0.8), P(0.8, 0.2), P(0.2, 0.8)]
    expect(insidePolygon(0.3, 0.5, bowtie)).toBe(true)
    expect(insidePolygon(0.7, 0.5, bowtie)).toBe(true)
    expect(insidePolygon(0.5, 0.25, bowtie)).toBe(false)
  })
})

describe('턴 진행', () => {
  const start = (n = 2) => territory.init(Array.from({ length: n }, (_, i) => `p${i}`), 0)
  const stop = (x: number, y: number) => ({ vx: 0, vy: 0, end: { x, y, out: false } })

  it('세 번째에 내 땅으로 돌아오면 도형만큼 땅을 얻고 차례가 넘어간다', () => {
    let s: State = start()
    const home = houseCenter(0)
    s = applyFlick(s, stop(0.5, 0.88))
    s = applyFlick(s, stop(0.5, 0.5))
    expect(s.turn).toBe(0)
    expect(s.stops).toHaveLength(2)
    s = applyFlick(s, stop(home.x, home.y - 0.02))
    expect(s.lastTurn?.ok).toBe(true)
    expect(s.lastTurn!.gained).toBeGreaterThan(50)
    expect(areaOf(s.land, 0)).toBe(144 + s.lastTurn!.gained)
    expect(s.turn).toBe(1)
    expect(s.stone).toEqual(houseCenter(2))
  })

  it('세 번째에 내 땅 밖에서 멈추면 실패하고 땅은 그대로다', () => {
    let s: State = start()
    s = applyFlick(s, stop(0.5, 0.88))
    s = applyFlick(s, stop(0.5, 0.5))
    s = applyFlick(s, stop(0.6, 0.6))
    expect(s.lastTurn?.ok).toBe(false)
    expect(areaOf(s.land, 0)).toBe(144)
    expect(s.turn).toBe(1)
  })

  it('성공하면 지나온 도형이 땅 기록(claims)에 남는다', () => {
    let s: State = start()
    const home = houseCenter(0)
    s = applyFlick(s, stop(0.5, 0.88))
    s = applyFlick(s, stop(0.5, 0.5))
    s = applyFlick(s, stop(home.x, home.y))
    expect(s.claims).toEqual([{ player: 0, shape: [home, P(0.5, 0.88), P(0.5, 0.5), home] }])
  })

  it('3번째에 예전에 얻은 내 땅으로 들어와도 성공이다(도형 가장자리처럼 칸으로는 안 잡히는 자리 포함)', () => {
    let s: State = start()
    // 0번이 예전에 얻은 삼각형. 칸 기록에는 없는 가장자리 자리로 돌아온다고 친다
    s = { ...s, claims: [{ player: 0, shape: [P(0.3, 0.3), P(0.7, 0.3), P(0.3, 0.7)] }] }
    expect(s.land[cellAt(P(0.35, 0.35))]).toBe(-1)
    s = applyFlick(s, stop(0.5, 0.88))
    s = applyFlick(s, stop(0.6, 0.6))
    s = applyFlick(s, stop(0.35, 0.35))
    expect(s.lastTurn?.ok).toBe(true)
  })

  it('내 도형 안이어도 그 자리가 남의 칸이면 실패다', () => {
    let s: State = start()
    const land = [...s.land]
    land[cellAt(P(0.35, 0.35))] = 1
    s = { ...s, land, claims: [{ player: 0, shape: [P(0.3, 0.3), P(0.7, 0.3), P(0.3, 0.7)] }] }
    s = applyFlick(s, stop(0.5, 0.88))
    s = applyFlick(s, stop(0.6, 0.6))
    s = applyFlick(s, stop(0.35, 0.35))
    expect(s.lastTurn?.ok).toBe(false)
  })

  it('판 밖으로 나가면 바로 턴이 끝난다', () => {
    let s: State = start()
    s = applyFlick(s, { vx: 0, vy: 0, end: { x: 0, y: 0, out: true } })
    expect(s.lastTurn?.ok).toBe(false)
    expect(s.turn).toBe(1)
    expect(s.turnsTaken).toEqual([1, 0])
  })

  it('각자 8턴을 마치면 땅이 넓은 사람이 이긴다', () => {
    let s: State = start()
    const home = houseCenter(0)
    // 0번은 첫 턴에 땅을 얻고, 나머지 턴은 모두 시간 초과
    s = applyFlick(s, stop(0.5, 0.88))
    s = applyFlick(s, stop(0.5, 0.5))
    s = applyFlick(s, stop(home.x, home.y))
    for (let i = 0; i < TURNS_EACH * 2 - 1; i++) s = territory.skip(s)
    expect(s.turnsTaken).toEqual([TURNS_EACH, TURNS_EACH])
    expect(territory.result(s)).toEqual({ winners: ['p0'] })
  })

  it('땅이 같으면 함께 이긴다', () => {
    let s: State = start(3)
    for (let i = 0; i < TURNS_EACH * 3; i++) s = territory.skip(s)
    expect(territory.result(s)).toEqual({ winners: ['p0', 'p1', 'p2'] })
  })

  it('기권한 사람은 건너뛰고, 한 명만 남으면 그 사람이 이긴다', () => {
    let s: State = start(3)
    s = territory.eliminate(s, 'p0')
    expect(s.turn).toBe(1)
    s = territory.eliminate(s, 'p2')
    expect(territory.result(s)).toEqual({ winners: ['p1'] })
  })
})
