// 야추 연습 봇: 좋은 족보가 나오면 멈추고 적는다. 아니면 가장 많이 나온 눈(또는 이어진 눈)을 남기고 다시 굴린다.
// 적을 칸은 '지금 점수 - 그 칸에서 보통 기대하는 점수'가 가장 큰 칸. 0점이면 가장 아까운 칸을 버린다.
import { ROLLS, type Move, type State } from '.'
import { CATS, UPPER, scoreFor } from './rules'

// 칸마다 보통 기대하는 점수(대략)
const EXPECT = [2, 5, 8, 11, 14, 17, 22, 13, 15, 12, 14, 18]

function pickCategory(s: State): number {
  const sheet = s.sheets[s.turn]
  const open = CATS.map((_, k) => k).filter((k) => sheet[k] === null)
  const value = (k: number) => {
    const sc = scoreFor(k, s.dice)
    // 위쪽 칸은 그 눈이 3개 이상이면 보너스에 도움이 되니 조금 더 쳐 준다
    const upperBoost = k < UPPER && sc >= (k + 1) * 3 ? 4 : 0
    return sc - EXPECT[k] + upperBoost
  }
  return open.reduce((a, b) => (value(b) > value(a) ? b : a), open[0])
}

function holdPlan(dice: number[]): boolean[] {
  const set = new Set(dice)
  // 이어진 눈 4개가 있으면 그것을 남겨 라지 스트레이트를 노린다
  for (const run of [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6],
  ]) {
    if (run.every((v) => set.has(v))) {
      const used = new Set<number>()
      return dice.map((d) => (run.includes(d) && !used.has(d) ? (used.add(d), true) : false))
    }
  }
  const c = Array(7).fill(0)
  for (const d of dice) c[d]++
  // 가장 많이 나온 눈, 같으면 큰 눈
  let best = 6
  for (let v = 6; v >= 1; v--) if (c[v] > c[best]) best = v
  return dice.map((d) => d === best)
}

export function yachtBot(s: State, botId: string): Move {
  void botId
  if (s.rolls === 0) return { kind: 'roll', held: [false, false, false, false, false] }
  const sheet = s.sheets[s.turn]
  const great = ['yacht', 'large', 'full', 'four'].some((id) => {
    const k = CATS.findIndex((c) => c.id === id)
    return sheet[k] === null && scoreFor(k, s.dice) >= (id === 'four' ? 20 : 1)
  })
  if (s.rolls >= ROLLS || great) return { kind: 'score', cat: pickCategory(s) }
  return { kind: 'roll', held: holdPlan(s.dice) }
}
