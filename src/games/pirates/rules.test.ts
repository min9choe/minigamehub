import { describe, expect, it } from 'vitest'
import { commitOf, pirates, saveFleet, type State } from '.'
import { piratesBot } from './bot'
import { N, SHIPS, answerFor, randomFleet, validFleet, type Fleet } from './rules'

const FLEET_A: Fleet = [
  [0, 1, 2, 3],
  [16, 24, 32],
  [21, 22, 23],
  [62, 63],
]

describe('배치', () => {
  it('무작위 배치는 늘 규칙에 맞다', () => {
    for (let i = 0; i < 50; i++) expect(validFleet(randomFleet())).toBe(true)
  })

  it('겹치거나 꺾인 배, 크기가 틀린 배는 안 된다', () => {
    expect(validFleet(FLEET_A)).toBe(true)
    expect(validFleet([[0, 1, 2, 3], [3, 11, 19], [21, 22, 23], [62, 63]])).toBe(false)
    expect(validFleet([[0, 1, 2, 3], [16, 17, 25], [21, 22, 23], [62, 63]])).toBe(false)
    expect(validFleet([[6, 7, 8, 9], [16, 24, 32], [21, 22, 23], [62, 63]])).toBe(false) // 줄을 넘어감
    expect(validFleet([[0, 1, 2], [16, 24, 32], [21, 22, 23], [62, 63]])).toBe(false)
  })

  it('맞은 칸과 가라앉은 배를 답한다', () => {
    expect(answerFor(FLEET_A, [], 5)).toEqual({ hit: false, sunk: null })
    expect(answerFor(FLEET_A, [], 62)).toEqual({ hit: true, sunk: null })
    expect(answerFor(FLEET_A, [62], 63)).toEqual({ hit: true, sunk: [62, 63] })
  })
})

describe('전투 진행', () => {
  const ready = (): State => {
    let s: State = { ...pirates.init(['a', 'b'], 0), first: 0, turn: 0 }
    const hashA = commitOf(FLEET_A, 'x')
    saveFleet(hashA, { fleet: FLEET_A, salt: 'x' })
    s = pirates.apply(s, 'a', { kind: 'commit', hash: hashA })!
    s = pirates.apply(s, 'b', { kind: 'commit', hash: commitOf(FLEET_A, 'y') })!
    return s
  }

  it('둘 다 배치를 알리면 쏘기 시작하고, 쏘면 맞은 쪽이 답할 차례다', () => {
    let s = ready()
    expect(s.phase).toBe('play')
    expect(pirates.turnOf(s)).toBe('a')
    s = pirates.apply(s, 'a', { kind: 'shot', cell: 62 })!
    expect(pirates.turnOf(s)).toBe('b')
    expect(pirates.apply(s, 'a', { kind: 'shot', cell: 63 })).toBeNull()
    s = pirates.apply(s, 'b', { kind: 'answer', hit: true, sunk: null })!
    expect(s.shots[1]).toEqual([{ cell: 62, hit: true }])
    expect(pirates.turnOf(s)).toBe('b') // 이제 b가 쏜다
  })

  it('맞지 않은 칸을 가라앉았다고 할 수는 없다', () => {
    let s = ready()
    s = pirates.apply(s, 'a', { kind: 'shot', cell: 63 })!
    expect(pirates.apply(s, 'b', { kind: 'answer', hit: true, sunk: [62, 63] })).toBeNull()
  })

  /** a가 b의 배를 모두 쏴서 가라앉힌다. b는 lie가 true면 한 번 거짓으로 답한다 */
  function sinkAll(lie: boolean): State {
    let s = ready()
    const hits: number[] = []
    let lied = false
    for (const cell of FLEET_A.flat()) {
      s = pirates.apply(s, 'a', { kind: 'shot', cell })!
      let ans = answerFor(FLEET_A, hits, cell)
      if (lie && !lied && cell === 0) {
        // 첫 칸을 빗나갔다고 거짓말하고, 그 칸은 다시 쏠 수 없으니 그 배는 끝까지 안 가라앉는다
        ans = { hit: false, sunk: null }
        lied = true
      } else hits.push(cell)
      s = pirates.apply(s, 'b', { kind: 'answer', ...ans })!
      if (s.phase !== 'play') break
      s = pirates.skip(s) // b는 쏘지 않고 넘긴다
    }
    return s
  }

  it('배를 모두 가라앉히면 서로 배치를 공개하고, 맞으면 가라앉힌 사람이 이긴다', () => {
    let s = sinkAll(false)
    expect(s.phase).toBe('reveal')
    s = pirates.apply(s, 'a', { kind: 'reveal', fleet: FLEET_A, salt: 'x' })!
    s = pirates.apply(s, 'b', { kind: 'reveal', fleet: FLEET_A, salt: 'y' })!
    expect(s.reveals.every((r) => r!.verified)).toBe(true)
    expect(pirates.result(s)).toEqual({ winners: ['a'] })
  })

  it('공개한 배치가 지문이나 답과 다르면 진다', () => {
    let s = sinkAll(false)
    s = pirates.apply(s, 'a', { kind: 'reveal', fleet: FLEET_A, salt: 'x' })!
    s = pirates.apply(s, 'b', { kind: 'reveal', fleet: FLEET_A, salt: 'wrong' })!
    expect(s.reveals[1]!.verified).toBe(false)
    expect(pirates.result(s)).toEqual({ winners: ['a'] })
  })

  it('거짓으로 답한 기록은 공개할 때 드러난다', () => {
    let s = sinkAll(true)
    expect(s.phase).toBe('play') // 4칸 배가 안 가라앉아 아직 끝나지 않았다
    // 남은 칸을 모두 쏘면 공개로 넘어간다
    for (let cell = 0; cell < N * N && s.phase === 'play'; cell++) {
      if (s.shots[1].some((sh) => sh.cell === cell)) continue
      if (s.turn !== 0) s = pirates.skip(s)
      s = pirates.apply(s, 'a', { kind: 'shot', cell })!
      s = pirates.apply(s, 'b', { kind: 'answer', hit: false, sunk: null })!
    }
    expect(s.phase).toBe('reveal')
    s = pirates.apply(s, 'a', { kind: 'reveal', fleet: FLEET_A, salt: 'x' })!
    s = pirates.apply(s, 'b', { kind: 'reveal', fleet: FLEET_A, salt: 'y' })!
    expect(s.reveals[1]!.verified).toBe(false)
    expect(pirates.result(s)).toEqual({ winners: ['a'] })
  })

  it('봇끼리 두면 끝나고 둘 다 확인을 통과한다', () => {
    let s = pirates.init(['a', 'b'], 3)
    for (let i = 0; i < 400 && s.phase !== 'done'; i++) {
      const who = pirates.turnOf(s)!
      s = pirates.apply(s, who, piratesBot(s, who)) ?? pirates.skip(s)
    }
    expect(s.phase).toBe('done')
    expect(s.reveals.every((r) => r!.verified)).toBe(true)
    expect(s.sunk.some((list) => list.length === SHIPS.length)).toBe(true)
  })
})
