// 알까기(기획안 4장): 내 돌을 뒤로 당겼다 놓아 튕긴다. 판 밖으로 나간 돌은 사라지고, 상대 돌이 모두 사라지면 승리.
// 한 번 튕기면 차례가 넘어간다. 양쪽 돌이 동시에 모두 사라지면 무승부로 보고 새로 놓고 다시 한다.
//
// 동기화: 쏜 사람의 화면에서 물리 계산을 끝까지 해 최종 배치(end)를 수에 담아 보낸다.
// 받는 쪽은 같은 입력(id, vx, vy)으로 움직임을 재생해 보여 주고, 멈추면 end로 맞춘다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameDef } from '../types'
import { DT, MAX_SPEED, R, simulate, step, toBodies, type Body, type Disc } from '../shared/physics'

/** 처음 배치: 양쪽 5개씩 줄지어 놓는다. owner 0은 아래쪽, 1은 위쪽 */
export function initialDiscs(): Disc[] {
  const xs = [0.2, 0.35, 0.5, 0.65, 0.8]
  return [
    ...xs.map((x) => ({ x, y: 0.8, owner: 0, out: false })),
    ...xs.map((x) => ({ x, y: 0.2, owner: 1, out: false })),
  ]
}

type State = {
  order: string[]
  discs: Disc[]
  /** 이번에 쏠 사람(order 번호) */
  turn: number
  /** 지금까지 쏜 횟수. 화면은 이 번호가 바뀌면 lastShot을 재생한다 */
  shotNo: number
  lastShot: { id: number; vx: number; vy: number; from: Disc[] } | null
  /** 무승부로 새로 놓은 횟수 */
  replays: number
  winner: number | null
}
type Move = { id: number; vx: number; vy: number; end: Disc[] }

const alive = (discs: Disc[], owner: number) => discs.filter((d) => d.owner === owner && !d.out).length

/** 받은 최종 배치가 말이 되는지 본다: 돌 수와 주인이 같고, 사라진 돌이 되살아나지 않고, 판 안에 있다 */
function validEnd(before: Disc[], end: unknown): end is Disc[] {
  if (!Array.isArray(end) || end.length !== before.length) return false
  return end.every((d: Disc, i) => {
    if (typeof d !== 'object' || d === null || d.owner !== before[i].owner || typeof d.out !== 'boolean') return false
    if (before[i].out && !d.out) return false
    return d.out || (Number.isFinite(d.x) && Number.isFinite(d.y) && d.x >= 0 && d.x <= 1 && d.y >= 0 && d.y <= 1)
  })
}

export const alkkagi: GameDef<State, Move> = {
  turnSeconds: 20,

  init: (order, seed) => ({
    order,
    discs: initialDiscs(),
    turn: seed % 2,
    shotNo: 0,
    lastShot: null,
    replays: 0,
    winner: null,
  }),

  turnOf: (s) => (s.winner === null ? s.order[s.turn] : null),

  apply(s, by, { id, vx, vy, end }) {
    const me = s.order.indexOf(by)
    if (s.winner !== null || me !== s.turn) return null
    const d = s.discs[id]
    if (!d || d.owner !== me || d.out) return null
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || Math.sqrt(vx * vx + vy * vy) > MAX_SPEED * 1.001) return null
    if (!validEnd(s.discs, end)) return null

    const lastShot = { id, vx, vy, from: s.discs }
    const base = { ...s, shotNo: s.shotNo + 1, lastShot, turn: 1 - me }
    const mine = alive(end, me)
    const theirs = alive(end, 1 - me)
    if (mine === 0 && theirs === 0) {
      // 양쪽이 동시에 모두 사라졌다. 다시 놓고 이번에 안 쏜 사람부터 시작한다
      return { ...base, discs: initialDiscs(), replays: s.replays + 1 }
    }
    if (theirs === 0) return { ...base, discs: end, winner: me }
    if (mine === 0) return { ...base, discs: end, winner: 1 - me }
    return { ...base, discs: end }
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
      <div class="alk">
        <div class="alk-score"></div>
        <div class="alk-wrap"><canvas class="alk-board" aria-label="알까기 판"></canvas></div>
        <p class="alk-hint"></p>
      </div>`
    const score = el.querySelector<HTMLElement>('.alk-score')!
    const hint = el.querySelector<HTMLElement>('.alk-hint')!
    const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
    const g = canvas.getContext('2d')!

    let latest: State | null = null
    let size = 0
    let shownShot = -1
    let shownReplays = 0
    let notice = ''
    let noticeUntil = 0
    // 재생 중인 움직임
    let anim: { bodies: Body[]; acc: number; last: number; steps: number } | null = null
    let raf = 0
    let animTimer = 0
    // 당기는 중인 돌
    let aim: { id: number; px: number; py: number } | null = null

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    // 내 돌이 항상 아래쪽에 보이도록 위쪽 사람(1번)은 판을 180도 돌려 본다
    const flip = () => me() === 1
    const toScreen = (x: number, y: number): [number, number] => (flip() ? [(1 - x) * size, (1 - y) * size] : [x * size, y * size])
    const toBoard = (sx: number, sy: number): [number, number] => (flip() ? [1 - sx / size, 1 - sy / size] : [sx / size, sy / size])
    const myTurn = () => !!latest && latest.winner === null && latest.turn === me() && !anim

    function layout() {
      const w = Math.floor(Math.min(el.clientWidth, 560, Math.max(280, window.innerHeight - 230)))
      if (w <= 0 || w === size) return
      size = w
      const dpr = window.devicePixelRatio || 1
      canvas.style.width = canvas.style.height = `${w}px`
      canvas.width = canvas.height = Math.round(w * dpr)
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }

    function draw() {
      if (!size) return
      g.fillStyle = '#dcb468'
      g.fillRect(0, 0, size, size)
      g.strokeStyle = 'rgba(92, 67, 32, 0.45)'
      g.lineWidth = 1
      g.beginPath()
      for (let i = 1; i < 19; i++) {
        const p = Math.round((i / 19) * size) + 0.5
        g.moveTo(p, 0)
        g.lineTo(p, size)
        g.moveTo(0, p)
        g.lineTo(size, p)
      }
      g.stroke()
      if (!latest) return

      const discs: Disc[] = anim ? anim.bodies : latest.discs
      const r = R * size
      discs.forEach((d, i) => {
        if (d.out) return
        const [x, y] = toScreen(d.x, d.y)
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fillStyle = d.owner === 0 ? '#151515' : '#f7f7f2'
        g.fill()
        g.strokeStyle = d.owner === 0 ? '#000' : '#8a8a80'
        g.lineWidth = 1
        g.stroke()
        if (aim?.id === i) {
          g.strokeStyle = '#2f6fde'
          g.lineWidth = 3
          g.stroke()
        }
      })

      if (aim && latest) {
        // 당긴 반대 방향으로 날아간다. 점선은 날아갈 방향, 막대는 세기
        const d = latest.discs[aim.id]
        const [sx, sy] = toScreen(d.x, d.y)
        const v = velocityFromAim()
        const power = Math.sqrt(v.vx * v.vx + v.vy * v.vy) / MAX_SPEED
        const [ex, ey] = toScreen(d.x + v.vx * 0.25, d.y + v.vy * 0.25)
        g.strokeStyle = '#2f6fde'
        g.lineWidth = 2
        g.setLineDash([6, 6])
        g.beginPath()
        g.moveTo(sx, sy)
        g.lineTo(ex, ey)
        g.stroke()
        g.setLineDash([])
        g.strokeStyle = 'rgba(47, 111, 222, 0.5)'
        g.beginPath()
        g.moveTo(sx, sy)
        g.lineTo(aim.px, aim.py)
        g.stroke()
        g.fillStyle = power > 0.85 ? '#d64545' : '#2f6fde'
        g.fillRect(8, size - 14, (size - 16) * power, 6)
      }
    }

    function updateText() {
      const s = latest
      if (!s) return
      const i = me()
      const name = (k: number) => esc(ctx.names.get(s.order[k]) ?? '')
      const left = i >= 0 ? i : 0
      score.innerHTML = `
        <span>${name(left)} <b>${alive(s.discs, left)}</b></span>
        <span class="alk-vs">남은 돌</span>
        <span><b>${alive(s.discs, 1 - left)}</b> ${name(1 - left)}</span>`
      hint.textContent =
        Date.now() < noticeUntil
          ? notice
          : anim
            ? ''
            : myTurn()
              ? '내 돌을 눌러 뒤로 당겼다 놓으세요. 많이 당길수록 세게 나가요.'
              : s.winner === null
                ? `${ctx.names.get(s.order[s.turn])} 차례`
                : ''
    }

    function velocityFromAim() {
      if (!aim || !latest) return { vx: 0, vy: 0 }
      const d = latest.discs[aim.id]
      const [bx, by] = toBoard(aim.px, aim.py)
      // 돌에서 손가락까지 당긴 거리의 반대 방향. 판 길이의 0.3만큼 당기면 최대 세기
      let vx = ((d.x - bx) / 0.3) * MAX_SPEED
      let vy = ((d.y - by) / 0.3) * MAX_SPEED
      const speed = Math.sqrt(vx * vx + vy * vy)
      if (speed > MAX_SPEED) {
        vx *= MAX_SPEED / speed
        vy *= MAX_SPEED / speed
      }
      return { vx, vy }
    }

    function localPoint(e: PointerEvent): [number, number] {
      const rect = canvas.getBoundingClientRect()
      return [e.clientX - rect.left, e.clientY - rect.top]
    }

    const onDown = (e: PointerEvent) => {
      if (!myTurn() || !latest) return
      const [px, py] = localPoint(e)
      const [bx, by] = toBoard(px, py)
      // 손가락으로 잡기 쉽도록 반지름의 1.6배 안이면 잡힌 것으로 본다
      let best = -1
      let bestDist = R * 1.6
      latest.discs.forEach((d, i) => {
        if (d.out || d.owner !== me()) return
        const dist = Math.sqrt((d.x - bx) ** 2 + (d.y - by) ** 2)
        if (dist < bestDist) {
          best = i
          bestDist = dist
        }
      })
      if (best < 0) return
      aim = { id: best, px, py }
      try {
        canvas.setPointerCapture(e.pointerId) // 판 밖까지 당겨도 계속 따라가게 한다
      } catch {
        // 일부 브라우저에서 포인터를 붙잡지 못해도 판 안에서는 그대로 동작한다
      }
      draw()
    }

    const onMove = (e: PointerEvent) => {
      if (!aim) return
      ;[aim.px, aim.py] = localPoint(e)
      draw()
    }

    const onUp = () => {
      if (!aim || !latest) return
      const { vx, vy } = velocityFromAim()
      const id = aim.id
      aim = null
      draw()
      // 너무 조금 당겼으면 취소로 본다
      if (Math.sqrt(vx * vx + vy * vy) < MAX_SPEED * 0.05 || !myTurn()) return
      const end = simulate(latest.discs, { id, vx, vy })
      ctx.play({ id, vx, vy, end })
    }

    const onCancel = () => {
      aim = null
      draw()
    }

    function animate(s: State) {
      // 화면이 가려져 있으면 브라우저가 그리기를 멈추므로 재생하지 않고 최종 배치를 바로 보여 준다
      if (document.hidden) return
      const shot = s.lastShot!
      const bodies = toBodies(shot.from)
      bodies[shot.id].vx = shot.vx
      bodies[shot.id].vy = shot.vy
      anim = { bodies, acc: 0, last: performance.now(), steps: 0 }
      sfx.flick()
      cancelAnimationFrame(raf)
      // 브라우저가 그리기를 멈추면(가려진 창 등) 재생이 끝나지 않으므로, 재생 길이가 지나면 타이머로 끝낸다
      const probe = toBodies(shot.from)
      probe[shot.id].vx = shot.vx
      probe[shot.id].vy = shot.vy
      let total = 0
      while (total < 1200 && step(probe)) total++
      clearTimeout(animTimer)
      animTimer = window.setTimeout(() => {
        if (!anim) return
        cancelAnimationFrame(raf)
        anim = null
        updateText()
        draw()
      }, total * DT * 1000 + 500)
      const frame = (now: number) => {
        if (!anim) return
        anim.acc += Math.min(0.1, (now - anim.last) / 1000)
        anim.last = now
        let moving = true
        const outBefore = anim.bodies.filter((b) => b.out).length
        while (anim.acc >= DT && moving) {
          moving = step(anim.bodies)
          anim.acc -= DT
          anim.steps++
        }
        if (anim.bodies.filter((b) => b.out).length > outBefore) sfx.fall() // 돌이 판 밖으로 떨어졌다
        if (!moving || anim.steps > 1200) {
          // 멈추면 쏜 사람이 확정한 배치로 맞춘다
          anim = null
          updateText()
          draw()
          return
        }
        draw()
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
      updateText()
    }

    // 재생 중에 다른 앱이나 탭으로 가면 재생을 끝내고 최종 배치로 맞춘다
    const onVisibility = () => {
      if (!document.hidden || !anim) return
      cancelAnimationFrame(raf)
      anim = null
      updateText()
      draw()
    }
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onCancel)
    const ro = new ResizeObserver(layout)
    ro.observe(el)
    window.addEventListener('resize', layout)

    return {
      render(s) {
        const fresh = latest === null
        latest = s
        if (s.shotNo !== shownShot) {
          // 처음 그리거나(새로고침 직후) 판이 새로 시작되었으면 재생 없이 그대로 보여 준다
          if (!fresh && s.lastShot && s.shotNo === shownShot + 1) animate(s)
          shownShot = s.shotNo
        }
        if (s.replays !== shownReplays) {
          if (!fresh) {
            notice = '양쪽 돌이 모두 떨어졌어요. 무승부라 다시 놓고 해요!'
            noticeUntil = Date.now() + 3000
          }
          shownReplays = s.replays
        }
        if (!myTurn()) aim = null
        layout()
        updateText()
        if (!anim) draw()
      },
      destroy() {
        cancelAnimationFrame(raf)
        clearTimeout(animTimer)
        document.removeEventListener('visibilitychange', onVisibility)
        ro.disconnect()
        window.removeEventListener('resize', layout)
        canvas.removeEventListener('pointerdown', onDown)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerup', onUp)
        canvas.removeEventListener('pointercancel', onCancel)
        el.innerHTML = ''
      },
    }
  },
}
