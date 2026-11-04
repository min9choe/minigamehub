// 숫자 야구(2명): 서로 다른 숫자 4개로 된 정답을 두 사람 모두 모른 채, 번갈아 4자리를 불러 먼저 맞히는 사람이 이긴다.
// 자리와 숫자가 맞으면 스트라이크, 숫자만 맞으면 볼, 하나도 없으면 아웃. 두 사람의 기록은 서로 보인다.
//
// 정답은 방장 브라우저에만 있다(기획안 4장 '숫자 야구'). 판이 시작되면 방장이 정답의 지문만 알리고,
// 부른 숫자마다 방장이 판정을 붙여 알린다. 판이 끝나면 정답을 공개하고, 모든 화면이 지문과 맞는지 확인한다.
// 지문 덕분에 방장이 중간에 정답을 바꿀 수는 없지만, 방장이 개발자 도구로 정답을 엿보는 것까지는 막지 못한다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

export const DIGITS = 4
/** 각자 이만큼 불러도 못 맞히면 무승부로 끝내고 정답을 공개한다 */
export const MAX_GUESSES = 12

export type Secret = { answer: string; salt: string }
export type Guess = { by: number; guess: string; strike: number; ball: number }

export type State = {
  order: string[]
  phase: 'setup' | 'play' | 'done'
  /** 정답의 지문(방장이 시작할 때 알린다) */
  commit: string | null
  turn: number
  history: Guess[]
  /** 판이 끝나면 공개된 정답과, 지문과 맞는지 */
  reveal: (Secret & { verified: boolean }) | null
  winner: number | null
}
export type Move =
  | { type: 'commit'; hash: string }
  | { type: 'guess'; guess: string; strike?: number; ball?: number; reveal?: Secret }

/** 짧은 지문(cyrb53, 53비트). 소금(salt)을 함께 넣어 정답 후보 5040개를 하나씩 대 보는 것으로는 알아낼 수 없게 한다 */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

/** 서로 다른 숫자 4개인가 */
export const validGuess = (g: unknown): g is string => typeof g === 'string' && /^\d{4}$/.test(g) && new Set(g).size === DIGITS

export function judge(answer: string, guess: string): { strike: number; ball: number } {
  let strike = 0
  let ball = 0
  for (let i = 0; i < DIGITS; i++) {
    if (guess[i] === answer[i]) strike++
    else if (answer.includes(guess[i])) ball++
  }
  return { strike, ball }
}

function randomAnswer(): string {
  const digits = [...'0123456789']
  for (let i = digits.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[digits[i], digits[j]] = [digits[j], digits[i]]
  }
  return digits.slice(0, DIGITS).join('')
}

function randomSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('')
}

export const baseball: GameDef<State, Move> = {
  turnSeconds: 30,

  init: (order, seed) => ({ order, phase: 'setup', commit: null, turn: seed % 2, history: [], reveal: null, winner: null }),

  turnOf: (s) => (s.phase === 'play' ? s.order[s.turn] : null),

  apply(s, by, move) {
    if (move.type === 'commit') {
      if (s.phase !== 'setup' || typeof move.hash !== 'string' || !/^[0-9a-f]{14}$/.test(move.hash)) return null
      return { ...s, phase: 'play', commit: move.hash }
    }
    const me = s.order.indexOf(by)
    if (s.phase !== 'play' || me !== s.turn || !validGuess(move.guess)) return null
    const { strike, ball } = move
    if (!Number.isInteger(strike) || !Number.isInteger(ball) || strike! < 0 || ball! < 0 || strike! + ball! > DIGITS) return null
    const history = [...s.history, { by: me, guess: move.guess, strike: strike!, ball: ball! }]
    const won = strike === DIGITS
    const out = history.length >= MAX_GUESSES * 2
    if (!won && !out) return { ...s, history, turn: 1 - me }
    // 판이 끝났다. 방장이 붙인 정답을 지문과 대조한다
    const r = move.reveal
    const reveal = r && typeof r.answer === 'string' && typeof r.salt === 'string'
      ? { ...r, verified: fingerprint(`${r.answer}:${r.salt}`) === s.commit && (!won || r.answer === move.guess) }
      : null
    return { ...s, history, phase: 'done', reveal, winner: won ? me : null }
  },

  skip: (s) => (s.phase === 'play' ? { ...s, turn: 1 - s.turn } : s),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.phase === 'done' || out < 0) return s
    return { ...s, phase: 'done', winner: 1 - out }
  },

  result: (s) => (s.phase !== 'done' ? null : { winners: s.winner === null ? [] : [s.order[s.winner]] }),

  host: {
    setup() {
      const secret: Secret = { answer: randomAnswer(), salt: randomSalt() }
      return { secret, move: { type: 'commit', hash: fingerprint(`${secret.answer}:${secret.salt}`) } }
    },
    judge(s, by, move, secret) {
      const { answer, salt } = secret as Secret
      if (move.type !== 'guess' || !validGuess(move.guess)) return null
      const res = judge(answer, move.guess)
      const ends = res.strike === DIGITS || s.history.length + 1 >= MAX_GUESSES * 2
      const judged: Move = { type: 'guess', guess: move.guess, ...res, ...(ends ? { reveal: { answer, salt } } : {}) }
      return baseball.apply(s, by, judged) ? judged : null
    },
  },

  mount(el, ctx) {
    el.innerHTML = `
      <div class="bb">
        <p class="bb-info"></p>
        <ol class="bb-history"></ol>
        <div class="bb-entry">
          <div class="bb-slots"></div>
          <div class="bb-pad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="btn" type="button" data-digit="${n}">${n}</button>`).join('')}
            <button class="btn ghost" type="button" data-action="back" aria-label="지우기">⌫</button>
            <button class="btn" type="button" data-digit="0">0</button>
            <button class="btn primary" type="button" data-action="send">보내기</button>
          </div>
        </div>
        <p class="bb-note"></p>
      </div>`
    const info = el.querySelector<HTMLElement>('.bb-info')!
    const history = el.querySelector<HTMLElement>('.bb-history')!
    const slots = el.querySelector<HTMLElement>('.bb-slots')!
    const pad = el.querySelector<HTMLElement>('.bb-pad')!
    const note = el.querySelector<HTMLElement>('.bb-note')!
    const COLORS = ['#2f6fde', '#d64545']

    let latest: State | null = null
    let typed = ''
    let shownGuesses = 0

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && latest.phase === 'play' && latest.turn === me()
    const name = (i: number) => esc(ctx.names.get(latest!.order[i]) ?? '')

    function draw() {
      const s = latest!
      info.innerHTML =
        s.phase === 'setup'
          ? '방장이 정답을 정하는 중…'
          : s.phase === 'done'
            ? '경기 끝'
            : myTurn()
              ? '<b>내 차례</b>예요. 서로 다른 숫자 4개를 불러요.'
              : `${name(s.turn)} 차례`

      history.innerHTML = s.history
        .map((h) => {
          // 판정은 한 칸에 모아 넣는다(스트라이크·볼 칩 두 개 또는 아웃 하나)
          const res =
            h.strike === 0 && h.ball === 0
              ? '<b class="bb-chip is-out">아웃</b>'
              : `<b class="bb-chip is-s">${h.strike}S</b><b class="bb-chip is-b">${h.ball}B</b>`
          return `<li><i style="background:${COLORS[h.by]}"></i><span>${name(h.by)}</span><code>${h.guess}</code><span class="bb-res">${res}</span></li>`
        })
        .join('')
      history.scrollTop = history.scrollHeight

      slots.innerHTML = Array.from({ length: DIGITS }, (_, i) => `<span>${typed[i] ?? ''}</span>`).join('')
      const can = myTurn()
      for (const b of pad.querySelectorAll<HTMLButtonElement>('[data-digit]')) b.disabled = !can || typed.length >= DIGITS || typed.includes(b.dataset.digit!)
      pad.querySelector<HTMLButtonElement>('[data-action=back]')!.disabled = !can || !typed.length
      pad.querySelector<HTMLButtonElement>('[data-action=send]')!.disabled = !can || typed.length !== DIGITS

      note.innerHTML = s.reveal
        ? `정답은 <code>${esc(s.reveal.answer)}</code>. ${s.reveal.verified ? '처음 알린 지문과 같아요 ✓' : '<b class="bb-bad">처음 알린 지문과 달라요!</b>'}`
        : s.commit
          ? `정답은 방장 브라우저에만 있어요. 지문 <code>${s.commit}</code> (끝나면 정답과 대조해요)`
          : ''
    }

    const onClick = (e: Event) => {
      const t = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (!t || t.disabled || !myTurn()) return
      if (t.dataset.digit !== undefined) typed += t.dataset.digit
      else if (t.dataset.action === 'back') typed = typed.slice(0, -1)
      else if (t.dataset.action === 'send' && typed.length === DIGITS) {
        ctx.play({ type: 'guess', guess: typed })
        typed = ''
      }
      draw()
    }
    // 키보드로도 숫자를 넣는다
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn() || (e.target as HTMLElement).tagName === 'INPUT') return
      if (/^\d$/.test(e.key) && typed.length < DIGITS && !typed.includes(e.key)) typed += e.key
      else if (e.key === 'Backspace') typed = typed.slice(0, -1)
      else if (e.key === 'Enter' && typed.length === DIGITS) {
        ctx.play({ type: 'guess', guess: typed })
        typed = ''
      } else return
      e.preventDefault()
      draw()
    }
    el.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)

    return {
      render(s) {
        if (latest && s.history.length > shownGuesses) {
          const h = s.history[s.history.length - 1]
          // 4스트라이크는 결과 화면이 승패 소리를 내므로 여기서는 짧게만
          ;(h.strike === DIGITS ? sfx.gain : h.strike + h.ball === 0 ? sfx.fall : sfx.place)()
        }
        shownGuesses = s.history.length
        if (latest && latest.turn !== s.turn) typed = ''
        latest = s
        draw()
      },
      destroy() {
        el.removeEventListener('click', onClick)
        window.removeEventListener('keydown', onKey)
        el.innerHTML = ''
      },
    }
  },
}
