// 오목(기획안 4장): 15×15 판, 흑 선공, 5목 이상 승리, 흑만 3-3 금수. 판정은 rules.ts에 있다.
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'
import { BLACK, EMPTY, N, WHITE, fiveLine, forbiddenPoints, idx, isForbidden, type Stone } from './rules'

type State = {
  order: string[]
  /** 흑을 맡는 사람(order 번호). 판마다 시드로 정한다 */
  black: number
  stones: Stone[]
  /** 둘 차례인 색 */
  toMove: 1 | 2
  last: number | null
  line: number[] | null
  winner: number | null
  draw: boolean
}
type Move = { x: number; y: number }

const colorOf = (s: State, player: number): Stone => (player === s.black ? BLACK : WHITE)
const playerOf = (s: State, color: Stone) => (color === BLACK ? s.black : 1 - s.black)
const over = (s: State) => s.winner !== null || s.draw

export const omok: GameDef<State, Move> = {
  turnSeconds: 30,

  init: (order, seed) => ({
    order,
    black: seed % 2,
    stones: Array(N * N).fill(EMPTY),
    toMove: BLACK,
    last: null,
    line: null,
    winner: null,
    draw: false,
  }),

  turnOf: (s) => (over(s) ? null : s.order[playerOf(s, s.toMove)]),

  apply(s, by, { x, y }) {
    const me = s.order.indexOf(by)
    if (over(s) || me < 0 || colorOf(s, me) !== s.toMove) return null
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= N || y < 0 || y >= N) return null
    const p = idx(x, y)
    if (s.stones[p] !== EMPTY) return null
    if (s.toMove === BLACK && isForbidden(s.stones, p)) return null

    const stones = [...s.stones]
    stones[p] = s.toMove
    const line = fiveLine(stones, p)
    return {
      ...s,
      stones,
      last: p,
      line,
      winner: line ? me : null,
      draw: !line && !stones.includes(EMPTY),
      toMove: s.toMove === BLACK ? WHITE : BLACK,
    }
  },

  skip: (s) => (over(s) ? s : { ...s, toMove: s.toMove === BLACK ? WHITE : BLACK }),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (over(s) || out < 0) return s
    return { ...s, winner: 1 - out }
  },

  result: (s) => (s.winner !== null ? { winners: [s.order[s.winner]] } : s.draw ? { winners: [] } : null),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="omok">
        <p class="omok-info"></p>
        <div class="omok-wrap"><canvas class="omok-board" aria-label="오목판"></canvas></div>
        <div class="omok-actions">
          <span class="omok-hint"></span>
          <button class="btn primary" type="button" data-action="place" disabled>여기에 두기</button>
        </div>
      </div>`
    const info = el.querySelector<HTMLElement>('.omok-info')!
    const hint = el.querySelector<HTMLElement>('.omok-hint')!
    const placeBtn = el.querySelector<HTMLButtonElement>('[data-action=place]')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!

    let latest: State | null = null
    let forbidden: number[] = []
    let forbiddenFor: State | null = null
    // 손가락으로 정확히 누르기 어려우므로, 한 번 누르면 미리보기를 두고 다시 누르거나 버튼으로 확정한다
    let ghost: number | null = null
    let size = 0

    const myColor = () => {
      const me = latest ? latest.order.indexOf(ctx.myId) : -1
      return latest && me >= 0 ? colorOf(latest, me) : null
    }
    const myTurn = () => !!latest && !over(latest) && myColor() === latest.toMove

    function layout() {
      // 가로로는 화면 폭, 세로로는 위쪽 참가자 정보와 아래 버튼이 함께 보이는 크기
      const w = Math.floor(Math.min(el.clientWidth, 640, Math.max(280, window.innerHeight - 230)))
      if (w <= 0 || w === size) return
      size = w
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = canvas.style.height = `${w}px`
      canvas.width = canvas.height = Math.round(w * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    const cell = () => size / (N + 1)
    // 1px 선이 번지지 않도록 픽셀 가운데에 맞춘다
    const pos = (i: number) => Math.round(cell() * (i + 1)) + 0.5

    function draw() {
      if (!size) return
      const s = latest
      const c = cell()
      g.fillStyle = '#dcb468'
      g.fillRect(0, 0, size, size)
      g.strokeStyle = '#5c4320'
      g.lineWidth = 1
      g.beginPath()
      for (let i = 0; i < N; i++) {
        g.moveTo(pos(0), pos(i))
        g.lineTo(pos(N - 1), pos(i))
        g.moveTo(pos(i), pos(0))
        g.lineTo(pos(i), pos(N - 1))
      }
      g.stroke()
      g.fillStyle = '#5c4320'
      for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) {
        g.beginPath()
        g.arc(pos(x), pos(y), Math.max(2, c * 0.1), 0, Math.PI * 2)
        g.fill()
      }
      if (!s) return

      const r = c * 0.45
      s.stones.forEach((st, p) => {
        if (st === EMPTY) return
        const x = pos(p % N)
        const y = pos(Math.floor(p / N))
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fillStyle = st === BLACK ? '#151515' : '#f7f7f2'
        g.fill()
        g.strokeStyle = st === BLACK ? '#000' : '#8a8a80'
        g.lineWidth = 1
        g.stroke()
      })

      // 흑 차례에는 금수 자리를 X로 표시한다
      if (!over(s) && s.toMove === BLACK) {
        g.strokeStyle = '#d64545'
        g.lineWidth = Math.max(1.5, c * 0.08)
        const d = c * 0.22
        for (const p of forbidden) {
          const x = pos(p % N)
          const y = pos(Math.floor(p / N))
          g.beginPath()
          g.moveTo(x - d, y - d)
          g.lineTo(x + d, y + d)
          g.moveTo(x + d, y - d)
          g.lineTo(x - d, y + d)
          g.stroke()
        }
      }

      if (s.last !== null) {
        g.fillStyle = '#d64545'
        g.beginPath()
        g.arc(pos(s.last % N), pos(Math.floor(s.last / N)), Math.max(2, c * 0.13), 0, Math.PI * 2)
        g.fill()
      }

      if (ghost !== null && myTurn()) {
        g.globalAlpha = 0.5
        g.beginPath()
        g.arc(pos(ghost % N), pos(Math.floor(ghost / N)), r, 0, Math.PI * 2)
        g.fillStyle = myColor() === BLACK ? '#151515' : '#f7f7f2'
        g.fill()
        g.globalAlpha = 1
      }

      if (s.line) {
        const a = s.line[0]
        const b = s.line[s.line.length - 1]
        g.strokeStyle = '#2f6fde'
        g.lineWidth = Math.max(3, c * 0.18)
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(pos(a % N), pos(Math.floor(a / N)))
        g.lineTo(pos(b % N), pos(Math.floor(b / N)))
        g.stroke()
        g.lineCap = 'butt'
      }
    }

    function updateControls() {
      const s = latest
      if (!s) return
      const mine = myColor()
      const colorName = mine === BLACK ? '흑 ●' : mine === WHITE ? '백 ○' : ''
      const turnName = esc(ctx.names.get(s.order[playerOf(s, s.toMove)]) ?? '')
      info.innerHTML = mine
        ? `나는 <b>${colorName}</b> · ${over(s) ? '대국 종료' : myTurn() ? '내 차례' : `${turnName} 차례`}`
        : over(s)
          ? '대국 종료'
          : `${turnName} 차례`
      hint.textContent = myTurn()
        ? ghost === null
          ? mine === BLACK
            ? '둘 곳을 누르세요. X는 3-3 금수예요.'
            : '둘 곳을 누르세요.'
          : '한 번 더 누르거나 버튼으로 확정해요.'
        : ''
      placeBtn.disabled = !myTurn() || ghost === null
    }

    function pointAt(e: PointerEvent): number | null {
      const rect = canvas.getBoundingClientRect()
      const x = Math.round((e.clientX - rect.left) / cell()) - 1
      const y = Math.round((e.clientY - rect.top) / cell()) - 1
      return x >= 0 && x < N && y >= 0 && y < N ? idx(x, y) : null
    }

    function canPlace(p: number) {
      const s = latest!
      return s.stones[p] === EMPTY && !(s.toMove === BLACK && forbidden.includes(p))
    }

    function place() {
      if (ghost === null || !myTurn()) return
      const p = ghost
      ghost = null
      ctx.play({ x: p % N, y: Math.floor(p / N) })
      updateControls()
      draw()
    }

    const onPointer = (e: PointerEvent) => {
      if (!myTurn()) return
      const p = pointAt(e)
      if (p === null || !canPlace(p)) return
      if (ghost === p) return place()
      ghost = p
      updateControls()
      draw()
    }
    canvas.addEventListener('pointerdown', onPointer)
    placeBtn.addEventListener('click', place)
    const ro = new ResizeObserver(layout)
    ro.observe(el)
    window.addEventListener('resize', layout)

    return {
      render(s) {
        latest = s
        if (forbiddenFor !== s) {
          forbiddenFor = s
          forbidden = s.toMove === BLACK && !over(s) ? forbiddenPoints(s.stones) : []
          if (ghost !== null && !canPlace(ghost)) ghost = null
        }
        if (!myTurn()) ghost = null
        layout()
        updateControls()
        draw()
      },
      destroy() {
        ro.disconnect()
        window.removeEventListener('resize', layout)
        canvas.removeEventListener('pointerdown', onPointer)
        placeBtn.removeEventListener('click', place)
        el.innerHTML = ''
      },
    }
  },
}
