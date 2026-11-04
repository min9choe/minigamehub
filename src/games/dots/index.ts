// 점 잇기(상자 만들기): 이웃한 두 점 사이에 선을 하나씩 긋는다. 네 변을 모두 채운 사람이 그 상자를 갖고 한 번 더 긋는다.
// 선을 다 그으면 끝나고, 상자가 가장 많은 사람이 이긴다. 2명은 4×4칸, 3~4명은 5×5칸.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'

export type State = {
  order: string[]
  rows: number
  cols: number
  /** 선마다 그은 사람(-1은 아직). 가로선 (rows+1)×cols개 뒤에 세로선 rows×(cols+1)개 */
  lines: number[]
  /** 칸마다 가진 사람(-1은 아직) */
  boxes: number[]
  turn: number
  out: number[]
  last: number | null
  winners: number[] | null
}
export type Move = { line: number }

const COLORS = ['#2f6fde', '#d64545', '#1f9d55', '#d97a00']

const hCount = (s: Pick<State, 'rows' | 'cols'>) => (s.rows + 1) * s.cols
export const hLine = (s: Pick<State, 'cols'>, r: number, c: number) => r * s.cols + c
export const vLine = (s: Pick<State, 'rows' | 'cols'>, r: number, c: number) => hCount(s) + r * (s.cols + 1) + c

/** 칸의 네 변 */
export function sides(s: Pick<State, 'rows' | 'cols'>, box: number): number[] {
  const r = Math.floor(box / s.cols)
  const c = box % s.cols
  return [hLine(s, r, c), hLine(s, r + 1, c), vLine(s, r, c), vLine(s, r, c + 1)]
}

/** 이 선을 변으로 갖는 칸들(1~2개) */
export function boxesOf(s: Pick<State, 'rows' | 'cols'>, line: number): number[] {
  const out: number[] = []
  if (line < hCount(s)) {
    const r = Math.floor(line / s.cols)
    const c = line % s.cols
    if (r > 0) out.push((r - 1) * s.cols + c)
    if (r < s.rows) out.push(r * s.cols + c)
  } else {
    const k = line - hCount(s)
    const r = Math.floor(k / (s.cols + 1))
    const c = k % (s.cols + 1)
    if (c > 0) out.push(r * s.cols + c - 1)
    if (c < s.cols) out.push(r * s.cols + c)
  }
  return out
}

const nextAlive = (s: State, from: number) => {
  for (let i = 1; i <= s.order.length; i++) {
    const p = (from + i) % s.order.length
    if (!s.out.includes(p)) return p
  }
  return from
}

function finish(s: State): State {
  const alive = s.order.map((_, i) => i).filter((i) => !s.out.includes(i))
  const score = (p: number) => s.boxes.filter((b) => b === p).length
  const best = Math.max(...alive.map(score))
  return { ...s, winners: alive.filter((p) => score(p) === best) }
}

export const dots: GameDef<State, Move> = {
  turnSeconds: 20,

  init(order, seed) {
    const n = order.length === 2 ? 4 : 5
    const shape = { rows: n, cols: n }
    return {
      order,
      ...shape,
      lines: Array((n + 1) * n * 2).fill(-1),
      boxes: Array(n * n).fill(-1),
      turn: seed % order.length,
      out: [],
      last: null,
      winners: null,
    }
  },

  turnOf: (s) => (s.winners ? null : s.order[s.turn]),

  apply(s, by, { line }) {
    const me = s.order.indexOf(by)
    if (s.winners || me !== s.turn || !Number.isInteger(line) || line < 0 || line >= s.lines.length || s.lines[line] !== -1) return null
    const lines = [...s.lines]
    lines[line] = me
    const boxes = [...s.boxes]
    let closed = 0
    for (const b of boxesOf(s, line)) {
      if (boxes[b] === -1 && sides(s, b).every((l) => lines[l] !== -1)) {
        boxes[b] = me
        closed++
      }
    }
    const next = { ...s, lines, boxes, last: line }
    if (!lines.includes(-1)) return finish(next)
    // 상자를 닫았으면 한 번 더
    return closed ? next : { ...next, turn: nextAlive(s, me) }
  },

  skip: (s) => (s.winners ? s : { ...s, turn: nextAlive(s, s.turn) }),

  eliminate(s, id) {
    const p = s.order.indexOf(id)
    if (s.winners || p < 0 || s.out.includes(p)) return s
    const next = { ...s, out: [...s.out, p] }
    const alive = s.order.map((_, i) => i).filter((i) => !next.out.includes(i))
    if (alive.length === 1) return { ...next, winners: alive }
    return s.turn === p ? { ...next, turn: nextAlive(next, p) } : next
  },

  result: (s) => (s.winners ? { winners: s.winners.map((i) => s.order[i]) } : null),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="dt">
        <ul class="dt-scores"></ul>
        <div class="dt-wrap"><canvas class="dt-board" aria-label="점 잇기 판"></canvas></div>
        <p class="dt-hint"></p>
      </div>`
    const scores = el.querySelector<HTMLElement>('.dt-scores')!
    const hint = el.querySelector<HTMLElement>('.dt-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!
    let latest: State | null = null
    let size = 0
    let hover: number | null = null

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !latest.winners && latest.turn === me()
    // 점은 cols+1개이고 양쪽에 한 칸씩 여백을 두므로 판을 cols+2칸으로 나눈다(가장자리 점이 잘리지 않게)
    const gap = () => size / (latest!.cols + 2)
    const pt = (r: number, c: number): [number, number] => [gap() * (c + 1), gap() * (r + 1)]

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

    /** 선의 두 끝점 */
    function ends(line: number): [[number, number], [number, number]] {
      const s = latest!
      if (line < hCount(s)) {
        const r = Math.floor(line / s.cols)
        const c = line % s.cols
        return [pt(r, c), pt(r, c + 1)]
      }
      const k = line - hCount(s)
      const r = Math.floor(k / (s.cols + 1))
      const c = k % (s.cols + 1)
      return [pt(r, c), pt(r + 1, c)]
    }

    function draw() {
      if (!size || !latest) return
      const s = latest
      const gp = gap()
      g.fillStyle = '#fbf8f1'
      g.fillRect(0, 0, size, size)
      // 가진 칸
      s.boxes.forEach((owner, b) => {
        if (owner < 0) return
        const [x, y] = pt(Math.floor(b / s.cols), b % s.cols)
        g.fillStyle = COLORS[owner] + '40'
        g.fillRect(x, y, gp, gp)
        g.fillStyle = COLORS[owner]
        g.font = `600 ${Math.round(gp * 0.32)}px system-ui, sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText((ctx.names.get(s.order[owner]) ?? '?').slice(0, 2), x + gp / 2, y + gp / 2)
      })
      // 선
      g.lineCap = 'round'
      s.lines.forEach((owner, l) => {
        const [[x1, y1], [x2, y2]] = ends(l)
        if (owner < 0) {
          if (l !== hover) return
          g.strokeStyle = 'rgba(47, 111, 222, 0.35)'
        } else g.strokeStyle = l === s.last ? '#1d1c1a' : COLORS[owner]
        g.lineWidth = Math.max(4, gp * 0.09)
        g.beginPath()
        g.moveTo(x1, y1)
        g.lineTo(x2, y2)
        g.stroke()
      })
      g.lineCap = 'butt'
      // 점
      g.fillStyle = '#3a3833'
      for (let r = 0; r <= s.rows; r++)
        for (let c = 0; c <= s.cols; c++) {
          const [x, y] = pt(r, c)
          g.beginPath()
          g.arc(x, y, Math.max(3.5, gp * 0.07), 0, Math.PI * 2)
          g.fill()
        }
    }

    function updateText() {
      const s = latest!
      scores.innerHTML = s.order
        .map((id, i) => {
          const n = s.boxes.filter((b) => b === i).length
          const cls = [i === s.turn && !s.winners && 'is-turn', i === me() && 'is-me', s.out.includes(i) && 'is-out'].filter(Boolean).join(' ')
          return `<li class="${cls}"><i style="background:${COLORS[i]}"></i><span>${esc(ctx.names.get(id) ?? '')}</span><b>${n}</b></li>`
        })
        .join('')
      hint.textContent = s.winners
        ? ''
        : myTurn()
          ? '두 점 사이를 눌러 선을 그어요. 상자를 닫으면 한 번 더!'
          : `${ctx.names.get(s.order[s.turn])} 차례`
    }

    /** 누른 자리에서 가장 가까운 빈 선(선 길이의 절반 안쪽) */
    function lineAt(e: PointerEvent): number | null {
      const s = latest!
      const rect = canvas.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / rect.width) * size
      const py = ((e.clientY - rect.top) / rect.height) * size
      let best: number | null = null
      let bestD = gap() * 0.45
      s.lines.forEach((owner, l) => {
        if (owner >= 0) return
        const [[x1, y1], [x2, y2]] = ends(l)
        const d = Math.hypot(px - (x1 + x2) / 2, py - (y1 + y2) / 2)
        if (d < bestD) {
          best = l
          bestD = d
        }
      })
      return best
    }

    const onDown = (e: PointerEvent) => {
      if (!myTurn()) return
      const l = lineAt(e)
      if (l !== null) ctx.play({ line: l })
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const l = myTurn() ? lineAt(e) : null
      if (l !== hover) {
        hover = l
        draw()
      }
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        if (latest && s.last !== latest.last && s.last !== null) {
          const gained = s.boxes.filter((b) => b >= 0).length > latest.boxes.filter((b) => b >= 0).length
          ;(gained ? sfx.gain : sfx.place)()
        }
        latest = s
        layout()
        updateText()
        draw()
      },
      destroy() {
        ro.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        el.innerHTML = ''
      },
    }
  },
}
