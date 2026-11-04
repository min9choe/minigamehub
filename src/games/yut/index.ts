// 윷놀이(2~4명): 윷을 던져 나온 만큼 말을 옮겨, 내 말을 모두 먼저 완주시키면 이긴다. 판정은 rules.ts에 있다.
// 윷 결과는 시드와 던진 횟수로 정해지므로 모든 화면에서 같다(던지는 사람이 결과를 고를 수 없다).
import { art, image } from '../../assets/art'
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'
import { ALL_NODES, CENTER, VALUE_NAMES, moved, newPiece, nodeOf, nodePos, sticksFor, throwValue, type Piece } from './rules'

export type State = {
  order: string[]
  seed: number
  pieces: Piece[][]
  turn: number
  phase: 'throw' | 'move'
  /** 던져서 모은, 아직 안 쓴 결과 */
  pending: number[]
  throwNo: number
  lastThrow: { by: number; sticks: boolean[]; value: number } | null
  /** 방금 잡힌 말이 있으면 잡은 사람 */
  lastCapture: { by: number; victims: number[] } | null
  out: number[]
  winner: number | null
}
export type Move = { kind: 'throw' } | { kind: 'move'; piece: number; use: number }

/** 같은 자리에 있는 내 말(업힌 말)들 */
export function stackOf(pieces: Piece[], i: number): number[] {
  const node = nodeOf(pieces[i])
  if (node === null) return [i]
  return pieces.map((p, k) => (nodeOf(p) === node ? k : -1)).filter((k) => k >= 0)
}

/** value를 쓸 수 있는 말이 하나라도 있나 */
export function canUse(pieces: Piece[], value: number) {
  return pieces.some((p) => moved(p, value) !== null && !(value < 0 && nodeOf(p) === 0 && p.route === 'O'))
}

const nextAlive = (s: State, from: number) => {
  for (let i = 1; i <= s.order.length; i++) {
    const p = (from + i) % s.order.length
    if (!s.out.includes(p)) return p
  }
  return from
}
const nextTurn = (s: State): State => ({ ...s, turn: nextAlive(s, s.turn), phase: 'throw', pending: [] })

/** 남은 결과를 하나도 쓸 수 없으면 차례를 넘긴다 */
function settle(s: State): State {
  if (s.phase === 'move' && !s.pending.some((v) => canUse(s.pieces[s.turn], v))) return nextTurn(s)
  return s
}

export const yut: GameDef<State, Move> = {
  turnSeconds: 30,

  init(order, seed) {
    const count = order.length === 2 ? 4 : 3
    return {
      order,
      seed,
      pieces: order.map(() => Array.from({ length: count }, newPiece)),
      turn: seed % order.length,
      phase: 'throw',
      pending: [],
      throwNo: 0,
      lastThrow: null,
      lastCapture: null,
      out: [],
      winner: null,
    }
  },

  turnOf: (s) => (s.winner === null ? s.order[s.turn] : null),

  apply(s, by, move) {
    const me = s.order.indexOf(by)
    if (s.winner !== null || me !== s.turn) return null
    if (move.kind === 'throw') {
      if (s.phase !== 'throw') return null
      const sticks = sticksFor(s.seed, s.throwNo)
      const value = throwValue(sticks)
      const pending = [...s.pending, value]
      // 윷이나 모면 한 번 더 던진다
      const phase = value === 4 || value === 5 ? 'throw' : 'move'
      return settle({ ...s, pending, phase, throwNo: s.throwNo + 1, lastThrow: { by: me, sticks, value }, lastCapture: null })
    }
    if (s.phase !== 'move' || !Number.isInteger(move.use) || move.use < 0 || move.use >= s.pending.length) return null
    const mine = s.pieces[me]
    if (!Number.isInteger(move.piece) || !mine[move.piece]) return null
    const value = s.pending[move.use]
    const dest = moved(mine[move.piece], value)
    if (!dest || (dest === mine[move.piece])) return null

    // 업힌 말은 함께 움직인다
    const group = stackOf(mine, move.piece)
    const pieces = s.pieces.map((ps, p) => (p === me ? ps.map((pc, k) => (group.includes(k) ? { ...dest } : pc)) : [...ps]))
    // 도착한 자리에 상대 말이 있으면 잡는다
    const node = nodeOf(dest)
    const victims: number[] = []
    if (node !== null) {
      pieces.forEach((ps, p) => {
        if (p === me) return
        ps.forEach((pc, k) => {
          if (nodeOf(pc) === node) {
            ps[k] = newPiece()
            if (!victims.includes(p)) victims.push(p)
          }
        })
      })
    }
    const pending = s.pending.filter((_, i) => i !== move.use)
    const next: State = { ...s, pieces, pending, lastCapture: victims.length ? { by: me, victims } : null }
    if (pieces[me].every((p) => p.done)) return { ...next, winner: me }
    // 잡으면 한 번 더 던진다
    if (victims.length) return { ...next, phase: 'throw' }
    if (!pending.length) return nextTurn(next)
    return settle(next)
  },

  /** 시간 안에 못 하면 남은 결과는 버리고 차례가 넘어간다 */
  skip: (s) => (s.winner !== null ? s : nextTurn(s)),

  eliminate(s, id) {
    const p = s.order.indexOf(id)
    if (s.winner !== null || p < 0 || s.out.includes(p)) return s
    const next = { ...s, out: [...s.out, p] }
    const alive = s.order.map((_, i) => i).filter((i) => !next.out.includes(i))
    if (alive.length === 1) return { ...next, winner: alive[0] }
    return s.turn === p ? nextTurn(next) : next
  },

  result: (s) => (s.winner === null ? null : { winners: [s.order[s.winner]] }),

  mount(el, ctx) {
    const COLORS = ['#2f6fde', '#d64545', '#1f9d55', '#d97a00']
    el.innerHTML = `
      <div class="yt">
        <ul class="yt-players"></ul>
        <div class="yt-wrap"><canvas class="yt-board" aria-label="윷판"></canvas></div>
        <div class="yt-throw">
          <div class="yt-sticks" aria-hidden="true"></div>
          <b class="yt-result"></b>
        </div>
        <div class="yt-controls">
          <button class="btn primary" type="button" data-action="throw">윷 던지기</button>
          <div class="yt-pending"></div>
          <button class="btn" type="button" data-action="new">새 말 내보내기</button>
        </div>
        <p class="yt-hint"></p>
      </div>`
    const players = el.querySelector<HTMLElement>('.yt-players')!
    const sticksEl = el.querySelector<HTMLElement>('.yt-sticks')!
    const resultEl = el.querySelector<HTMLElement>('.yt-result')!
    const pendingEl = el.querySelector<HTMLElement>('.yt-pending')!
    const hint = el.querySelector<HTMLElement>('.yt-hint')!
    const throwBtn = el.querySelector<HTMLButtonElement>('[data-action=throw]')!
    const newBtn = el.querySelector<HTMLButtonElement>('[data-action=new]')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!

    let latest: State | null = null
    let size = 0
    let selected = 0 // 고른 결과(pending 번호)
    let shownThrow = -1

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && latest.winner === null && latest.turn === me()
    const name = (i: number) => ctx.names.get(latest!.order[i]) ?? ''

    function layout() {
      const w = Math.floor(Math.min(el.clientWidth, 480, Math.max(240, window.innerHeight - 330)))
      if (w <= 0 || w === size) return
      size = w
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = canvas.style.height = `${w}px`
      canvas.width = canvas.height = Math.round(w * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    /** 고른 결과로 이 말을 옮기면 갈 자리(미리보기) */
    function previewTargets(): Set<number> {
      const s = latest!
      const out = new Set<number>()
      if (!myTurn() || s.phase !== 'move') return out
      const v = s.pending[selected]
      if (v === undefined) return out
      for (const p of s.pieces[me()]) {
        const d = moved(p, v)
        if (d && d !== p) {
          const n = nodeOf(d)
          if (n !== null) out.add(n)
        }
      }
      return out
    }

    function draw() {
      if (!size || !latest) return
      const s = latest
      const cloth = image(art.yutBoard, draw)
      if (cloth) g.drawImage(cloth, 0, 0, size, size)
      else {
        g.fillStyle = '#efe1c2'
        g.fillRect(0, 0, size, size)
      }
      const P = (n: number) => {
        const p = nodePos(n)
        return [p.x * size, p.y * size] as const
      }
      // 길
      g.strokeStyle = 'rgba(80, 50, 20, 0.55)'
      g.lineWidth = 2
      g.beginPath()
      const corners = [0, 5, 10, 15]
      corners.forEach((n, i) => {
        const [x, y] = P(n)
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      })
      g.closePath()
      g.moveTo(...P(5))
      g.lineTo(...P(15))
      g.moveTo(...P(10))
      g.lineTo(...P(0))
      g.stroke()
      // 칸
      const targets = previewTargets()
      for (const n of ALL_NODES) {
        const [x, y] = P(n)
        const big = n % 5 === 0 && n < 20 ? true : n === CENTER
        const r = size * (big ? 0.045 : 0.03)
        g.fillStyle = targets.has(n) ? '#ffe27a' : big ? '#f6ecd6' : '#fbf5e6'
        g.strokeStyle = 'rgba(80, 50, 20, 0.7)'
        g.lineWidth = big ? 2.5 : 1.5
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      // 출발 표시
      const [sx, sy] = P(0)
      g.fillStyle = 'rgba(80, 50, 20, 0.8)'
      g.font = `${Math.round(size * 0.032)}px 'Black Han Sans', system-ui, sans-serif`
      g.textAlign = 'center'
      g.fillText('출발', sx - size * 0.02, sy + size * 0.065)
      // 말: 같은 자리의 말은 하나로 그리고 개수를 적는다
      s.pieces.forEach((ps, p) => {
        const seen = new Set<number>()
        ps.forEach((pc) => {
          const n = nodeOf(pc)
          if (n === null || seen.has(n)) return
          seen.add(n)
          const k = ps.filter((q) => nodeOf(q) === n).length
          const [x, y] = P(n)
          const r = size * 0.036
          g.fillStyle = 'rgba(0,0,0,0.25)'
          g.beginPath()
          g.arc(x + 1.5, y + 2, r, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = COLORS[p]
          g.beginPath()
          g.arc(x, y, r, 0, Math.PI * 2)
          g.fill()
          g.strokeStyle = '#fff'
          g.lineWidth = 2
          g.stroke()
          if (k > 1) {
            g.fillStyle = '#fff'
            g.font = `${Math.round(r * 1.1)}px 'Black Han Sans', system-ui, sans-serif`
            g.textBaseline = 'middle'
            g.fillText(String(k), x, y + 1)
            g.textBaseline = 'alphabetic'
          }
        })
      })
    }

    function updateUI() {
      const s = latest!
      players.innerHTML = s.order
        .map((id, p) => {
          const home = s.pieces[p].filter((pc) => !pc.started && !pc.done).length
          const done = s.pieces[p].filter((pc) => pc.done).length
          const cls = [p === s.turn && s.winner === null && 'is-turn', p === me() && 'is-me', s.out.includes(p) && 'is-out'].filter(Boolean).join(' ')
          return `<li class="${cls}"><i style="background:${COLORS[p]}"></i><span>${esc(ctx.names.get(id) ?? '')}</span><small>대기 ${home}, 완주 ${done}/${s.pieces[p].length}</small></li>`
        })
        .join('')

      const t = s.lastThrow
      sticksEl.innerHTML = t
        ? t.sticks.map((flat, i) => `<i class="${flat ? 'is-flat' : ''}${i === 0 ? ' is-marked' : ''}"></i>`).join('')
        : '<i></i><i></i><i></i><i></i>'
      resultEl.textContent = t ? `${name(t.by)} ${VALUE_NAMES[t.value]}!` : ''

      if (selected >= s.pending.length) selected = 0
      pendingEl.innerHTML = s.pending
        .map((v, i) => `<button class="btn${i === selected ? ' primary' : ''}" type="button" data-use="${i}" ${myTurn() && s.phase === 'move' ? '' : 'disabled'}>${VALUE_NAMES[v]}</button>`)
        .join('')

      const v = s.pending[selected]
      throwBtn.disabled = !(myTurn() && s.phase === 'throw')
      const home = s.pieces[me()]?.findIndex((pc) => !pc.started && !pc.done) ?? -1
      newBtn.disabled = !(myTurn() && s.phase === 'move' && home >= 0 && v !== undefined && v > 0)

      hint.textContent =
        s.winner !== null
          ? ''
          : !myTurn()
            ? `${name(s.turn)} 차례${s.lastCapture?.by === s.turn ? '. 잡아서 한 번 더!' : ''}`
            : s.phase === 'throw'
              ? s.pending.length
                ? '한 번 더 던져요!'
                : '윷을 던져요.'
              : '쓸 결과를 고르고, 판의 내 말을 누르거나 새 말을 내보내요. 노란 칸이 갈 자리예요.'
    }

    const onClick = (e: Event) => {
      const t = e.target as HTMLElement
      const s = latest
      if (!s || !myTurn()) return
      if (t.closest('[data-action=throw]')) ctx.play({ kind: 'throw' })
      const use = t.closest<HTMLElement>('[data-use]')
      if (use) {
        selected = Number(use.dataset.use)
        updateUI()
        draw()
      }
      if (t.closest('[data-action=new]')) {
        const home = s.pieces[me()].findIndex((pc) => !pc.started && !pc.done)
        if (home >= 0) ctx.play({ kind: 'move', piece: home, use: selected })
      }
    }

    const onBoard = (e: PointerEvent) => {
      const s = latest
      if (!s || !myTurn() || s.phase !== 'move') return
      const rect = canvas.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      // 누른 자리에서 가장 가까운 내 말
      let best = -1
      let bestD = 0.06
      s.pieces[me()].forEach((pc, k) => {
        const n = nodeOf(pc)
        if (n === null) return
        const p = nodePos(n)
        const d = Math.hypot(p.x - px, p.y - py)
        if (d < bestD) {
          best = k
          bestD = d
        }
      })
      if (best >= 0) ctx.play({ kind: 'move', piece: best, use: selected })
    }

    el.addEventListener('click', onClick)
    canvas.addEventListener('pointerdown', onBoard)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        if (latest) {
          if (s.throwNo !== shownThrow && s.lastThrow) sfx.flick()
          if (s.lastCapture && s.lastCapture !== latest.lastCapture) sfx.fall()
          const finished = (x: State) => x.pieces.flat().filter((p) => p.done).length
          if (finished(s) > finished(latest)) sfx.gain()
          else if (JSON.stringify(s.pieces) !== JSON.stringify(latest.pieces)) sfx.place()
        }
        shownThrow = s.throwNo
        latest = s
        layout()
        updateUI()
        draw()
      },
      destroy() {
        ro.disconnect()
        el.removeEventListener('click', onClick)
        canvas.removeEventListener('pointerdown', onBoard)
        el.innerHTML = ''
      },
    }
  },
}
