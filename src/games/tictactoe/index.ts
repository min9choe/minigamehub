// 틱택토(기획안 4장): 3×3 판에서 X가 선공, 한 줄을 먼저 완성하면 그 판 승리. 3판 2선승이고 무승부 판은 세지 않고 다시 한다.
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

type Cell = 0 | 1 | 2 // 빈칸, X, O
type Board = Cell[]

type State = {
  order: string[]
  /** 첫 판에서 X를 맡는 사람(order 번호). 판마다 X가 번갈아 바뀐다 */
  firstX: number
  board: Board
  boardNo: number
  turn: number
  wins: number[]
  /** 방금 끝난 판. 화면에서 잠깐 보여 준 뒤 새 판으로 넘어간다 */
  prev: { cells: Board; line: number[] | null; winner: number | null } | null
  winner: number | null
}
type Move = { cell: number }

const WINS_NEEDED = 2
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]
const SYMBOL = ['', 'X', 'O']

const empty = (): Board => Array(9).fill(0)
const xOf = (s: State, boardNo = s.boardNo) => (s.firstX + boardNo) % 2
const markOf = (s: State, player: number): Cell => (player === xOf(s) ? 1 : 2)

function findLine(b: Board): number[] | null {
  return LINES.find(([a, c, d]) => b[a] !== 0 && b[a] === b[c] && b[a] === b[d]) ?? null
}

export const tictactoe: GameDef<State, Move> = {
  turnSeconds: 15,

  init: (order, seed) => ({
    order,
    firstX: seed % 2,
    board: empty(),
    boardNo: 0,
    turn: seed % 2,
    wins: [0, 0],
    prev: null,
    winner: null,
  }),

  turnOf: (s) => (s.winner === null ? s.order[s.turn] : null),

  apply(s, by, { cell }) {
    const me = s.order.indexOf(by)
    if (s.winner !== null || me !== s.turn || !Number.isInteger(cell) || cell < 0 || cell > 8 || s.board[cell] !== 0) {
      return null
    }
    const cells = [...s.board]
    cells[cell] = markOf(s, me)
    const line = findLine(cells)

    if (!line && cells.includes(0)) return { ...s, board: cells, turn: 1 - me }

    const wins = [...s.wins]
    if (line) wins[me] += 1
    const prev = { cells, line, winner: line ? me : null }
    if (wins[me] >= WINS_NEEDED) return { ...s, board: cells, wins, prev, winner: me }
    // 판이 끝났다(승리 또는 무승부). 다음 판은 X를 바꿔 새로 시작한다
    const boardNo = s.boardNo + 1
    return { ...s, board: empty(), boardNo, turn: xOf(s, boardNo), wins, prev }
  },

  skip: (s) => (s.winner === null ? { ...s, turn: 1 - s.turn } : s),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.winner !== null || out < 0) return s
    return { ...s, winner: 1 - out }
  },

  result: (s) => (s.winner === null ? null : { winners: [s.order[s.winner]] }),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="ttt">
        <div class="ttt-score"></div>
        <p class="ttt-info"></p>
        <div class="ttt-grid" role="grid">
          ${Array.from({ length: 9 }, (_, i) => `<button class="ttt-cell" type="button" data-cell="${i}" aria-label="${i + 1}번 칸"></button>`).join('')}
        </div>
      </div>`
    const score = el.querySelector<HTMLElement>('.ttt-score')!
    const info = el.querySelector<HTMLElement>('.ttt-info')!
    const cells = [...el.querySelectorAll<HTMLButtonElement>('.ttt-cell')]

    let latest: State | null = null
    let shownBoardNo = -1
    let prevUntil = 0
    let prevTimer = 0

    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-cell]')
      if (b && !b.disabled) ctx.play({ cell: Number(b.dataset.cell) })
    }
    el.addEventListener('click', onClick)

    function draw() {
      const s = latest
      if (!s) return
      const me = s.order.indexOf(ctx.myId)
      const opp = me === 0 ? 1 : 0
      const showPrev = s.prev && Date.now() < prevUntil
      const board = showPrev ? s.prev!.cells : s.board
      const line = showPrev ? s.prev!.line : s.winner !== null ? s.prev?.line ?? null : null

      const left = me >= 0 ? me : 0
      const right = me >= 0 ? opp : 1
      score.innerHTML = `
        <span>${esc(ctx.names.get(s.order[left]) ?? '')}</span>
        <b>${s.wins[left]} : ${s.wins[right]}</b>
        <span>${esc(ctx.names.get(s.order[right]) ?? '')}</span>`
      info.textContent = showPrev
        ? s.prev!.winner === null
          ? '무승부! 다시 해요'
          : `${ctx.names.get(s.order[s.prev!.winner])} 이 판 승리`
        : me >= 0
          ? `${s.boardNo + 1}번째 판 · 나는 ${SYMBOL[markOf(s, me)]}${xOf(s) === me ? '(선공)' : ''} · ${WINS_NEEDED}판 먼저 이기면 승리`
          : `${s.boardNo + 1}번째 판`

      const myTurn = !showPrev && s.winner === null && s.turn === me
      cells.forEach((c, i) => {
        c.textContent = SYMBOL[board[i]]
        c.dataset.mark = SYMBOL[board[i]]
        c.classList.toggle('is-line', !!line?.includes(i))
        c.disabled = !myTurn || board[i] !== 0
      })
    }

    return {
      render(s) {
        latest = s
        if (s.boardNo !== shownBoardNo) {
          // 새 판으로 넘어갔으면 끝난 판을 1.5초 보여 준다
          if (shownBoardNo >= 0 && s.prev) {
            prevUntil = Date.now() + 1500
            clearTimeout(prevTimer)
            prevTimer = window.setTimeout(draw, 1550)
          }
          shownBoardNo = s.boardNo
        }
        draw()
      },
      destroy() {
        clearTimeout(prevTimer)
        el.removeEventListener('click', onClick)
        el.innerHTML = ''
      },
    }
  },
}

