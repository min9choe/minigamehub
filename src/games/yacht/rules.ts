// 야추 점수 계산. 화면과 분리해 테스트한다(rules.test.ts).
// 칸 12개: 1~6(그 눈의 합), 초이스(합), 포카드, 풀하우스, 스몰·라지 스트레이트, 야추. 위쪽 6칸 합이 63 이상이면 보너스 35점.

export const CATS = [
  { id: 'ones', name: '1' },
  { id: 'twos', name: '2' },
  { id: 'threes', name: '3' },
  { id: 'fours', name: '4' },
  { id: 'fives', name: '5' },
  { id: 'sixes', name: '6' },
  { id: 'choice', name: '초이스' },
  { id: 'four', name: '포카드' },
  { id: 'full', name: '풀하우스' },
  { id: 'small', name: 'S 스트레이트' },
  { id: 'large', name: 'L 스트레이트' },
  { id: 'yacht', name: '야추' },
] as const
export const UPPER = 6
export const BONUS_AT = 63
export const BONUS = 35

const sum = (d: number[]) => d.reduce((a, b) => a + b, 0)
const counts = (d: number[]) => {
  const c = Array(7).fill(0)
  for (const v of d) c[v]++
  return c
}
const hasRun = (d: number[], len: number) => {
  const set = new Set(d)
  for (let start = 1; start + len - 1 <= 6; start++) {
    if (Array.from({ length: len }, (_, k) => start + k).every((v) => set.has(v))) return true
  }
  return false
}

/** 이 주사위로 cat 칸에 적으면 받는 점수 */
export function scoreFor(cat: number, dice: number[]): number {
  const c = counts(dice)
  if (cat < UPPER) return c[cat + 1] * (cat + 1)
  switch (CATS[cat].id) {
    case 'choice':
      return sum(dice)
    case 'four':
      return c.some((n) => n >= 4) ? sum(dice) : 0
    case 'full':
      return c.includes(3) && c.includes(2) ? sum(dice) : 0
    case 'small':
      return hasRun(dice, 4) ? 15 : 0
    case 'large':
      return hasRun(dice, 5) ? 30 : 0
    case 'yacht':
      return c.includes(5) ? 50 : 0
  }
  return 0
}

export const upperSum = (sheet: (number | null)[]) => sum(sheet.slice(0, UPPER).map((v) => v ?? 0))
export const total = (sheet: (number | null)[]) => sum(sheet.map((v) => v ?? 0)) + (upperSum(sheet) >= BONUS_AT ? BONUS : 0)

/** 시드와 던진 횟수, 주사위 번호로 정해지는 눈(1~6). 모두가 같은 결과를 얻는다 */
export function dieFor(seed: number, rollNo: number, i: number): number {
  let t = (seed ^ Math.imul(rollNo + 1, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca77)) >>> 0
  t = Math.imul(t ^ (t >>> 16), 0x7feb352d)
  t = Math.imul(t ^ (t >>> 15), 0x846ca68b)
  t ^= t >>> 16
  return ((t >>> 0) % 6) + 1
}
