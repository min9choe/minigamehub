// 벽 쌓기(2명): 9×9 판의 양쪽 끝줄 가운데에서 출발해 상대 쪽 끝줄에 먼저 닿으면 이긴다.
// 내 차례에는 말을 한 칸 옮기거나, 벽(두 칸 길이)을 하나 놓는다. 벽은 넘어갈 수 없고, 길을 완전히 막는 벽은 놓을 수 없다.
// 각자 벽 10개. 판정은 rules.ts에 있다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'
import { N, canPlace, cellOf, fits, pawnMoves, xy, type Wall } from './rules'

export const WALLS_EACH = 10
/** 0번은 아래쪽 끝줄에서 출발해 위쪽 끝줄(0)로, 1번은 그 반대 */
export const GOALS = [0, N - 1]
const STARTS = [cellOf(4, N - 1), cellOf(4, 0)]

export type State = {
  order: string[]
  pawns: number[]
  walls: (Wall & { by: number })[]
  left: number[]
  turn: number
  last: { kind: 'move'; from: number; to: number } | { kind: 'wall'; wall: Wall } | null
  winner: number | null
}
export type Move = { kind: 'move'; to: number } | { kind: 'wall'; x: number; y: number; o: 'h' | 'v' }

const over = (s: State) => s.winner !== null

export const legalPawnMoves = (s: State, p: number) => pawnMoves(s.walls, s.pawns[p], s.pawns[1 - p])
export const legalWall = (s: State, w: Wall) => s.left[s.turn] > 0 && canPlace(s.walls, w, s.pawns, GOALS)

export const walls: GameDef<State, Move> = {
  turnSeconds: 30,

  init: (order, seed) => ({
    order,
    pawns: [...STARTS],
    walls: [],
    left: [WALLS_EACH, WALLS_EACH],
    turn: seed % 2,
    last: null,
    winner: null,
  }),

  turnOf: (s) => (over(s) ? null : s.order[s.turn]),

  apply(s, by, move) {
    const me = s.order.indexOf(by)
    if (over(s) || me !== s.turn || typeof move !== 'object' || move === null) return null
    if (move.kind === 'move') {
      if (!legalPawnMoves(s, me).includes(move.to)) return null
      const pawns = [...s.pawns]
      pawns[me] = move.to
      const won = xy(move.to)[1] === GOALS[me]
      return { ...s, pawns, turn: 1 - me, last: { kind: 'move', from: s.pawns[me], to: move.to }, winner: won ? me : null }
    }
    if (move.kind === 'wall') {
      const w: Wall = { x: move.x, y: move.y, o: move.o }
      if (!legalWall(s, w)) return null
      const left = [...s.left]
      left[me] -= 1
      return { ...s, walls: [...s.walls, { ...w, by: me }], left, turn: 1 - me, last: { kind: 'wall', wall: w } }
    }
    return null
  },

  skip: (s) => (over(s) ? s : { ...s, turn: 1 - s.turn }),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (over(s) || out < 0) return s
    return { ...s, winner: 1 - out }
  },

  result: (s) => (over(s) ? { winners: [s.order[s.winner!]] } : null),

  mount(el, ctx) {
    const COLORS = ['#2f5fe0', '#e0483e']
    el.innerHTML = `
      <div class="wl">
        <div class="wl-score"></div>
        <div class="wl-wrap"><canvas class="wl-board" aria-label="벽 쌓기 판"></canvas></div>
        <div class="wl-controls">
          <div class="wl-mode" role="group" aria-label="할 일">
            <button class="btn" type="button" data-mode="move">말 옮기기</button>
            <button class="btn" type="button" data-mode="wall">벽 놓기</button>
          </div>
          <button class="btn" type="button" data-action="turn">가로로 놓기</button>
          <button class="btn primary" type="button" data-action="place" disabled>여기에 놓기</button>
        </div>
        <p class="wl-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.wl-score')!
    const hint = el.querySelector<HTMLElement>('.wl-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const turnBtn = el.querySelector<HTMLButtonElement>('[data-action=turn]')!
    const placeBtn = el.querySelector<HTMLButtonElement>('[data-action=place]')!
    const modeBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-mode]')]
    const g = canvas.getContext('2d')!

    let latest: State | null = null
    let size = 0
    let mode: 'move' | 'wall' = 'move'
    let orient: 'h' | 'v' = 'h'
    // 벽은 손가락으로 정확히 놓기 어려우므로 미리보기를 두고, 같은 자리를 한 번 더 누르거나 버튼으로 확정한다
    let ghost: Wall | null = null

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && !over(latest) && latest.turn === me()
    // 1번 자리 사람은 판을 뒤집어 보여 준다. 누구든 내 말이 아래쪽에서 출발하는 것으로 보인다
    const flipped = () => me() === 1
    const name = (p: number) => esc(ctx.names.get(latest!.order[p]) ?? '')

    function layout() {
      const w = Math.floor(Math.min(el.clientWidth, 560, Math.max(260, window.innerHeight - 290)))
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
      const p = size / N // 칸 간격
      const gap = p * 0.2 // 칸 사이 홈(벽이 들어가는 자리)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.fillStyle = '#5b4632'
      g.fillRect(0, 0, size, size)
      if (flipped()) {
        g.translate(size, size)
        g.rotate(Math.PI)
      }

      const moves = myTurn() && mode === 'move' ? legalPawnMoves(s, me()) : []
      for (let c = 0; c < N * N; c++) {
        const [x, y] = xy(c)
        const goalOf = y === GOALS[0] ? 0 : y === GOALS[1] ? 1 : -1
        g.fillStyle = moves.includes(c) ? '#ffd23f' : goalOf >= 0 ? (goalOf === 0 ? '#dfe7fb' : '#fbe2df') : '#efe3cc'
        g.beginPath()
        g.roundRect(x * p + gap / 2, y * p + gap / 2, p - gap, p - gap, 3)
        g.fill()
      }

      // 방금 움직인 말이 있던 자리
      if (s.last?.kind === 'move') {
        const [x, y] = xy(s.last.from)
        g.strokeStyle = 'rgba(0,0,0,0.25)'
        g.lineWidth = 2
        g.setLineDash([3, 3])
        g.strokeRect(x * p + gap, y * p + gap, p - gap * 2, p - gap * 2)
        g.setLineDash([])
      }

      const wallRect = (w: Wall) =>
        w.o === 'h'
          ? [w.x * p + gap * 0.25, (w.y + 1) * p - gap / 2, p * 2 - gap * 0.5, gap]
          : [(w.x + 1) * p - gap / 2, w.y * p + gap * 0.25, gap, p * 2 - gap * 0.5]
      for (const w of s.walls) {
        const [x, y, ww, hh] = wallRect(w)
        g.fillStyle = '#2b2118'
        g.fillRect(x, y, ww, hh)
        g.fillStyle = COLORS[w.by]
        g.fillRect(x + 1, y + 1, ww - 2, hh - 2)
        const lw = s.last?.kind === 'wall' && s.last.wall.x === w.x && s.last.wall.y === w.y && s.last.wall.o === w.o
        if (lw) {
          g.strokeStyle = '#ffd23f'
          g.lineWidth = 2
          g.strokeRect(x - 1, y - 1, ww + 2, hh + 2)
        }
      }
      if (ghost && myTurn() && mode === 'wall') {
        const [x, y, ww, hh] = wallRect(ghost)
        g.globalAlpha = 0.7
        g.fillStyle = legalWall(s, ghost) ? COLORS[me()] : '#9aa0a6'
        g.fillRect(x, y, ww, hh)
        g.globalAlpha = 1
      }

      s.pawns.forEach((c, i) => {
        const [x, y] = xy(c)
        const cx = x * p + p / 2
        const cy = y * p + p / 2
        const r = p * 0.3
        g.fillStyle = 'rgba(0,0,0,0.25)'
        g.beginPath()
        g.arc(cx + 1.5, cy + 2, r, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = COLORS[i]
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.fill()
        g.strokeStyle = '#fff'
        g.lineWidth = i === me() ? 3 : 2
        g.stroke()
      })
    }

    function updateUI() {
      const s = latest!
      const mine = me() >= 0 ? me() : 0
      const theirs = 1 - mine
      const dot = (i: number) => `<i style="background:${COLORS[i]}"></i>`
      score.innerHTML = `
        <span class="${s.turn === mine && !over(s) ? 'is-turn' : ''}">${dot(mine)}${name(mine)} <small>벽 ${s.left[mine]}개</small></span>
        <span class="${s.turn === theirs && !over(s) ? 'is-turn' : ''}">${dot(theirs)}${name(theirs)} <small>벽 ${s.left[theirs]}개</small></span>`
      const can = myTurn()
      if (can && mode === 'wall' && s.left[me()] === 0) mode = 'move'
      for (const b of modeBtns) {
        b.classList.toggle('primary', b.dataset.mode === mode)
        b.disabled = !can || (b.dataset.mode === 'wall' && s.left[me()] === 0)
      }
      turnBtn.hidden = placeBtn.hidden = !can || mode !== 'wall'
      turnBtn.textContent = orient === 'h' ? '세로로 바꾸기' : '가로로 바꾸기'
      placeBtn.disabled = !ghost || !legalWall(s, ghost)
      hint.textContent = over(s)
        ? ''
        : !can
          ? `${ctx.names.get(s.order[s.turn]) ?? ''} 차례`
          : mode === 'move'
            ? '노란 칸으로 말을 옮겨요. 맨 위 줄에 먼저 닿으면 이겨요.'
            : ghost && !legalWall(s, ghost)
              ? fits(s.walls, ghost)
                ? '그 벽은 길을 완전히 막아서 놓을 수 없어요.'
                : '다른 벽과 겹쳐서 놓을 수 없어요.'
              : ghost
                ? '같은 자리를 한 번 더 누르거나 버튼으로 놓아요.'
                : '칸 사이 홈을 눌러 벽 자리를 골라요.'
    }

    const refresh = () => {
      updateUI()
      draw()
    }

    function placeGhost() {
      if (!ghost || !latest || !myTurn() || !legalWall(latest, ghost)) return
      const w = ghost
      ghost = null
      ctx.play({ kind: 'wall', x: w.x, y: w.y, o: w.o })
      refresh()
    }

    const onDown = (e: PointerEvent) => {
      const s = latest
      if (!s || !myTurn()) return
      const rect = canvas.getBoundingClientRect()
      let px = ((e.clientX - rect.left) / rect.width) * N
      let py = ((e.clientY - rect.top) / rect.height) * N
      if (flipped()) {
        px = N - px
        py = N - py
      }
      if (mode === 'move') {
        const x = Math.floor(px)
        const y = Math.floor(py)
        if (x < 0 || x >= N || y < 0 || y >= N) return
        const to = cellOf(x, y)
        if (legalPawnMoves(s, me()).includes(to)) ctx.play({ kind: 'move', to })
        return
      }
      // 누른 자리에서 가장 가까운 홈 교차점
      const x = Math.min(N - 2, Math.max(0, Math.round(px) - 1))
      const y = Math.min(N - 2, Math.max(0, Math.round(py) - 1))
      const w: Wall = { x, y, o: orient }
      if (ghost && ghost.x === w.x && ghost.y === w.y && ghost.o === w.o) return placeGhost()
      ghost = w
      refresh()
    }

    const onClick = (e: Event) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
      if (!b || b.disabled || !myTurn()) return
      if (b.dataset.mode) {
        mode = b.dataset.mode as 'move' | 'wall'
        ghost = null
      } else if (b.dataset.action === 'turn') {
        orient = orient === 'h' ? 'v' : 'h'
        if (ghost) ghost = { ...ghost, o: orient }
      } else if (b.dataset.action === 'place') return placeGhost()
      refresh()
    }

    canvas.addEventListener('pointerdown', onDown)
    el.addEventListener('click', onClick)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        if (latest && s.last && s.last !== latest.last) sfx.place()
        if (latest && latest.turn !== s.turn) ghost = null
        latest = s
        layout()
        refresh()
      },
      destroy() {
        ro.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        el.removeEventListener('click', onClick)
        el.innerHTML = ''
      },
    }
  },
}
