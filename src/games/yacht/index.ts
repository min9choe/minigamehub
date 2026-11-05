// 야추(2~4명): 주사위 5개를 한 차례에 최대 3번 굴리고(남길 주사위는 고정), 점수표 12칸 중 하나에 적는다.
// 모두 12칸을 채우면 합계가 가장 높은 사람이 이긴다. 주사위 눈은 시드와 던진 횟수로 정해져 모든 화면에서 같다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'
import { BONUS, BONUS_AT, CATS, UPPER, dieFor, scoreFor, total, upperSum } from './rules'

export const ROLLS = 3

export type State = {
  order: string[]
  seed: number
  turn: number
  dice: number[]
  held: boolean[]
  /** 이번 차례에 굴린 횟수(0이면 아직 안 굴림) */
  rolls: number
  rollNo: number
  sheets: (number | null)[][]
  last: { by: number; cat: number; score: number } | null
  out: number[]
  done: boolean
}
export type Move = { kind: 'roll'; held: boolean[] } | { kind: 'score'; cat: number }

const alive = (s: State) => s.order.map((_, i) => i).filter((i) => !s.out.includes(i))
const filled = (s: State, p: number) => s.sheets[p].every((v) => v !== null)

function nextTurn(s: State): State {
  const live = alive(s)
  if (live.every((p) => filled(s, p))) return { ...s, done: true, rolls: 0 }
  for (let k = 1; k <= s.order.length; k++) {
    const p = (s.turn + k) % s.order.length
    if (live.includes(p) && !filled(s, p)) return { ...s, turn: p, rolls: 0, held: [false, false, false, false, false] }
  }
  return { ...s, done: true }
}

function roll(s: State, held: boolean[]): State {
  const dice = s.dice.map((d, i) => (s.rolls > 0 && held[i] ? d : dieFor(s.seed, s.rollNo, i)))
  return { ...s, dice, held: s.rolls > 0 ? held : [false, false, false, false, false], rolls: s.rolls + 1, rollNo: s.rollNo + 1 }
}

function write(s: State, cat: number): State {
  const sheets = s.sheets.map((sh, p) => (p === s.turn ? sh.map((v, k) => (k === cat ? scoreFor(cat, s.dice) : v)) : sh))
  return nextTurn({ ...s, sheets, last: { by: s.turn, cat, score: scoreFor(cat, s.dice) } })
}

export function totals(s: State) {
  return s.sheets.map(total)
}

export const yacht: GameDef<State, Move> = {
  turnSeconds: 40,

  init: (order, seed) => ({
    order,
    seed,
    turn: seed % order.length,
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rolls: 0,
    rollNo: 0,
    sheets: order.map(() => Array(CATS.length).fill(null)),
    last: null,
    out: [],
    done: false,
  }),

  turnOf: (s) => (s.done ? null : s.order[s.turn]),

  apply(s, by, move) {
    if (s.done || s.order.indexOf(by) !== s.turn || typeof move !== 'object' || move === null) return null
    if (move.kind === 'roll') {
      if (s.rolls >= ROLLS || !Array.isArray(move.held) || move.held.length !== 5) return null
      return roll(s, move.held.map(Boolean))
    }
    if (move.kind === 'score') {
      if (s.rolls === 0 || !Number.isInteger(move.cat) || s.sheets[s.turn][move.cat] !== null) return null
      return write(s, move.cat)
    }
    return null
  },

  /** 시간이 다 되면 (안 굴렸으면 한 번 굴려서) 지금 주사위로 점수가 가장 높은 빈칸에 적는다 */
  skip(s) {
    if (s.done) return s
    const r = s.rolls === 0 ? roll(s, s.held) : s
    const open = CATS.map((_, k) => k).filter((k) => r.sheets[r.turn][k] === null)
    const best = open.reduce((a, b) => (scoreFor(b, r.dice) > scoreFor(a, r.dice) ? b : a), open[0])
    return write(r, best)
  },

  eliminate(s, id) {
    const p = s.order.indexOf(id)
    if (s.done || p < 0 || s.out.includes(p)) return s
    const next = { ...s, out: [...s.out, p] }
    if (alive(next).length <= 1) return { ...next, done: true }
    return s.turn === p ? nextTurn(next) : next
  },

  result(s) {
    if (!s.done) return null
    const live = alive(s)
    const t = totals(s)
    const ranking = [...live].sort((a, b) => t[b] - t[a])
    const best = t[ranking[0]]
    return { winners: live.filter((p) => t[p] === best).map((p) => s.order[p]), ranking: ranking.map((p) => s.order[p]) }
  },

  mount(el, ctx) {
    el.innerHTML = `
      <div class="ya">
        <div class="ya-dice"></div>
        <div class="ya-actions">
          <button class="btn primary" type="button" data-action="roll">굴리기</button>
        </div>
        <p class="ya-hint"></p>
        <div class="ya-sheet-wrap"><table class="ya-sheet"></table></div>
      </div>`
    const diceEl = el.querySelector<HTMLElement>('.ya-dice')!
    const rollBtn = el.querySelector<HTMLButtonElement>('[data-action=roll]')!
    const hint = el.querySelector<HTMLElement>('.ya-hint')!
    const sheet = el.querySelector<HTMLElement>('.ya-sheet')!
    let latest: State | null = null
    let held = [false, false, false, false, false]
    let shownRoll = -1
    let rolling = 0

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !latest.done && latest.turn === me()
    const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
    const face = (v: number) => Array.from({ length: 9 }, (_, k) => `<span${PIPS[v].includes(k) ? ' class="on"' : ''}></span>`).join('')

    function draw() {
      const s = latest!
      const can = myTurn()
      const showHeld = can ? held : s.held
      diceEl.innerHTML = s.dice
        .map(
          (v, i) =>
            `<button class="ya-die${showHeld[i] && s.rolls > 0 ? ' is-held' : ''}${rolling && !(s.held[i] && s.rolls > 1) ? ' is-rolling' : ''}${s.rolls === 0 ? ' is-blank' : ''}" type="button" data-die="${i}" ${can && s.rolls > 0 && s.rolls < ROLLS ? '' : 'disabled'} aria-label="${v} 눈${showHeld[i] ? ', 남김' : ''}">${face(v)}</button>`
        )
        .join('')
      rollBtn.disabled = !can || s.rolls >= ROLLS
      rollBtn.textContent = s.rolls === 0 ? '굴리기' : s.rolls >= ROLLS ? '다 굴렸어요' : `다시 굴리기 (${ROLLS - s.rolls}번 남음)`
      hint.textContent = s.done
        ? ''
        : !can
          ? `${ctx.names.get(s.order[s.turn]) ?? ''} 차례${s.rolls ? `, ${s.rolls}번 굴림` : ''}`
          : s.rolls === 0
            ? '주사위를 굴려요.'
            : s.rolls < ROLLS
              ? '남길 주사위를 누르고 다시 굴리거나, 점수표 빈칸을 눌러 적어요.'
              : '점수표 빈칸을 눌러 적어요.'

      const t = totals(s)
      const name = (p: number) => esc(ctx.names.get(s.order[p]) ?? '')
      const head = `<tr><th></th>${s.order.map((_, p) => `<th class="${p === s.turn && !s.done ? 'is-turn' : ''}${s.out.includes(p) ? ' is-out' : ''}">${name(p)}</th>`).join('')}</tr>`
      const row = (k: number) =>
        `<tr${k === UPPER ? ' class="ya-lower"' : ''}><th>${CATS[k].name}</th>${s.order
          .map((_, p) => {
            const v = s.sheets[p][k]
            const just = s.last && s.last.by === p && s.last.cat === k
            if (v !== null) return `<td class="${just ? 'is-just' : ''}">${v}</td>`
            if (p === s.turn && can && s.rolls > 0) {
              const sc = scoreFor(k, s.dice)
              return `<td><button class="ya-pick${sc ? '' : ' is-zero'}" type="button" data-cat="${k}">${sc}</button></td>`
            }
            return '<td></td>'
          })
          .join('')}</tr>`
      const bonusRow = `<tr class="ya-sub"><th>보너스 <small>${BONUS_AT}↑</small></th>${s.sheets
        .map((sh) => `<td>${upperSum(sh) >= BONUS_AT ? BONUS : `<small>${upperSum(sh)}/${BONUS_AT}</small>`}</td>`)
        .join('')}</tr>`
      const totalRow = `<tr class="ya-total"><th>합계</th>${t.map((v) => `<td>${v}</td>`).join('')}</tr>`
      sheet.innerHTML = head + CATS.slice(0, UPPER).map((_, k) => row(k)).join('') + bonusRow + CATS.slice(UPPER).map((_, k) => row(k + UPPER)).join('') + totalRow
    }

    const onClick = (e: Event) => {
      const s = latest
      if (!s || !myTurn()) return
      const t = e.target as HTMLElement
      const die = t.closest<HTMLButtonElement>('[data-die]')
      if (die && !die.disabled) {
        const i = Number(die.dataset.die)
        held = held.map((h, k) => (k === i ? !h : h))
        draw()
        return
      }
      if (t.closest('[data-action=roll]') && !rollBtn.disabled) {
        ctx.play({ kind: 'roll', held })
        return
      }
      const pick = t.closest<HTMLElement>('[data-cat]')
      if (pick) ctx.play({ kind: 'score', cat: Number(pick.dataset.cat) })
    }
    el.addEventListener('click', onClick)

    return {
      render(s) {
        if (latest && s.rollNo !== shownRoll && s.rolls > 0) {
          sfx.flick()
          // 굴린 주사위만 잠깐 흔든다
          clearTimeout(rolling)
          rolling = window.setTimeout(() => {
            rolling = 0
            if (latest) draw()
          }, 450)
        }
        if (latest && s.last !== latest.last && s.last) (s.last.score ? sfx.gain : sfx.fall)()
        // 남길 주사위: 차례가 바뀌면 비우고, 새로 굴렸으면 굴릴 때 남긴 그대로 이어 간다
        if (!latest || latest.turn !== s.turn || s.rolls === 0) held = [false, false, false, false, false]
        else if (s.rollNo !== shownRoll) held = [...s.held]
        shownRoll = s.rollNo
        latest = s
        draw()
      },
      destroy() {
        clearTimeout(rolling)
        el.removeEventListener('click', onClick)
        el.innerHTML = ''
      },
    }
  },
}
