// 매칭 확인용 더미 게임(기획안 8장 2단계): 차례대로 1이나 2를 더해 10을 만드는 사람이 이긴다.
import type { GameDef } from '../types'

const GOAL = 10

type State = {
  order: string[]
  out: string[]
  total: number
  turn: number
  last: { by: string; add: number } | null
  winner: string | null
}
type Move = { add: 1 | 2 }

function nextTurn(s: State, out = s.out): number {
  for (let i = 1; i <= s.order.length; i++) {
    const idx = (s.turn + i) % s.order.length
    if (!out.includes(s.order[idx])) return idx
  }
  return s.turn
}

export const count10: GameDef<State, Move> = {
  turnSeconds: 15,

  init: (order) => ({ order, out: [], total: 0, turn: 0, last: null, winner: null }),

  turnOf: (s) => (s.winner ? null : s.order[s.turn]),

  apply(s, by, move) {
    if (s.winner || by !== s.order[s.turn] || (move.add !== 1 && move.add !== 2)) return null
    const total = Math.min(GOAL, s.total + move.add)
    const won = total >= GOAL
    return { ...s, total, last: { by, add: move.add }, winner: won ? by : null, turn: won ? s.turn : nextTurn(s) }
  },

  skip: (s) => (s.winner ? s : { ...s, last: null, turn: nextTurn(s) }),

  eliminate(s, id) {
    if (s.winner || s.out.includes(id)) return s
    const out = [...s.out, id]
    const alive = s.order.filter((p) => !out.includes(p))
    if (alive.length === 1) return { ...s, out, winner: alive[0] }
    return { ...s, out, turn: s.order[s.turn] === id ? nextTurn(s, out) : s.turn }
  },

  result: (s) => (s.winner ? { winners: [s.winner] } : null),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="c10">
        <p class="c10-rule">차례마다 1이나 2를 더해요. ${GOAL}을 만드는 사람이 이겨요.</p>
        <div class="c10-total" aria-live="polite">0</div>
        <p class="c10-last"></p>
        <div class="c10-actions">
          <button class="btn primary" type="button" data-add="1">+1</button>
          <button class="btn primary" type="button" data-add="2">+2</button>
        </div>
      </div>`
    const total = el.querySelector<HTMLElement>('.c10-total')!
    const last = el.querySelector<HTMLElement>('.c10-last')!
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('[data-add]')]

    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-add]')
      if (b && !b.disabled) ctx.play({ add: Number(b.dataset.add) as 1 | 2 })
    }
    el.addEventListener('click', onClick)

    return {
      render(s) {
        total.textContent = String(s.total)
        last.textContent = s.last ? `${ctx.names.get(s.last.by)} +${s.last.add}` : ' '
        const myTurn = !s.winner && s.order[s.turn] === ctx.myId
        for (const b of buttons) b.disabled = !myTurn
      },
      destroy() {
        el.removeEventListener('click', onClick)
        el.innerHTML = ''
      },
    }
  },
}
