// 컬링(2명): 얼음판 아래쪽에서 돌을 밀어 위쪽 하우스(과녁) 가운데에 가깝게 세운다.
// 한 엔드에 각자 3개씩 번갈아 던지고, 엔드가 끝나면 가운데에 가장 가까운 돌의 주인만 점수를 얻는다
// (상대의 가장 가까운 돌보다 가까운 내 돌 수만큼). 3엔드 합계가 높은 사람이 이기고, 같으면 엔드를 더 한다.
// 물리는 알까기와 같은 shared/physics.ts를 얼음 마찰로 쓰고, 동기화도 알까기처럼 쏜 사람이 계산한 최종 배치로 맞춘다.
import { art, image } from '../../assets/art'
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import { DT, ICE, R, simulate, step, toBodies, type Body, type Disc } from '../shared/physics'
import type { GameDef } from '../types'

export const STONES_EACH = 3
export const ENDS = 3
export const CURL_MAX = 1.4 // 가장 세게 밀 때 속도
export const HOUSE = { x: 0.5, y: 0.22, r: 0.16 }
export const HACK = { x: 0.5, y: 0.92 } // 던지는 자리

export type State = {
  order: string[]
  end: number
  /** 이번 엔드에 먼저 던지는 사람 */
  first: number
  /** 이번 엔드에 던진 돌 수(빠뜨린 것 포함) */
  thrown: number
  discs: Disc[]
  scores: number[]
  /** 끝난 엔드마다 점수를 얻은 사람과 점수 */
  ends: { winner: number | null; points: number }[]
  shotNo: number
  lastShot: { from: Disc[]; id: number; vx: number; vy: number; final: Disc[] } | null
  winner: number | null
}
export type Move = { vx: number; vy: number; end: Disc[] }

export const thrower = (s: State) => (s.first + s.thrown) % 2
const dist = (d: Disc) => Math.hypot(d.x - HOUSE.x, d.y - HOUSE.y)

/** 엔드 점수: 하우스 안 돌 가운데 가장 가까운 돌의 주인이, 상대의 가장 가까운 돌보다 가까운 자기 돌 수만큼 얻는다 */
export function scoreEnd(discs: Disc[]): { winner: number | null; points: number } {
  const inHouse = discs.filter((d) => !d.out && dist(d) <= HOUSE.r + R).sort((a, b) => dist(a) - dist(b))
  if (!inHouse.length) return { winner: null, points: 0 }
  const winner = inHouse[0].owner
  const rival = inHouse.find((d) => d.owner !== winner)
  const points = inHouse.filter((d) => d.owner === winner && (!rival || dist(d) < dist(rival))).length
  return { winner, points }
}

/** 한 번 던진 뒤(또는 시간이 다 되어 못 던진 뒤): 엔드가 끝났으면 점수를 매기고 다음 엔드로 */
function afterThrow(s: State, discs: Disc[]): State {
  const thrown = s.thrown + 1
  if (thrown < STONES_EACH * 2) return { ...s, discs, thrown }
  const res = scoreEnd(discs)
  const scores = s.scores.map((v, i) => (i === res.winner ? v + res.points : v))
  const ends = [...s.ends, res]
  const done = s.end >= ENDS && scores[0] !== scores[1]
  if (done) return { ...s, discs, thrown, scores, ends, winner: scores[0] > scores[1] ? 0 : 1 }
  // 다음 엔드는 먼저 던지는 사람을 바꾼다
  return { ...s, discs: [], thrown: 0, scores, ends, end: s.end + 1, first: 1 - s.first }
}

function validEnd(before: Disc[], owner: number, end: unknown): end is Disc[] {
  if (!Array.isArray(end) || end.length !== before.length + 1) return false
  return end.every((d: Disc, i) => {
    const want = i < before.length ? before[i].owner : owner
    if (typeof d !== 'object' || d === null || d.owner !== want || typeof d.out !== 'boolean') return false
    if (i < before.length && before[i].out && !d.out) return false
    return d.out || (Number.isFinite(d.x) && Number.isFinite(d.y) && d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1)
  })
}

/** 던진 사람 화면에서 끝까지 계산한다 */
export function throwStone(s: State, vx: number, vy: number): Move {
  const from = [...s.discs, { ...HACK, owner: thrower(s), out: false }]
  return { vx, vy, end: simulate(from, { id: from.length - 1, vx, vy }, ICE) }
}

export const curling: GameDef<State, Move> = {
  turnSeconds: 25,

  init: (order, seed) => ({
    order,
    end: 1,
    first: seed % 2,
    thrown: 0,
    discs: [],
    scores: [0, 0],
    ends: [],
    shotNo: 0,
    lastShot: null,
    winner: null,
  }),

  turnOf: (s) => (s.winner === null ? s.order[thrower(s)] : null),

  apply(s, by, { vx, vy, end }) {
    const me = s.order.indexOf(by)
    if (s.winner !== null || me !== thrower(s)) return null
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || Math.hypot(vx, vy) > CURL_MAX * 1.001) return null
    if (!validEnd(s.discs, me, end)) return null
    const from = [...s.discs, { ...HACK, owner: me, out: false }]
    const lastShot = { from, id: from.length - 1, vx, vy, final: end }
    return afterThrow({ ...s, shotNo: s.shotNo + 1, lastShot }, end)
  },

  /** 시간 안에 던지지 않으면 그 돌은 빠진다 */
  skip: (s) => (s.winner !== null ? s : afterThrow(s, s.discs)),

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.winner !== null || out < 0) return s
    return { ...s, winner: 1 - out }
  },

  result: (s) => (s.winner === null ? null : { winners: [s.order[s.winner]] }),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="cl">
        <div class="cl-score"></div>
        <p class="cl-info"></p>
        <div class="cl-wrap"><canvas class="cl-board" aria-label="컬링 얼음판"></canvas></div>
        <p class="cl-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.cl-score')!
    const info = el.querySelector<HTMLElement>('.cl-info')!
    const hint = el.querySelector<HTMLElement>('.cl-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!
    const COLORS = ['#2f6fde', '#d64545']

    let latest: State | null = null
    let size = 0
    let shownShot = -1
    let anim: { bodies: Body[]; acc: number; last: number; steps: number } | null = null
    let raf = 0
    let animTimer = 0
    // 엔드가 막 끝났으면 마지막 배치와 점수를 잠깐 보여 준다
    let endView: { discs: Disc[]; until: number; text: string } | null = null
    let endTimer = 0
    let aim: { px: number; py: number } | null = null

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const myTurn = () => !!latest && latest.winner === null && thrower(latest) === me() && !anim && !endView
    const name = (i: number) => ctx.names.get(latest!.order[i]) ?? ''

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

    function drawSheet() {
      const ice = image(art.ice, draw)
      if (ice) g.drawImage(ice, 0, 0, size, size)
      else {
        const grad = g.createLinearGradient(0, 0, 0, size)
        grad.addColorStop(0, '#f4f9fd')
        grad.addColorStop(1, '#dbe9f4')
        g.fillStyle = grad
        g.fillRect(0, 0, size, size)
      }
      const cx = HOUSE.x * size
      const cy = HOUSE.y * size
      const rings: [number, string][] = [
        [1, '#2f6fde'],
        [0.75, '#f7fbff'],
        [0.5, '#d64545'],
        [0.22, '#f7fbff'],
      ]
      for (const [k, color] of rings) {
        g.fillStyle = color
        g.globalAlpha = color === '#f7fbff' ? 0.95 : 0.75
        g.beginPath()
        g.arc(cx, cy, HOUSE.r * size * k, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
      g.strokeStyle = 'rgba(30, 60, 90, 0.35)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(0, cy)
      g.lineTo(size, cy)
      g.moveTo(cx, 0)
      g.lineTo(cx, size)
      g.stroke()
      // 던지는 자리
      g.strokeStyle = 'rgba(30, 60, 90, 0.45)'
      g.beginPath()
      g.arc(HACK.x * size, HACK.y * size, R * size * 1.3, 0, Math.PI * 2)
      g.stroke()
    }

    function drawStoneAt(d: Disc, highlight = false) {
      const x = d.x * size
      const y = d.y * size
      const r = R * size
      g.fillStyle = 'rgba(0,0,0,0.2)'
      g.beginPath()
      g.arc(x + 1.5, y + 2, r, 0, Math.PI * 2)
      g.fill()
      const granite = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r)
      granite.addColorStop(0, '#d9d9d6')
      granite.addColorStop(1, '#7c7f84')
      g.fillStyle = granite
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
      // 손잡이 색으로 누구 돌인지 알 수 있다
      g.fillStyle = COLORS[d.owner]
      g.beginPath()
      g.arc(x, y, r * 0.55, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.5)'
      g.fillRect(x - r * 0.35, y - r * 0.12, r * 0.7, r * 0.24)
      if (highlight) {
        g.strokeStyle = '#1d1c1a'
        g.lineWidth = 2.5
        g.beginPath()
        g.arc(x, y, r + 2, 0, Math.PI * 2)
        g.stroke()
      }
    }

    function draw() {
      if (!size || !latest) return
      const s = latest
      drawSheet()
      const discs: Disc[] = anim ? anim.bodies : endView ? endView.discs : s.discs
      discs.forEach((d) => !d.out && drawStoneAt(d))
      // 내 차례: 던질 돌을 던지는 자리에 놓아 둔다
      if (!anim && !endView && s.winner === null) {
        drawStoneAt({ ...HACK, owner: thrower(s), out: false }, !!aim)
      }
      if (aim) {
        const v = velocityFromAim()
        const power = Math.hypot(v.vx, v.vy) / CURL_MAX
        g.fillStyle = power > 0.85 ? '#d64545' : '#2f6fde'
        g.fillRect(8, size - 14, (size - 16) * power, 6)
      }
    }

    function updateText() {
      const s = latest!
      const i = me() >= 0 ? me() : 0
      score.innerHTML = `
        <span><i style="background:${COLORS[i]}"></i>${esc(name(i))}</span>
        <b>${s.scores[i]} : ${s.scores[1 - i]}</b>
        <span>${esc(name(1 - i))}<i style="background:${COLORS[1 - i]}"></i></span>`
      const left = (p: number) => STONES_EACH - Math.floor((s.thrown + (p === s.first ? 1 : 0)) / 2)
      info.textContent =
        s.winner !== null
          ? '경기 끝'
          : `${s.end}엔드${s.end > ENDS ? '(연장)' : ` / ${ENDS}`} · 남은 돌 ${name(0)} ${left(0)}, ${name(1)} ${left(1)}`
      hint.textContent = endView
        ? endView.text
        : anim || s.winner !== null
          ? ''
          : myTurn()
            ? '아래 돌을 눌러 뒤로 당겼다 놓아요. 과녁 가운데에 가깝게!'
            : `${name(thrower(s))} 차례`
    }

    function velocityFromAim() {
      if (!aim) return { vx: 0, vy: 0 }
      let vx = ((HACK.x - aim.px / size) / 0.3) * CURL_MAX
      let vy = ((HACK.y - aim.py / size) / 0.3) * CURL_MAX
      const speed = Math.hypot(vx, vy)
      if (speed > CURL_MAX) {
        vx *= CURL_MAX / speed
        vy *= CURL_MAX / speed
      }
      return { vx, vy }
    }

    const local = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }
    const onDown = (e: PointerEvent) => {
      if (!myTurn()) return
      const [px, py] = local(e)
      if (Math.hypot(px / size - HACK.x, py / size - HACK.y) > R * 2) return
      aim = { px, py }
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // 붙잡지 못해도 판 안에서는 그대로 동작한다
      }
      draw()
    }
    const onMove = (e: PointerEvent) => {
      if (!aim) return
      ;[aim.px, aim.py] = local(e)
      draw()
    }
    const onUp = () => {
      if (!aim || !latest) return
      const { vx, vy } = velocityFromAim()
      aim = null
      draw()
      if (Math.hypot(vx, vy) < CURL_MAX * 0.05 || !myTurn()) return
      ctx.play(throwStone(latest, vx, vy))
    }
    const onCancel = () => {
      aim = null
      draw()
    }

    function endAnim() {
      cancelAnimationFrame(raf)
      clearTimeout(animTimer)
      anim = null
      updateText()
      draw()
    }

    function animate(shot: NonNullable<State['lastShot']>) {
      if (document.hidden) return
      const make = () => {
        const b = toBodies(shot.from)
        b[shot.id].vx = shot.vx
        b[shot.id].vy = shot.vy
        return b
      }
      anim = { bodies: make(), acc: 0, last: performance.now(), steps: 0 }
      sfx.flick()
      const probe = make()
      let total = 0
      while (total < 1200 && step(probe, ICE)) total++
      clearTimeout(animTimer)
      animTimer = window.setTimeout(endAnim, total * DT * 1000 + 500)
      const frame = (now: number) => {
        if (!anim) return
        anim.acc += Math.min(0.1, (now - anim.last) / 1000)
        anim.last = now
        let moving = true
        while (anim.acc >= DT && moving) {
          moving = step(anim.bodies, ICE)
          anim.acc -= DT
          anim.steps++
        }
        if (!moving || anim.steps > 1200) return endAnim()
        draw()
        raf = requestAnimationFrame(frame)
      }
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(frame)
      updateText()
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    const ro = new ResizeObserver(layout)
    ro.observe(el)

    return {
      render(s) {
        const fresh = latest === null
        const prev = latest
        latest = s
        if (s.shotNo !== shownShot) {
          if (!fresh && s.lastShot && s.shotNo === shownShot + 1) animate(s.lastShot)
          shownShot = s.shotNo
        }
        // 엔드가 끝났으면(점수 기록이 늘었으면) 마지막 배치와 결과를 3초 보여 준다
        if (!fresh && prev && s.ends.length > prev.ends.length) {
          const res = s.ends[s.ends.length - 1]
          const text = res.winner === null ? '이번 엔드는 아무도 점수를 못 얻었어요.' : `${name(res.winner)} +${res.points}점!`
          const discs = s.lastShot && s.shotNo === prev.shotNo + 1 ? s.lastShot.final : prev.discs
          endView = { discs, until: Date.now() + 3500, text }
          clearTimeout(endTimer)
          endTimer = window.setTimeout(() => {
            endView = null
            updateText()
            draw()
          }, (anim ? 2500 : 0) + 3500)
        }
        if (!myTurn()) aim = null
        layout()
        updateText()
        if (!anim) draw()
      },
      destroy() {
        cancelAnimationFrame(raf)
        clearTimeout(animTimer)
        clearTimeout(endTimer)
        ro.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onCancel)
        el.innerHTML = ''
      },
    }
  },
}
