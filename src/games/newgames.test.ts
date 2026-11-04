// 리버시, 점 잇기, 컬링 규칙 테스트
import { describe, expect, it } from 'vitest'
import { HOUSE, STONES_EACH, curling, scoreEnd, throwStone, thrower, type State as CurlState } from './curling'
import { dots, hLine, vLine } from './dots'
import { dotsBot } from './dots/bot'
import { N, count, legalMoves, reversi } from './reversi'
import { reversiBot } from './reversi/bot'
import { R } from './shared/physics'

describe('리버시', () => {
  const s0 = reversi.init(['p0', 'p1'], 0) // p0이 흑

  it('처음에는 흑이 둘 곳이 4군데이고, 두면 끼인 돌이 뒤집힌다', () => {
    expect(legalMoves(s0.board, 1)).toEqual([19, 26, 37, 44])
    const s = reversi.apply(s0, 'p0', { cell: 19 })!
    expect(count(s.board, 1)).toBe(4)
    expect(count(s.board, 2)).toBe(1)
    expect(s.toMove).toBe(2)
  })

  it('뒤집을 수 없는 자리, 남의 차례에는 둘 수 없다', () => {
    expect(reversi.apply(s0, 'p0', { cell: 0 })).toBeNull()
    expect(reversi.apply(s0, 'p1', { cell: 19 })).toBeNull()
  })

  it('상대가 둘 곳이 없으면 내가 한 번 더 둔다', () => {
    // 흑이 오른쪽 위 구석을 막 채우면 백이 둘 곳이 없도록 만든 판
    const board = Array(N * N).fill(1) as (0 | 1 | 2)[]
    board[0] = 0
    board[1] = 2
    board[63] = 0
    board[62] = 2
    const s = { ...s0, board }
    const next = reversi.apply(s, 'p0', { cell: 0 })!
    expect(next.passed === 2 || next.done).toBe(true)
  })

  it('봇끼리 끝까지 두면 판이 끝나고 결과가 나온다', () => {
    let s = s0
    for (let i = 0; i < 200 && !s.done; i++) {
      const who = reversi.turnOf(s)!
      s = reversi.apply(s, who, reversiBot(s, who)) ?? reversi.skip(s)
    }
    expect(s.done).toBe(true)
    expect(reversi.result(s)).not.toBeNull()
  })
})

describe('점 잇기', () => {
  const s0 = dots.init(['p0', 'p1'], 0)

  it('2명은 4×4칸(선 40개), 3명 이상은 5×5칸', () => {
    expect(s0.lines).toHaveLength(40)
    expect(dots.init(['a', 'b', 'c'], 0).boxes).toHaveLength(25)
  })

  it('상자를 닫으면 그 상자를 갖고 한 번 더 둔다', () => {
    let s = s0
    s = dots.apply(s, 'p0', { line: hLine(s, 0, 0) })!
    s = dots.apply(s, 'p1', { line: hLine(s, 1, 0) })!
    s = dots.apply(s, 'p0', { line: vLine(s, 0, 0) })!
    expect(s.turn).toBe(1)
    s = dots.apply(s, 'p1', { line: vLine(s, 0, 1) })!
    expect(s.boxes[0]).toBe(1)
    expect(s.turn).toBe(1)
  })

  it('봇끼리 끝까지 두면 모든 상자에 주인이 생긴다', () => {
    let s = dots.init(['a', 'b', 'c'], 1)
    for (let i = 0; i < 200 && !s.winners; i++) {
      const who = dots.turnOf(s)!
      s = dots.apply(s, who, dotsBot(s, who))!
    }
    expect(s.boxes.every((b) => b >= 0)).toBe(true)
    expect(s.winners!.length).toBeGreaterThan(0)
  })
})

describe('컬링', () => {
  const at = (x: number, y: number, owner: number) => ({ x, y, owner, out: false })

  it('가장 가까운 돌의 주인이 상대 가장 가까운 돌보다 가까운 돌 수만큼 점수를 얻는다', () => {
    const discs = [at(HOUSE.x, HOUSE.y + 0.01, 0), at(HOUSE.x + 0.05, HOUSE.y, 0), at(HOUSE.x, HOUSE.y + 0.08, 1), at(HOUSE.x, HOUSE.y + 0.12, 0)]
    expect(scoreEnd(discs)).toEqual({ winner: 0, points: 2 })
  })

  it('하우스 밖 돌은 세지 않는다', () => {
    expect(scoreEnd([at(0.5, 0.8, 0)])).toEqual({ winner: null, points: 0 })
    expect(scoreEnd([{ ...at(HOUSE.x, HOUSE.y, 1), out: true }])).toEqual({ winner: null, points: 0 })
  })

  it('번갈아 던지고, 한 엔드(각자 3개)가 끝나면 점수가 오르고 먼저 던지는 사람이 바뀐다', () => {
    let s: CurlState = curling.init(['p0', 'p1'], 0)
    const first = s.first
    const order: number[] = []
    for (let i = 0; i < STONES_EACH * 2; i++) {
      order.push(thrower(s))
      s = curling.skip(s)
    }
    expect(order).toEqual([first, 1 - first, first, 1 - first, first, 1 - first])
    expect(s.end).toBe(2)
    expect(s.first).toBe(1 - first)
  })

  it('알맞은 세기로 밀면 하우스 근처에 멈추고, 화면마다 같은 결과다', () => {
    const s = curling.init(['p0', 'p1'], 0)
    const m = throwStone(s, 0, -0.85)
    const d = m.end[m.end.length - 1]
    expect(d.out).toBe(false)
    expect(Math.abs(d.y - HOUSE.y)).toBeLessThan(0.15)
    expect(throwStone(s, 0, -0.85)).toEqual(m)
    expect(curling.apply(s, s.order[thrower(s)], m)).not.toBeNull()
  })

  it('3엔드가 끝나도 동점이면 연장 엔드를 한다', () => {
    let s: CurlState = curling.init(['p0', 'p1'], 0)
    for (let i = 0; i < STONES_EACH * 2 * 3; i++) s = curling.skip(s)
    expect(s.winner).toBeNull()
    expect(s.end).toBe(4)
  })

  it('돌 반지름이 하우스보다 충분히 작다', () => {
    expect(R * 2).toBeLessThan(HOUSE.r)
  })
})
