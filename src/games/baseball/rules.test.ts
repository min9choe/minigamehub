import { describe, expect, it } from 'vitest'
import { MAX_GUESSES, baseball, fingerprint, judge, validGuess, type Secret, type State } from '.'
import { baseballBot } from './bot'

const host = baseball.host!

/** 방장 노릇: 비밀을 만들고 첫 사건(지문)을 적용한 판 */
function started(): { s: State; secret: Secret } {
  const s0 = baseball.init(['p0', 'p1'], 0)
  const { secret, move } = host.setup(s0)
  return { s: baseball.apply(s0, 'p0', move)!, secret: secret as Secret }
}
const play = (s: State, secret: Secret, guess: string) => {
  const who = baseball.turnOf(s)!
  return baseball.apply(s, who, host.judge(s, who, { type: 'guess', guess }, secret)!)!
}

describe('숫자 야구', () => {
  it('스트라이크·볼 판정', () => {
    expect(judge('1234', '1234')).toEqual({ strike: 4, ball: 0 })
    expect(judge('1234', '4321')).toEqual({ strike: 0, ball: 4 })
    expect(judge('1234', '1356')).toEqual({ strike: 1, ball: 1 })
    expect(judge('1234', '5678')).toEqual({ strike: 0, ball: 0 })
  })

  it('서로 다른 숫자 4개만 부를 수 있다', () => {
    expect(validGuess('0123')).toBe(true)
    expect(validGuess('1123')).toBe(false)
    expect(validGuess('123')).toBe(false)
    expect(validGuess('12a4')).toBe(false)
  })

  it('정답은 상태에 들어가지 않고, 지문만 공개된다', () => {
    const { s, secret } = started()
    expect(s.phase).toBe('play')
    expect(s.commit).toBe(fingerprint(`${secret.answer}:${secret.salt}`))
    expect(JSON.stringify(s)).not.toContain(secret.answer)
  })

  it('판정 없이 보낸 수(스트라이크·볼을 꾸며 보낸 수 포함)는 방장 판정을 거쳐야 적용된다', () => {
    const { s } = started()
    const who = baseball.turnOf(s)!
    expect(baseball.apply(s, who, { type: 'guess', guess: '1234' })).toBeNull()
  })

  it('번갈아 부르고, 맞히면 정답이 공개되며 지문과 대조된다', () => {
    const { s: s0, secret } = started()
    const first = s0.turn
    // 서로 다른 숫자 4개를 뒤집은 수는 정답과 같을 수 없다
    let s = play(s0, secret, secret.answer.split('').reverse().join(''))
    expect(s.turn).toBe(1 - first)
    s = play(s, secret, secret.answer)
    expect(s.phase).toBe('done')
    expect(s.winner).toBe(1 - first)
    expect(s.reveal).toEqual({ ...secret, verified: true })
  })

  it('방장이 끝에 다른 정답을 내밀면 지문과 달라 들통난다', () => {
    const { s, secret } = started()
    const who = baseball.turnOf(s)!
    const fake = { type: 'guess' as const, guess: secret.answer, strike: 4, ball: 0, reveal: { answer: secret.answer, salt: 'other' } }
    expect(baseball.apply(s, who, fake)!.reveal!.verified).toBe(false)
  })

  it('각자 정해진 횟수 안에 못 맞히면 무승부로 끝나고 정답을 공개한다', () => {
    let { s, secret } = started()
    const notIt = ['0123', '4567', '8901', '2345', '6789', '1357', '2468', '9876'].filter((g) => g !== secret.answer)
    for (let i = 0; i < MAX_GUESSES * 2; i++) s = play(s, secret, notIt[i % notIt.length])
    expect(s.phase).toBe('done')
    expect(s.winner).toBeNull()
    expect(s.reveal?.verified).toBe(true)
  })

  it('봇은 판정과 맞는 후보만 불러 결국 맞힌다', () => {
    let { s, secret } = started()
    for (let i = 0; i < MAX_GUESSES * 2 && s.phase === 'play'; i++) {
      const m = baseballBot(s, 'p1')
      s = play(s, secret, m.type === 'guess' ? m.guess : '')
    }
    expect(s.phase).toBe('done')
    expect(s.winner).not.toBeNull()
  })
})
