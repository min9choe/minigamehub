// 점 잇기 연습 봇: 상자를 닫을 수 있으면 닫고, 아니면 상대에게 세 번째 변을 내주지 않는 선을 고른다.
import { boxesOf, sides, type Move, type State } from '.'

export function dotsBot(s: State, _botId: string, random = Math.random): Move {
  const free = s.lines.map((o, l) => (o === -1 ? l : -1)).filter((l) => l >= 0)
  const drawn = (lines: number[], b: number) => sides(s, b).filter((l) => lines[l] !== -1).length
  const after = (l: number) => {
    const lines = [...s.lines]
    lines[l] = 0
    return lines
  }
  const pick = (ls: number[]) => ls[Math.floor(random() * ls.length)]
  const closing = free.filter((l) => boxesOf(s, l).some((b) => drawn(after(l), b) === 4))
  if (closing.length) return { line: pick(closing) }
  const safe = free.filter((l) => boxesOf(s, l).every((b) => drawn(after(l), b) < 3))
  if (safe.length) return { line: pick(safe) }
  // 어쩔 수 없으면 상대에게 내주는 상자가 가장 적은 선
  const giveaway = (l: number) => boxesOf(s, l).filter((b) => drawn(after(l), b) === 3).length
  const least = Math.min(...free.map(giveaway))
  return { line: pick(free.filter((l) => giveaway(l) === least)) }
}
