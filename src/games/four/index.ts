// 사목(2명): 7×6 세로 판의 열을 고르면 돌이 맨 아래 빈칸으로 떨어진다. 가로·세로·대각선으로 4개를 먼저 이으면 이긴다.
// 판이 가득 차면 무승부.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

export const COLS = 7
export const ROWS = 6
/** 칸 번호는 row * COLS + col, row 0이 맨 위 */
export type State = {
  order: string[]
  board: (0 | 1 | 2)[]
  /** 둘 차례(order 번호). 0번이 빨강 */
  turn: number
  last: number | null
  line: number[] | null
  winner: number | null
  draw: boolean
}
export type Move = { col: number }

const over = (s: State) => s.winner !== null || s.draw

/** 이 열에 두면 돌이 멈출 칸. 꽉 찼으면 -1 */
export function dropRow(board: State['board'], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === 0) return r
  return -1
}

/** cell을 지나는 4개 이상 줄(없으면 null) */
export function lineAt(board: State['board'], cell: number): number[] | null {
  const who = board[cell]
  if (!who) return null
  const r0 = Math.floor(cell / COLS)
  const c0 = cell % COLS
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    const line = [cell]
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign
      let c = c0 + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r * COLS + c] === who) {
        line.push(r * COLS + c)
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= 4) return line.sort((a, b) => a - b)
  }
  return null
}

export const four: GameDef<State, Move> = {
  turnSeconds: 20,

  init: (order, seed) => ({ order, board: Array(COLS * ROWS).fill(0), turn: seed % 2, last: null, line: null, winner: null, draw: false }),

  turnOf: (s) => (over(s) ? null : s.order[s.turn]),

  apply(s, by, { col }) {
    const me = s.order.indexOf(by)
    if (over(s) || me !== s.turn || !Number.isInteger(col) || col < 0 || col >= COLS) return null
    const row = dropRow(s.board, col)
    if (row < 0) return null
    const cell = row * COLS + col
    const board = [...s.board]
    board[cell] = (me + 1) as 1 | 2
    const line = lineAt(board, cell)
    return { ...s, board, last: cell, line, turn: 1 - me, winner: line ? me : null, draw: !line && !board.includes(0) }
  },

  skip: (s) => (over(s) ? s : { ...s, turn: 1 - s.turn }),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (over(s) || out < 0) return s
    return { ...s, winner: 1 - out }
  },

  result: (s) => (s.winner !== null ? { winners: [s.order[s.winner]] } : s.draw ? { winners: [] } : null),

  mount(el, ctx) {
    const COLORS = ['#e0483e', '#f4ecd8']
    el.innerHTML = `
      <div class="fr">
        <div class="fr-score"></div>
        <div class="fr-wrap"><canvas class="fr-board" aria-label="사목 판"></canvas></div>
        <p class="fr-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.fr-score')!
    const hint = el.querySelector<HTMLElement>('.fr-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!
    let latest: State | null = null
    let w = 0
    let hover: number | null = null
    // 방금 둔 돌이 떨어지는 움직임
    let drop: { cell: number; t0: number } | null = null
    let raf = 0

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !over(latest) && latest.turn === me()

    function layout() {
      const width = Math.floor(Math.min(el.clientWidth, 520, Math.max(260, (window.innerHeight - 250) * (COLS / ROWS))))
      if (width <= 0 || width === w) return
      w = width
      const h = Math.round((w * ROWS) / COLS)
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    function draw() {
      if (!w || !latest) return
      const s = latest
      const c = w / COLS
      const h = c * ROWS
      const r = c * 0.38
      g.clearRect(0, 0, w, h)
      // 판 뒤(빈 구멍으로 보이는 곳)는 어둡게 칠해 돌이 잘 보이게 한다
      g.fillStyle = '#3b2a1a'
      g.beginPath()
      g.roundRect(0, 0, w, h, 10)
      g.fill()
      // 돌은 판 뒤에서 떨어지는 것처럼 먼저 그리고, 구멍 뚫린 판을 위에 덮는다
      s.board.forEach((v, i) => {
        if (!v) return
        let y = Math.floor(i / COLS) * c + c / 2
        if (drop && drop.cell === i) {
          const t = Math.min(1, (performance.now() - drop.t0) / 320)
          y = -c / 2 + (y + c / 2) * t * t
        }
        g.fillStyle = COLORS[v - 1]
        g.beginPath()
        g.arc((i % COLS) * c + c / 2, y, r, 0, Math.PI * 2)
        g.fill()
      })
      g.fillStyle = '#b07a3e'
      g.beginPath()
      g.roundRect(0, 0, w, h, 10)
      for (let i = 0; i < COLS * ROWS; i++) {
        const x = (i % COLS) * c + c / 2
        const y = Math.floor(i / COLS) * c + c / 2
        g.moveTo(x + r, y)
        g.arc(x, y, r, 0, Math.PI * 2, true)
      }
      g.fill('evenodd')
      // 내 차례에 고른 열과 돌이 멈출 자리
      if (myTurn() && hover !== null) {
        const row = dropRow(s.board, hover)
        if (row >= 0) {
          g.globalAlpha = 0.45
          g.fillStyle = COLORS[me()]
          g.beginPath()
          g.arc(hover * c + c / 2, row * c + c / 2, r, 0, Math.PI * 2)
          g.fill()
          g.globalAlpha = 1
        }
      }
      if (s.line && !drop) {
        g.strokeStyle = '#2b2118'
        g.lineWidth = Math.max(3, c * 0.08)
        for (const i of s.line) {
          g.beginPath()
          g.arc((i % COLS) * c + c / 2, Math.floor(i / COLS) * c + c / 2, r * 0.7, 0, Math.PI * 2)
          g.stroke()
        }
      }
      if (drop) {
        if (performance.now() - drop.t0 < 320) raf = requestAnimationFrame(draw)
        else {
          drop = null
          sfx.place()
          draw()
        }
      }
    }

    function updateText() {
      const s = latest!
      const name = (i: number) => esc(ctx.names.get(s.order[i]) ?? '')
      score.innerHTML = [0, 1]
        .map((i) => `<span class="${s.turn === i && !over(s) ? 'is-turn' : ''}"><i style="background:${COLORS[i]}"></i>${name(i)}</span>`)
        .join('')
      hint.textContent = over(s) ? '' : myTurn() ? '돌을 떨어뜨릴 열을 눌러요.' : `${ctx.names.get(s.order[s.turn]) ?? ''} 차례`
    }

    const colAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS)
      return col >= 0 && col < COLS ? col : null
    }
    // 마우스는 올려 둔 열을 보여 주고 누르면 바로 둔다. 손가락은 한 번 눌러 고르고 같은 열을 다시 누르면 둔다
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !myTurn()) return
      const col = colAt(e)
      if (col !== hover) {
        hover = col
        draw()
      }
    }
    const onDown = (e: PointerEvent) => {
      if (!myTurn() || !latest) return
      const col = colAt(e)
      if (col === null || dropRow(latest.board, col) < 0) return
      if (e.pointerType !== 'mouse' && hover !== col) {
        hover = col
        draw()
        return
      }
      hover = null
      ctx.play({ col })
    }
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerdown', onDown)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        if (latest && s.last !== null && s.last !== latest.last && !document.hidden) drop = { cell: s.last, t0: performance.now() }
        latest = s
        if (!myTurn()) hover = null
        layout()
        updateText()
        cancelAnimationFrame(raf)
        draw()
      },
      destroy() {
        cancelAnimationFrame(raf)
        ro.disconnect()
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerdown', onDown)
        el.innerHTML = ''
      },
    }
  },
}
