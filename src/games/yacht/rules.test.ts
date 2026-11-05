import { describe, expect, it } from 'vitest'
import { ROLLS, yacht, type State } from '.'
import { yachtBot } from './bot'
import { BONUS, CATS, dieFor, scoreFor, total } from './rules'

const cat = (id: string) => CATS.findIndex((c) => c.id === id)

describe('야추 점수', () => {
  it('족보마다 점수를 맞게 센다', () => {
    expect(scoreFor(cat('threes'), [3, 3, 1, 3, 6])).toBe(9)
    expect(scoreFor(cat('choice'), [1, 2, 3, 4, 6])).toBe(16)
    expect(scoreFor(cat('four'), [5, 5, 5, 5, 2])).toBe(22)
    expect(scoreFor(cat('four'), [5, 5, 5, 2, 2])).toBe(0)
    expect(scoreFor(cat('full'), [5, 5, 5, 2, 2])).toBe(19)
    expect(scoreFor(cat('full'), [5, 5, 5, 5, 5])).toBe(0)
    expect(scoreFor(cat('small'), [1, 3, 2, 4, 4])).toBe(15)
    expect(scoreFor(cat('small'), [1, 2, 3, 5, 6])).toBe(0)
    expect(scoreFor(cat('large'), [2, 3, 4, 5, 6])).toBe(30)
    expect(scoreFor(cat('yacht'), [4, 4, 4, 4, 4])).toBe(50)
  })

  it('위쪽 합이 63 이상이면 보너스', () => {
    const sheet = [3, 6, 9, 12, 15, 18, null, null, null, null, null, null]
    expect(total(sheet)).toBe(63 + BONUS)
    expect(total([...sheet.slice(0, 5), 12, ...sheet.slice(6)])).toBe(57)
  })

  it('주사위 눈은 1~6이고 같은 입력이면 같다', () => {
    for (let r = 0; r < 50; r++) for (let i = 0; i < 5; i++) expect(dieFor(7, r, i)).toBeGreaterThanOrEqual(1)
    expect(dieFor(7, 3, 2)).toBe(dieFor(7, 3, 2))
  })
})

describe('야추 진행', () => {
  const start = (n = 2): State => ({ ...yacht.init(['a', 'b', 'c', 'd'].slice(0, n), 0), turn: 0 })

  it('한 차례에 3번까지 굴리고, 남긴 주사위는 그대로다', () => {
    let s = yacht.apply(start(), 'a', { kind: 'roll', held: [false, false, false, false, false] })!
    const first = s.dice[0]
    s = yacht.apply(s, 'a', { kind: 'roll', held: [true, false, false, false, false] })!
    expect(s.dice[0]).toBe(first)
    s = yacht.apply(s, 'a', { kind: 'roll', held: [true, false, false, false, false] })!
    expect(s.rolls).toBe(ROLLS)
    expect(yacht.apply(s, 'a', { kind: 'roll', held: [false, false, false, false, false] })).toBeNull()
  })

  it('굴리기 전에는 적을 수 없고, 적으면 다음 사람 차례다', () => {
    const s = start()
    expect(yacht.apply(s, 'a', { kind: 'score', cat: 0 })).toBeNull()
    const t = yacht.apply(yacht.apply(s, 'a', { kind: 'roll', held: [false, false, false, false, false] })!, 'a', { kind: 'score', cat: 6 })!
    expect(t.turn).toBe(1)
    expect(t.sheets[0][6]).not.toBeNull()
    expect(yacht.apply(t, 'b', { kind: 'roll', held: [false, false, false, false, false] })).not.toBeNull()
  })

  it('시간이 다 되면 가장 높은 빈칸에 저절로 적는다', () => {
    const s = yacht.skip(start())
    expect(s.sheets[0].filter((v) => v !== null)).toHaveLength(1)
    expect(s.turn).toBe(1)
  })

  it('봇끼리 4명이 두면 12칸을 다 채우고 등수가 나온다', () => {
    let s = yacht.init(['a', 'b', 'c', 'd'], 5)
    for (let i = 0; i < 1000 && !s.done; i++) s = yacht.apply(s, s.order[s.turn], yachtBot(s, s.order[s.turn]))!
    expect(s.done).toBe(true)
    expect(s.sheets.every((sh) => sh.every((v) => v !== null))).toBe(true)
    expect(yacht.result(s)!.ranking).toHaveLength(4)
  })

  it('기권하면 차례에서 빠지고, 한 명만 남으면 그 사람이 이긴다', () => {
    let s = start(3)
    s = yacht.eliminate(s, 'a')
    expect(s.turn).toBe(1)
    s = yacht.eliminate(s, 'c')
    expect(yacht.result(s)!.winners).toEqual(['b'])
  })
})
