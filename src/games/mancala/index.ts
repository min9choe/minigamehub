// 만칼라(2명, 칼라 규칙): 내 구멍 6개에서 하나를 골라 씨앗을 모두 집어 반시계 방향으로 한 알씩 뿌린다.
// - 칸 번호: 0~5 0번 사람 구멍, 6 0번 창고, 7~12 1번 사람 구멍, 13 1번 창고. 상대 창고는 건너뛴다.
// - 마지막 씨앗이 내 창고에 들어가면 한 번 더 한다.
// - 마지막 씨앗이 비어 있던 내 구멍에 떨어지고 맞은편 구멍에 씨앗이 있으면, 둘 다 내 창고로 가져온다.
// - 한쪽 구멍이 모두 비면 끝난다. 남은 씨앗은 각자 자기 창고로 가고, 창고에 많은 쪽이 이긴다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

export const PITS = 6
export const SEEDS = 4
export const store = (p: number) => (p === 0 ? PITS : PITS * 2 + 1)
export const pitsOf = (p: number) => Array.from({ length: PITS }, (_, i) => p * (PITS + 1) + i)
const opposite = (i: number) => PITS * 2 - i

export type State = {
  order: string[]
  board: number[]
  turn: number
  /** 방금 씨앗이 떨어진 칸들(화면 강조) */
  sown: number[]
  /** 방금 가져온 칸(잡기) */
  captured: number[]
  extra: boolean
  done: boolean
  winner: number | null
}
export type Move = { pit: number }

/** 씨앗을 뿌린 결과. 규칙에 어긋나면 null */
export function sow(s: State, pit: number): State | null {
  const me = s.turn
  if (s.done || !pitsOf(me).includes(pit) || s.board[pit] === 0) return null
  const board = [...s.board]
  let seeds = board[pit]
  board[pit] = 0
  let i = pit
  const sown: number[] = []
  while (seeds > 0) {
    i = (i + 1) % board.length
    if (i === store(1 - me)) continue
    board[i] += 1
    sown.push(i)
    seeds -= 1
  }
  const captured: number[] = []
  if (pitsOf(me).includes(i) && board[i] === 1 && board[opposite(i)] > 0) {
    board[store(me)] += board[i] + board[opposite(i)]
    captured.push(i, opposite(i))
    board[i] = 0
    board[opposite(i)] = 0
  }
  const extra = i === store(me)
  const next: State = { ...s, board, sown, captured, extra, turn: extra ? me : 1 - me }
  // 어느 한쪽이 비면 끝: 남은 씨앗은 각자 창고로
  if (pitsOf(0).every((k) => board[k] === 0) || pitsOf(1).every((k) => board[k] === 0)) {
    for (const p of [0, 1]) {
      for (const k of pitsOf(p)) {
        board[store(p)] += board[k]
        board[k] = 0
      }
    }
    const a = board[store(0)]
    const b = board[store(1)]
    return { ...next, extra: false, done: true, winner: a === b ? null : a > b ? 0 : 1 }
  }
  return next
}

export const mancala: GameDef<State, Move> = {
  turnSeconds: 20,

  init: (order, seed) => ({
    order,
    board: Array.from({ length: (PITS + 1) * 2 }, (_, i) => (i === store(0) || i === store(1) ? 0 : SEEDS)),
    turn: seed % 2,
    sown: [],
    captured: [],
    extra: false,
    done: false,
    winner: null,
  }),

  turnOf: (s) => (s.done ? null : s.order[s.turn]),

  apply(s, by, { pit }) {
    if (s.order.indexOf(by) !== s.turn || !Number.isInteger(pit)) return null
    return sow(s, pit)
  },

  skip: (s) => (s.done ? s : { ...s, turn: 1 - s.turn, sown: [], captured: [], extra: false }),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.done || out < 0) return s
    return { ...s, done: true, winner: 1 - out }
  },

  result: (s) => (!s.done ? null : { winners: s.winner === null ? [] : [s.order[s.winner]] }),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="mc">
        <div class="mc-score"></div>
        <div class="mc-board">
          <div class="mc-store" data-side="them"></div>
          <div class="mc-row" data-side="them"></div>
          <div class="mc-row" data-side="me"></div>
          <div class="mc-store" data-side="me"></div>
        </div>
        <p class="mc-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.mc-score')!
    const hint = el.querySelector<HTMLElement>('.mc-hint')!
    const rows = { me: el.querySelector<HTMLElement>('.mc-row[data-side=me]')!, them: el.querySelector<HTMLElement>('.mc-row[data-side=them]')! }
    const stores = { me: el.querySelector<HTMLElement>('.mc-store[data-side=me]')!, them: el.querySelector<HTMLElement>('.mc-store[data-side=them]')! }
    let latest: State | null = null

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !latest.done && latest.turn === me()
    const name = (p: number) => esc(ctx.names.get(latest!.order[p]) ?? '')

    /** 씨앗 수만큼 작은 알을 흩어 그린다(많으면 숫자만 크게) */
    const seedsHtml = (n: number, cell: number) =>
      Array.from({ length: Math.min(n, 14) }, (_, k) => {
        const a = (k * 137.5 + cell * 40) * (Math.PI / 180)
        const r = 10 + (k % 5) * 6
        return `<i style="left:calc(50% + ${Math.round(Math.cos(a) * r)}%);top:calc(50% + ${Math.round(Math.sin(a) * r)}%);--h:${(k * 47 + cell * 23) % 360}"></i>`
      }).join('')

    function draw() {
      const s = latest!
      // 나는 아래 줄(왼쪽에서 오른쪽으로 뿌려 오른쪽 창고로), 상대는 위 줄(오른쪽에서 왼쪽으로 뿌려 왼쪽 창고로)
      const mine = me() >= 0 ? me() : 0
      const theirs = 1 - mine
      const pit = (i: number, clickable: boolean) => {
        const cls = ['mc-pit', s.sown.includes(i) && 'is-sown', s.captured.includes(i) && 'is-captured'].filter(Boolean).join(' ')
        return `<button class="${cls}" type="button" data-pit="${i}" ${clickable && s.board[i] > 0 ? '' : 'disabled'} aria-label="씨앗 ${s.board[i]}개">${seedsHtml(s.board[i], i)}<b>${s.board[i]}</b></button>`
      }
      rows.me.innerHTML = pitsOf(mine).map((i) => pit(i, myTurn())).join('')
      rows.them.innerHTML = [...pitsOf(theirs)].reverse().map((i) => pit(i, false)).join('')
      for (const [side, p] of [['me', mine], ['them', theirs]] as const) {
        const i = store(p)
        stores[side].classList.toggle('is-sown', s.sown.includes(i))
        stores[side].innerHTML = `${seedsHtml(s.board[i], i)}<b>${s.board[i]}</b>`
      }
      score.innerHTML = [mine, theirs]
        .map((p) => `<span class="${s.turn === p && !s.done ? 'is-turn' : ''}">${name(p)} <b>${s.board[store(p)]}</b></span>`)
        .join('')
      hint.textContent = s.done
        ? ''
        : myTurn()
          ? s.extra
            ? '마지막 씨앗이 창고에 들어가서 한 번 더 해요.'
            : '내 구멍(아래 줄)을 하나 골라 씨앗을 뿌려요. 오른쪽이 내 창고예요.'
          : `${ctx.names.get(s.order[s.turn]) ?? ''} 차례${s.extra ? '. 한 번 더!' : ''}`
    }

    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-pit]')
      if (!b || b.disabled || !myTurn()) return
      ctx.play({ pit: Number(b.dataset.pit) })
    }
    el.addEventListener('click', onClick)

    return {
      render(s) {
        if (latest && s.sown !== latest.sown && s.sown.length) (s.captured.length ? sfx.gain : sfx.place)()
        latest = s
        draw()
      },
      destroy() {
        el.removeEventListener('click', onClick)
        el.innerHTML = ''
      },
    }
  },
}
