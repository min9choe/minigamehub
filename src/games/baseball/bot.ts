// 숫자 야구 연습 봇: 지금까지 나온 판정과 모두 맞는 후보(처음 5040개) 가운데 하나를 부른다. 보통 6~7번 안에 맞힌다.
import { DIGITS, judge, type Move, type State } from '.'

let all: string[] | null = null
function candidates(): string[] {
  if (!all) {
    all = []
    for (let n = 0; n < 10000; n++) {
      const g = String(n).padStart(DIGITS, '0')
      if (new Set(g).size === DIGITS) all.push(g)
    }
  }
  return all
}

export function baseballBot(s: State, _botId: string, random = Math.random): Move {
  const left = candidates().filter((c) =>
    s.history.every((h) => {
      const r = judge(c, h.guess)
      return r.strike === h.strike && r.ball === h.ball
    })
  )
  const pool = left.length ? left : candidates()
  return { type: 'guess', guess: pool[Math.floor(random() * pool.length)] }
}
