// 리버시(뒤집기 돌판): 8×8 판, 흑 선공. 상대 돌을 내 돌 사이에 끼우도록 두면 끼인 돌이 모두 내 색으로 뒤집힌다.
// 뒤집을 수 있는 자리에만 둘 수 있고, 둘 곳이 없으면 차례가 자동으로 넘어간다. 둘 다 둘 곳이 없으면 끝나고 돌이 많은 쪽이 이긴다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import { drawStone } from '../shared/draw'
import type { GameDef } from '../types'

export const N = 8
export type Disc = 0 | 1 | 2 // 빈칸, 흑, 백

export type State = {
  order: string[]
  /** 흑을 맡는 사람(order 번호) */
  black: number
  board: Disc[]
  toMove: 1 | 2
  last: number | null
  /** 방금 뒤집힌 칸(화면에서 잠깐 강조) */
  flipped: number[]
  /** 둘 곳이 없어 차례가 넘어갔다는 안내 */
  passed: 1 | 2 | null
  done: boolean
  winner: number | null
}
export type Move = { cell: number }

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const

const other = (c: 1 | 2): 1 | 2 => (c === 1 ? 2 : 1)

/** color가 cell에 두면 뒤집히는 칸들(없으면 둘 수 없는 자리) */
export function flipsFor(board: Disc[], cell: number, color: 1 | 2): number[] {
  if (board[cell] !== 0) return []
  const x0 = cell % N
  const y0 = Math.floor(cell / N)
  const out: number[] = []
  for (const [dx, dy] of DIRS) {
    const line: number[] = []
    let x = x0 + dx
    let y = y0 + dy
    while (x >= 0 && x < N && y >= 0 && y < N && board[y * N + x] === other(color)) {
      line.push(y * N + x)
      x += dx
      y += dy
    }
    if (line.length && x >= 0 && x < N && y >= 0 && y < N && board[y * N + x] === color) out.push(...line)
  }
  return out
}

export function legalMoves(board: Disc[], color: 1 | 2): number[] {
  const moves: number[] = []
  for (let c = 0; c < N * N; c++) if (flipsFor(board, c, color).length) moves.push(c)
  return moves
}

export const count = (board: Disc[], color: 1 | 2) => board.filter((d) => d === color).length
export const colorOf = (s: State, player: number): 1 | 2 => (player === s.black ? 1 : 2)
const playerOf = (s: State, color: 1 | 2) => (color === 1 ? s.black : 1 - s.black)

function finish(s: State): State {
  const b = count(s.board, 1)
  const w = count(s.board, 2)
  return { ...s, done: true, winner: b === w ? null : playerOf(s, b > w ? 1 : 2) }
}

/** 다음 차례를 정한다: 상대가 둘 곳이 없으면 내가 한 번 더, 둘 다 없으면 끝 */
function advance(s: State, justMoved: 1 | 2): State {
  const next = other(justMoved)
  if (legalMoves(s.board, next).length) return { ...s, toMove: next, passed: null }
  if (legalMoves(s.board, justMoved).length) return { ...s, toMove: justMoved, passed: next }
  return finish({ ...s, passed: null })
}

function initialBoard(): Disc[] {
  const b: Disc[] = Array(N * N).fill(0)
  b[27] = b[36] = 2
  b[28] = b[35] = 1
  return b
}

export const reversi: GameDef<State, Move> = {
  turnSeconds: 20,

  init: (order, seed) => ({
    order,
    black: seed % 2,
    board: initialBoard(),
    toMove: 1,
    last: null,
    flipped: [],
    passed: null,
    done: false,
    winner: null,
  }),

  turnOf: (s) => (s.done ? null : s.order[playerOf(s, s.toMove)]),

  apply(s, by, { cell }) {
    const me = s.order.indexOf(by)
    if (s.done || me < 0 || colorOf(s, me) !== s.toMove || !Number.isInteger(cell) || cell < 0 || cell >= N * N) return null
    const flips = flipsFor(s.board, cell, s.toMove)
    if (!flips.length) return null
    const board = [...s.board]
    board[cell] = s.toMove
    for (const f of flips) board[f] = s.toMove
    return advance({ ...s, board, last: cell, flipped: flips }, s.toMove)
  },

  /** 시간 안에 두지 않으면 차례만 넘어간다 */
  skip: (s) => (s.done ? s : advance({ ...s, flipped: [] }, s.toMove)),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.done || out < 0) return s
    return { ...s, done: true, winner: 1 - out }
  },

  result: (s) => (!s.done ? null : { winners: s.winner === null ? [] : [s.order[s.winner]] }),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="rv">
        <div class="rv-score"></div>
        <p class="rv-info"></p>
        <div class="rv-wrap"><canvas class="rv-board" aria-label="리버시 판"></canvas></div>
        <p class="rv-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.rv-score')!
    const info = el.querySelector<HTMLElement>('.rv-info')!
    const hint = el.querySelector<HTMLElement>('.rv-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!
    let latest: State | null = null
    let size = 0

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !latest.done && me() >= 0 && colorOf(latest, me()) === latest.toMove

    function layout() {
      const w = Math.floor(Math.min(el.clientWidth, 520, Math.max(260, window.innerHeight - 250)))
      if (w <= 0 || w === size) return
      size = w
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = canvas.style.height = `${w}px`
      canvas.width = canvas.height = Math.round(w * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    function draw() {
      if (!size || !latest) return
      const s = latest
      const c = size / N
      g.fillStyle = '#1f7a4a'
      g.fillRect(0, 0, size, size)
      g.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      g.lineWidth = 1
      g.beginPath()
      for (let i = 1; i < N; i++) {
        const p = Math.round(i * c) + 0.5
        g.moveTo(p, 0)
        g.lineTo(p, size)
        g.moveTo(0, p)
        g.lineTo(size, p)
      }
      g.stroke()
      const r = c * 0.4
      s.board.forEach((d, i) => {
        if (!d) return
        const x = (i % N) * c + c / 2
        const y = Math.floor(i / N) * c + c / 2
        if (s.flipped.includes(i) || i === s.last) {
          g.fillStyle = 'rgba(255, 230, 120, 0.25)'
          g.fillRect((i % N) * c, Math.floor(i / N) * c, c, c)
        }
        drawStone(g, x, y, r, d === 1 ? 'black' : 'white')
      })
      // 내 차례에는 둘 수 있는 자리를 점으로 알려 준다
      if (myTurn()) {
        g.fillStyle = 'rgba(255, 255, 255, 0.35)'
        for (const m of legalMoves(s.board, s.toMove)) {
          g.beginPath()
          g.arc((m % N) * c + c / 2, Math.floor(m / N) * c + c / 2, c * 0.12, 0, Math.PI * 2)
          g.fill()
        }
      }
      if (s.last !== null) {
        g.fillStyle = '#d64545'
        g.beginPath()
        g.arc((s.last % N) * c + c / 2, Math.floor(s.last / N) * c + c / 2, Math.max(2, c * 0.08), 0, Math.PI * 2)
        g.fill()
      }
    }

    function updateText() {
      const s = latest!
      const i = me()
      const left = i >= 0 ? i : 0
      const right = 1 - left
      const name = (p: number) => esc(ctx.names.get(s.order[p]) ?? '')
      const dot = (p: number) => (colorOf(s, p) === 1 ? '●' : '○')
      score.innerHTML = `
        <span>${dot(left)} ${name(left)}</span>
        <b>${count(s.board, colorOf(s, left))} : ${count(s.board, colorOf(s, right))}</b>
        <span>${name(right)} ${dot(right)}</span>`
      info.textContent = s.done ? '게임 끝' : myTurn() ? '내 차례' : `${ctx.names.get(s.order[playerOf(s, s.toMove)])} 차례`
      hint.textContent = s.passed
        ? `${ctx.names.get(s.order[playerOf(s, s.passed)])}님은 둘 곳이 없어 차례를 넘겼어요.`
        : myTurn()
          ? '점이 찍힌 자리에 둘 수 있어요.'
          : ''
    }

    const onDown = (e: PointerEvent) => {
      if (!myTurn() || !latest) return
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * N)
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * N)
      if (x < 0 || x >= N || y < 0 || y >= N) return
      if (flipsFor(latest.board, y * N + x, latest.toMove).length) ctx.play({ cell: y * N + x })
    }
    canvas.addEventListener('pointerdown', onDown)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        if (latest && s.last !== latest.last && s.last !== null) sfx.place()
        latest = s
        layout()
        updateText()
        draw()
      },
      destroy() {
        ro.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        el.innerHTML = ''
      },
    }
  },
}
