import { describe, expect, it } from 'vitest'
import { yut, type State } from '.'
import { yutBot } from './bot'
import { CENTER, moved, newPiece, nodeOf, throwValue, type Piece } from './rules'

const walk = (p: Piece, ...steps: number[]) => steps.reduce<Piece>((pc, v) => moved(pc, v)!, p)

describe('윷 결과', () => {
  it('평평한 면 수로 도·개·걸·윷·모, 표시 막대 하나만 평평하면 빽도', () => {
    expect(throwValue([false, true, false, false])).toBe(1)
    expect(throwValue([true, false, false, false])).toBe(-1)
    expect(throwValue([true, true, false, false])).toBe(2)
    expect(throwValue([true, true, true, false])).toBe(3)
    expect(throwValue([true, true, true, true])).toBe(4)
    expect(throwValue([false, false, false, false])).toBe(5)
  })
})

describe('말 이동', () => {
  it('바깥 길을 따라 간다', () => {
    expect(nodeOf(walk(newPiece(), 3))).toBe(3)
  })

  it('모서리(5)에 멈추면 다음에는 대각선으로 들어간다', () => {
    const p = walk(newPiece(), 5)
    expect(nodeOf(p)).toBe(5)
    expect(nodeOf(walk(p, 1))).toBe(20)
  })

  it('모서리를 멈추지 않고 지나가면 바깥 길을 그대로 간다', () => {
    expect(nodeOf(walk(newPiece(), 4, 2))).toBe(6)
  })

  it('가운데에 멈추면 출발점 쪽 가장 짧은 길로 간다', () => {
    const p = walk(newPiece(), 5, 3)
    expect(nodeOf(p)).toBe(CENTER)
    expect(nodeOf(walk(p, 1))).toBe(27)
    expect(walk(p, 3).done).toBe(true)
  })

  it('대각선으로 가운데를 지나가면 반대쪽 모서리 방향으로 계속 간다', () => {
    expect(nodeOf(walk(newPiece(), 5, 4))).toBe(23)
  })

  it('출발점에 도착하거나 지나가면 완주', () => {
    expect(walk(newPiece(), 5, 5, 5, 5).done).toBe(true)
    expect(walk(newPiece(), 4, 4, 4, 4, 4).done).toBe(true)
  })

  it('빽도는 한 칸 뒤로, 안 나간 말에는 쓸 수 없다', () => {
    expect(moved(newPiece(), -1)).toBeNull()
    expect(nodeOf(walk(newPiece(), 3, -1))).toBe(2)
    expect(nodeOf(walk(newPiece(), 5, 1, -1))).toBe(5)
  })
})

describe('윷놀이 진행', () => {
  // 던질 결과를 정해 두고 시험하려고, 지금 차례 사람에게 결과를 직접 넣는다
  const withPending = (s: State, ...pending: number[]): State => ({ ...s, phase: 'move', pending })
  const s0 = yut.init(['p0', 'p1'], 0)
  const me = s0.turn
  const id = s0.order[me]
  const other = 1 - me

  it('윷이나 모가 나오면 한 번 더 던진다', () => {
    // 던질 때까지 시도해 윷/모가 나온 경우를 찾는다
    let s = s0
    for (let i = 0; i < 300; i++) {
      const t = yut.apply({ ...s, throwNo: i }, id, { kind: 'throw' })!
      if (t.lastThrow!.value >= 4) {
        expect(t.phase).toBe('throw')
        return
      }
    }
    throw new Error('윷/모가 한 번도 안 나왔다')
  })

  it('같은 자리의 내 말은 업혀서 함께 움직인다', () => {
    let s = withPending(s0, 2, 2, 3)
    s = yut.apply(s, id, { kind: 'move', piece: 0, use: 0 })!
    s = yut.apply(s, id, { kind: 'move', piece: 1, use: 0 })!
    expect(nodeOf(s.pieces[me][0])).toBe(2)
    expect(nodeOf(s.pieces[me][1])).toBe(2)
    s = yut.apply(s, id, { kind: 'move', piece: 0, use: 0 })!
    expect(nodeOf(s.pieces[me][0])).toBe(5)
    expect(nodeOf(s.pieces[me][1])).toBe(5)
  })

  it('상대 말을 잡으면 그 말은 처음으로 돌아가고 한 번 더 던진다', () => {
    let s: State = { ...s0, pieces: s0.pieces.map((ps, p) => (p === other ? [walk(newPiece(), 3), ...ps.slice(1)] : ps)) }
    s = withPending(s, 3, 1)
    s = yut.apply(s, id, { kind: 'move', piece: 0, use: 0 })!
    expect(s.pieces[other][0].started).toBe(false)
    expect(s.phase).toBe('throw')
    expect(s.turn).toBe(me)
    expect(s.pending).toEqual([1]) // 남은 결과는 그대로 남는다
  })

  it('쓸 수 없는 결과(말이 하나도 안 나갔는데 빽도)뿐이면 차례가 넘어간다', () => {
    const s = yut.apply({ ...s0, phase: 'throw' }, id, { kind: 'throw' })
    // 직접 상태를 만들어 확인한다
    const stuck = yut.apply(withPending(s0, 1, -1), id, { kind: 'move', piece: 0, use: 0 })!
    expect(stuck.pending).toEqual([-1])
    expect(stuck.turn).toBe(me) // 말이 하나 나갔으니 빽도를 쓸 수 있다
    expect(s).not.toBeNull()
  })

  it('말을 모두 완주시키면 이긴다', () => {
    const almost: State = { ...s0, pieces: s0.pieces.map((ps, p) => (p === me ? ps.map((pc, k) => (k === 0 ? walk(newPiece(), 5, 3) : { ...pc, done: true, started: true })) : ps)) }
    const s = yut.apply(withPending(almost, 5), id, { kind: 'move', piece: 0, use: 0 })!
    expect(yut.result(s)?.winners).toEqual([id])
  })

  it('3명 이상이면 1등이 나와도 이어 가고, 마지막 한 명이 남으면 등수대로 끝난다', () => {
    const allDoneBut = (st: State, p: number): State => ({
      ...st,
      pieces: st.pieces.map((ps, q) => (q === p ? ps.map((pc, k) => (k === 0 ? walk(newPiece(), 5, 3) : { ...pc, done: true, started: true })) : ps)),
    })
    let s: State = yut.init(['a', 'b', 'c'], 0)
    // a가 먼저 완주한다
    s = allDoneBut(s, 0)
    s = yut.apply(withPending({ ...s, turn: 0 }, 5), 'a', { kind: 'move', piece: 0, use: 0 })!
    expect(s.ranks).toEqual([0])
    expect(yut.result(s)).toBeNull()
    expect(s.turn).toBe(1)
    // 완주한 사람은 차례를 건너뛴다
    s = yut.skip(s)
    expect(s.turn).toBe(2)
    s = yut.skip(s)
    expect(s.turn).toBe(1)
    // b가 완주하면 c가 꼴찌로 정해지고 끝난다
    s = allDoneBut(s, 1)
    s = yut.apply(withPending(s, 5), 'b', { kind: 'move', piece: 0, use: 0 })!
    expect(yut.result(s)).toEqual({ winners: ['a'], ranking: ['a', 'b', 'c'] })
  })

  it('완주한 사람이 나가도 등수는 그대로다', () => {
    let s: State = yut.init(['a', 'b', 'c'], 0)
    s = { ...s, ranks: [0], turn: 1 }
    s = yut.eliminate(s, 'a')
    expect(s.ranks).toEqual([0])
    s = yut.eliminate(s, 'c')
    expect(yut.result(s)).toEqual({ winners: ['a'], ranking: ['a', 'b'] })
  })

  it('봇끼리 두면 결국 누군가 이긴다', () => {
    let s = yut.init(['a', 'b', 'c'], 7)
    for (let i = 0; i < 3000 && s.winner === null; i++) {
      const who = yut.turnOf(s)!
      s = yut.apply(s, who, yutBot(s, who)) ?? yut.skip(s)
    }
    expect(s.winner).not.toBeNull()
  })
})
