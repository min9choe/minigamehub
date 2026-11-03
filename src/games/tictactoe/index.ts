// 틱택토(기획안 4장): 3×3 판에서 X가 선공, 한 줄을 먼저 완성하면 그 판 승리. 3판 2선승.
// 표시는 각자 3개까지만 남는다. 4번째를 놓는 순간 내가 가장 먼저 놓은 표시가 사라지므로 판이 차지 않고,
// 무승부 없이 누군가 한 줄을 만들 때까지 계속된다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

export type Cell = 0 | 1 | 2 // 빈칸, X, O
type Board = Cell[]

export type State = {
  order: string[]
  /** 첫 판에서 X를 맡는 사람(order 번호). 판마다 X가 번갈아 바뀐다 */
  firstX: number
  board: Board
  /** 이번 판에서 각자 놓은 칸, 놓은 순서대로. 맨 앞이 다음에 사라질 표시 */
  history: number[][]
  boardNo: number
  turn: number
  wins: number[]
  /** 방금 끝난 판. 화면에서 잠깐 보여 준 뒤 새 판으로 넘어간다 */
  prev: { cells: Board; line: number[]; winner: number } | null
  winner: number | null
}
export type Move = { cell: number }

const WINS_NEEDED = 2
export const MAX_MARKS = 3
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]
const SYMBOL = ['', 'X', 'O']

const empty = (): Board => Array(9).fill(0)
const xOf = (s: State, boardNo = s.boardNo) => (s.firstX + boardNo) % 2
export const markOf = (s: State, player: number): Cell => (player === xOf(s) ? 1 : 2)

export function findLine(b: Board): number[] | null {
  return LINES.find(([a, c, d]) => b[a] !== 0 && b[a] === b[c] && b[a] === b[d]) ?? null
}

/** 이 사람이 다음에 두면 사라질 칸(표시가 이미 3개일 때) */
export function fadingCell(s: State, player: number): number | null {
  const h = s.history[player]
  return h.length >= MAX_MARKS ? h[0] : null
}

/** player가 cell에 두었을 때의 판: 새 표시를 놓고, 4번째면 가장 오래된 표시를 지운다 */
export function boardAfter(s: State, player: number, cell: number): Board {
  const b = [...s.board]
  b[cell] = markOf(s, player)
  const old = fadingCell(s, player)
  if (old !== null) b[old] = 0
  return b
}

export const tictactoe: GameDef<State, Move> = {
  turnSeconds: 15,

  init: (order, seed) => ({
    order,
    firstX: seed % 2,
    board: empty(),
    history: [[], []],
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
    // 가장 오래된 표시를 지운 다음에 줄을 확인한다(사라진 표시로는 줄을 만들 수 없다)
    const cells = boardAfter(s, me, cell)
    const history = s.history.map((h, i) => (i === me ? [...h, cell].slice(-MAX_MARKS) : h))
    const line = findLine(cells)
    if (!line) return { ...s, board: cells, history, turn: 1 - me }

    const wins = [...s.wins]
    wins[me] += 1
    const prev = { cells, line, winner: me }
    if (wins[me] >= WINS_NEEDED) return { ...s, board: cells, history, wins, prev, winner: me }
    // 이 판을 이겼다. 다음 판은 X를 바꿔 새로 시작한다
    const boardNo = s.boardNo + 1
    return { ...s, board: empty(), history: [[], []], boardNo, turn: xOf(s, boardNo), wins, prev }
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
        <p class="ttt-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.ttt-score')!
    const info = el.querySelector<HTMLElement>('.ttt-info')!
    const hint = el.querySelector<HTMLElement>('.ttt-hint')!
    const cells = [...el.querySelectorAll<HTMLButtonElement>('.ttt-cell')]

    let latest: State | null = null
    let lastKey = ''
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
        ? `${ctx.names.get(s.order[s.prev!.winner])} 이 판 승리`
        : me >= 0
          ? `${s.boardNo + 1}번째 판 · 나는 ${SYMBOL[markOf(s, me)]}${xOf(s) === me ? '(선공)' : ''} · ${WINS_NEEDED}판 먼저 이기면 승리`
          : `${s.boardNo + 1}번째 판`
      hint.textContent = showPrev || s.winner !== null ? '' : `표시는 ${MAX_MARKS}개까지 남아요. 흐린 표시는 다음 수에 사라져요.`

      const myTurn = !showPrev && s.winner === null && s.turn === me
      // 지금 둘 사람의 가장 오래된 표시를 흐리게 보여 준다
      const fading = !showPrev && s.winner === null ? fadingCell(s, s.turn) : null
      cells.forEach((c, i) => {
        c.textContent = SYMBOL[board[i]]
        c.dataset.mark = SYMBOL[board[i]]
        c.classList.toggle('is-line', !!line?.includes(i))
        c.classList.toggle('is-fading', i === fading)
        c.disabled = !myTurn || board[i] !== 0
      })
    }

    return {
      render(s) {
        // 누가 둘 때마다(판이 넘어가도) 소리를 낸다. 처음 그릴 때는 내지 않는다
        const key = `${s.boardNo}:${s.board.join('')}`
        if (latest && key !== lastKey) sfx.place()
        lastKey = key
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

