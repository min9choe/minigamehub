// 오목 금수 테스트 배치(기획안 4장: '열린 3 판정이 가장 까다로우니 별도의 테스트 배치로 검증한다').
// X = 흑, O = 백, . = 빈칸, ? = 판정할 자리. 배치는 판 왼쪽 위 (ox, oy)에 놓는다.
import { describe, expect, it } from 'vitest'
import { BLACK, EMPTY, N, WHITE, fiveLine, forbiddenPoints, idx, isForbidden, type Stone } from './rules'

function setup(rows: string[], ox = 4, oy = 4) {
  const b: Stone[] = Array(N * N).fill(EMPTY)
  let target = -1
  rows.forEach((row, y) =>
    [...row.replace(/ /g, '')].forEach((c, x) => {
      const p = idx(ox + x, oy + y)
      if (c === 'X') b[p] = BLACK
      else if (c === 'O') b[p] = WHITE
      else if (c === '?') target = p
    })
  )
  return { b, p: target }
}

describe('흑 3-3 금수', () => {
  it('가로·세로로 열린 3이 동시에 생기면 금수', () => {
    const { b, p } = setup([
      '. . . . . .',
      '. . X . . .',
      '. . X . . .',
      '. . ? X X .',
      '. . . . . .',
      '. . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(true)
  })

  it('띈 3(X . X ?)도 열린 3으로 센다', () => {
    const { b, p } = setup([
      '. . . . . . .',
      '. . . . X . .',
      '. . . . X . .',
      '. X . X ? . .',
      '. . . . . . .',
      '. . . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(true)
  })

  it('가운데를 채우는 3(X ? X)과 대각선 3도 금수', () => {
    const { b, p } = setup([
      '. . . . . . .',
      '. . . . . X .',
      '. . . . X . .',
      '. . X ? X . .',
      '. . . . . . .',
      '. . . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(true)
  })

  it('한쪽 끝이 백으로 막힌 3은 열린 3이 아니다', () => {
    const { b, p } = setup([
      '. . . . . . .',
      '. . . X . . .',
      '. . . X . . .',
      'O X X ? . . .',
      '. . . . . . .',
      '. . . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(false)
  })

  it('한쪽에 빈칸이 하나뿐이어도 반대쪽으로 열린 4를 만들 수 있으면 열린 3이다', () => {
    const { b, p } = setup([
      '. . . . . . .',
      '. . . . X . .',
      '. . . . X . .',
      '. . X X ? . O',
      '. . . . . . .',
      '. . . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(true)
  })

  it('판 가장자리에 붙은 3은 열린 3이 아니다', () => {
    const { b, p } = setup(
      [
        '. . . . . .',
        '. . X . . .',
        '. . X . . .',
        'X X ? . . .',
        '. . . . . .',
        '. . . . . .',
      ],
      0,
      4
    )
    expect(isForbidden(b, p)).toBe(false)
  })

  it('4-3은 금지하지 않는다', () => {
    const { b, p } = setup([
      '. . . . . . .',
      '. . . . X . .',
      '. . . . X . .',
      '. X X X ? . .',
      '. . . . . . .',
      '. . . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(false)
  })

  it('그 수로 5목이 완성되면 3-3이어도 둘 수 있다', () => {
    const { b, p } = setup([
      '. . . . . . . . .',
      '. . . . . . X . .',
      '. . . . . . X . .',
      '. X X X X ? . . .',
      '. . . . . . . . .',
    ])
    // ? 자리는 가로로 5목. 세로·대각선 3이 있어도 허용
    b[idx(4 + 5, 4 + 1)] = BLACK
    b[idx(4 + 5, 4 + 2)] = BLACK
    expect(fiveLine([...b.slice(0, p), BLACK, ...b.slice(p + 1)] as Stone[], p)).not.toBeNull()
    expect(isForbidden(b, p)).toBe(false)
  })

  it('열린 3이 하나뿐이면 둘 수 있다', () => {
    const { b, p } = setup([
      '. . . . . .',
      '. . . . . .',
      '. . . . . .',
      '. . ? X X .',
      '. . . . . .',
    ])
    expect(isForbidden(b, p)).toBe(false)
  })

  it('백돌로 같은 모양을 만들어도 금수 표시는 없다', () => {
    const { b } = setup([
      '. . . . . .',
      '. . O . . .',
      '. . O . . .',
      '. . . O O .',
      '. . . . . .',
    ])
    expect(forbiddenPoints(b)).toEqual([])
  })

  it('금수 자리 목록에 판정 자리가 들어간다', () => {
    const { b, p } = setup([
      '. . . . . .',
      '. . X . . .',
      '. . X . . .',
      '. . ? X X .',
      '. . . . . .',
      '. . . . . .',
    ])
    expect(forbiddenPoints(b)).toContain(p)
  })
})

describe('승리 판정', () => {
  it('5목이면 승리', () => {
    const { b, p } = setup(['X X X X ?'])
    b[p] = BLACK
    expect(fiveLine(b, p)).toHaveLength(5)
  })

  it('6목 이상도 승리로 본다', () => {
    const { b, p } = setup(['X X X ? X X'])
    b[p] = BLACK
    expect(fiveLine(b, p)).toHaveLength(6)
  })

  it('대각선 5목', () => {
    const { b, p } = setup(['X . . . .', '. X . . .', '. . X . .', '. . . X .', '. . . . ?'])
    b[p] = BLACK
    expect(fiveLine(b, p)).toHaveLength(5)
  })

  it('4목은 승리가 아니다', () => {
    const { b, p } = setup(['O X X X ? .'])
    b[p] = BLACK
    expect(fiveLine(b, p)).toBeNull()
  })
})
