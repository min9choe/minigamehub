// 체커(2명): 8×8 판의 어두운 칸에서 말을 대각선 앞으로 한 칸씩 옮긴다. 상대 말을 뛰어넘으면 잡는다.
// - 잡을 수 있으면 반드시 잡아야 한다. 잡은 말이 또 잡을 수 있으면 같은 말로 이어서 잡는다.
// - 끝줄에 닿으면 왕이 되어 뒤로도 움직인다(한 칸씩). 왕이 되면 그 차례는 끝난다.
// - 상대 말을 모두 잡거나 상대가 움직일 수 없게 만들면 이긴다. 40수 동안 잡지 않으면 무승부.
// 칸 번호는 y * 8 + x, y=0이 위쪽. 0번 사람은 아래(y 5~7)에서 위로, 1번 사람은 위(y 0~2)에서 아래로 간다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

export const N = 8
export const QUIET_LIMIT = 40
/** 칸 값: 0 빈칸, 1 0번 말, 2 0번 왕, 3 1번 말, 4 1번 왕 */
export type Cell = 0 | 1 | 2 | 3 | 4
export const ownerOf = (c: Cell) => (c === 0 ? -1 : c <= 2 ? 0 : 1)
const isKing = (c: Cell) => c === 2 || c === 4

export type State = {
  order: string[]
  board: Cell[]
  turn: number
  /** 이어서 잡아야 하는 말(연속 잡기 중) */
  chain: number | null
  /** 잡지 않고 지난 수 */
  quiet: number
  last: { from: number; to: number; captured: number | null } | null
  done: boolean
  winner: number | null
}
export type Move = { from: number; to: number }
export type Step = Move & { captured: number | null }

const at = (x: number, y: number) => (x >= 0 && x < N && y >= 0 && y < N ? y * N + x : -1)

function initialBoard(): Cell[] {
  const b: Cell[] = Array(N * N).fill(0)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if ((x + y) % 2 === 0) continue
      if (y < 3) b[y * N + x] = 3
      else if (y > 4) b[y * N + x] = 1
    }
  }
  return b
}

/** 한 말이 할 수 있는 이동(잡기와 보통 이동) */
function stepsFrom(board: Cell[], from: number): { jumps: Step[]; moves: Step[] } {
  const c = board[from]
  const who = ownerOf(c)
  const x = from % N
  const y = Math.floor(from / N)
  const forward = who === 0 ? -1 : 1
  const dys = isKing(c) ? [-1, 1] : [forward]
  const jumps: Step[] = []
  const moves: Step[] = []
  for (const dy of dys) {
    for (const dx of [-1, 1]) {
      const n = at(x + dx, y + dy)
      if (n < 0) continue
      if (board[n] === 0) moves.push({ from, to: n, captured: null })
      else if (ownerOf(board[n]) === 1 - who) {
        const j = at(x + dx * 2, y + dy * 2)
        if (j >= 0 && board[j] === 0) jumps.push({ from, to: j, captured: n })
      }
    }
  }
  return { jumps, moves }
}

/** 지금 차례에 할 수 있는 수. 잡을 수 있으면 잡는 수만 */
export function legalSteps(s: State): Step[] {
  if (s.done) return []
  if (s.chain !== null) return stepsFrom(s.board, s.chain).jumps
  const jumps: Step[] = []
  const moves: Step[] = []
  s.board.forEach((c, i) => {
    if (ownerOf(c) !== s.turn) return
    const r = stepsFrom(s.board, i)
    jumps.push(...r.jumps)
    moves.push(...r.moves)
  })
  return jumps.length ? jumps : moves
}

export function step(s: State, m: Move): State | null {
  const st = legalSteps(s).find((x) => x.from === m.from && x.to === m.to)
  if (!st) return null
  const board = [...s.board]
  let piece = board[st.from]
  board[st.from] = 0
  if (st.captured !== null) board[st.captured] = 0
  const y = Math.floor(st.to / N)
  const crowned = !isKing(piece) && ((piece === 1 && y === 0) || (piece === 3 && y === N - 1))
  if (crowned) piece = (piece + 1) as Cell
  board[st.to] = piece
  const last = { from: st.from, to: st.to, captured: st.captured }
  let next: State = { ...s, board, last, quiet: st.captured !== null ? 0 : s.quiet + 1, chain: null }
  // 잡은 뒤 같은 말로 또 잡을 수 있으면 이어서(왕이 된 순간은 끝)
  if (st.captured !== null && !crowned && stepsFrom(board, st.to).jumps.length) return { ...next, chain: st.to }
  next = { ...next, turn: 1 - s.turn }
  if (!legalSteps(next).length) return { ...next, done: true, winner: s.turn }
  if (next.quiet >= QUIET_LIMIT) return { ...next, done: true, winner: null }
  return next
}

export const checkers: GameDef<State, Move> = {
  turnSeconds: 30,

  init: (order, seed) => ({ order, board: initialBoard(), turn: seed % 2, chain: null, quiet: 0, last: null, done: false, winner: null }),

  turnOf: (s) => (s.done ? null : s.order[s.turn]),

  apply(s, by, m) {
    if (s.order.indexOf(by) !== s.turn || !Number.isInteger(m.from) || !Number.isInteger(m.to)) return null
    return step(s, m)
  },

  /** 시간이 다 되면 차례가 넘어간다(연속 잡기 중이었으면 거기서 멈춘다) */
  skip(s) {
    if (s.done) return s
    const next: State = { ...s, chain: null, turn: 1 - s.turn }
    if (!legalSteps(next).length) return { ...next, done: true, winner: s.turn }
    return next
  },

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.done || out < 0) return s
    return { ...s, done: true, winner: 1 - out }
  },

  result: (s) => (!s.done ? null : { winners: s.winner === null ? [] : [s.order[s.winner]] }),

  mount(el, ctx) {
    const PIECE = ['#e0483e', '#2b2f36']
    el.innerHTML = `
      <div class="ck">
        <div class="ck-score"></div>
        <div class="ck-wrap"><canvas class="ck-board" aria-label="체커 판"></canvas></div>
        <p class="ck-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.ck-score')!
    const hint = el.querySelector<HTMLElement>('.ck-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!
    let latest: State | null = null
    let size = 0
    let picked: number | null = null

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !latest.done && latest.turn === me()
    // 1번 사람은 판을 돌려 보여 준다. 누구든 내 말이 아래쪽에 있다
    const flipped = () => me() === 1

    function layout() {
      const w = Math.floor(Math.min(el.clientWidth, 520, Math.max(260, window.innerHeight - 250)))
      if (w <= 0 || w === size) return
      size = w
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = canvas.style.height = `${w}px`
      canvas.width = canvas.height = Math.round(w * dpr)
      draw()
    }

    function draw() {
      if (!size || !latest) return
      const s = latest
      const dpr = canvas.width / size
      const c = size / N
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (flipped()) {
        g.translate(size, size)
        g.rotate(Math.PI)
      }
      const steps = myTurn() ? legalSteps(s) : []
      const from = s.chain ?? picked
      const targets = steps.filter((st) => st.from === from).map((st) => st.to)
      const movable = new Set(steps.map((st) => st.from))
      for (let i = 0; i < N * N; i++) {
        const x = i % N
        const y = Math.floor(i / N)
        const dark = (x + y) % 2 === 1
        g.fillStyle = dark ? '#7a5a3a' : '#efe3cc'
        if (dark && s.last && (i === s.last.from || i === s.last.to)) g.fillStyle = '#9a7a46'
        if (targets.includes(i)) g.fillStyle = '#d9b43a'
        g.fillRect(x * c, y * c, c, c)
      }
      s.board.forEach((v, i) => {
        if (!v) return
        const x = (i % N) * c + c / 2
        const y = Math.floor(i / N) * c + c / 2
        const r = c * 0.38
        g.fillStyle = 'rgba(0,0,0,0.3)'
        g.beginPath()
        g.arc(x + 1.5, y + 2.5, r, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = PIECE[ownerOf(v)]
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = 'rgba(255,255,255,0.35)'
        g.lineWidth = 2
        g.beginPath()
        g.arc(x, y, r * 0.7, 0, Math.PI * 2)
        g.stroke()
        if (isKing(v)) {
          // 왕관: 판을 돌려도 바로 보이도록 글자 대신 도형으로 그린다
          g.fillStyle = '#ffd23f'
          g.beginPath()
          const k = r * 0.5
          g.moveTo(x - k, y + k * 0.5)
          g.lineTo(x - k, y - k * 0.4)
          g.lineTo(x - k * 0.5, y)
          g.lineTo(x, y - k * 0.7)
          g.lineTo(x + k * 0.5, y)
          g.lineTo(x + k, y - k * 0.4)
          g.lineTo(x + k, y + k * 0.5)
          g.closePath()
          g.fill()
        }
        if (i === from || (myTurn() && from === null && movable.has(i))) {
          g.strokeStyle = i === from ? '#ffd23f' : 'rgba(255,210,63,0.7)'
          g.lineWidth = i === from ? 3 : 2
          g.beginPath()
          g.arc(x, y, r + 2, 0, Math.PI * 2)
          g.stroke()
        }
      })
    }

    function updateText() {
      const s = latest!
      const mine = me() >= 0 ? me() : 0
      const count = (p: number) => s.board.filter((v) => ownerOf(v) === p).length
      score.innerHTML = [mine, 1 - mine]
        .map(
          (p) =>
            `<span class="${s.turn === p && !s.done ? 'is-turn' : ''}"><i style="background:${PIECE[p]}"></i>${esc(ctx.names.get(s.order[p]) ?? '')} <b>${count(p)}</b></span>`
        )
        .join('')
      const mustJump = myTurn() && legalSteps(s).some((st) => st.captured !== null)
      hint.textContent = s.done
        ? ''
        : !myTurn()
          ? `${ctx.names.get(s.order[s.turn]) ?? ''} 차례`
          : s.chain !== null
            ? '같은 말로 이어서 잡아요.'
            : mustJump
              ? '잡을 수 있는 말이 있으면 꼭 잡아야 해요.'
              : '움직일 말을 누르고, 노란 칸을 눌러 옮겨요.'
    }

    const onDown = (e: PointerEvent) => {
      const s = latest
      if (!s || !myTurn()) return
      const rect = canvas.getBoundingClientRect()
      let x = Math.floor(((e.clientX - rect.left) / rect.width) * N)
      let y = Math.floor(((e.clientY - rect.top) / rect.height) * N)
      if (flipped()) {
        x = N - 1 - x
        y = N - 1 - y
      }
      if (x < 0 || x >= N || y < 0 || y >= N) return
      const i = y * N + x
      const steps = legalSteps(s)
      const from = s.chain ?? picked
      const go = steps.find((st) => st.from === from && st.to === i)
      if (go) {
        picked = null
        ctx.play({ from: go.from, to: go.to })
        return
      }
      if (s.chain === null && steps.some((st) => st.from === i)) picked = i
      else if (s.chain === null) picked = null
      draw()
    }
    canvas.addEventListener('pointerdown', onDown)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        if (latest && s.last && s.last !== latest.last) (s.last.captured !== null ? sfx.flick : sfx.place)()
        latest = s
        if (!myTurn() || (picked !== null && !legalSteps(s).some((st) => st.from === picked))) picked = null
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
