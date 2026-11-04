// 땅따먹기 화면: 땅 칠하기, 이번 턴 경로, 새총 입력, 다른 사람이 튕긴 움직임 재생.
import { art, image } from '../../assets/art'
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import { DT, MAX_SPEED, step, toBodies, type Body } from '../shared/physics'
import type { GameContext, GameView } from '../types'
import { FLICKS, TURNS_EACH, flick, type Move, type State } from '.'
import { G, areaOf, houseCenter, houseRect, type Point } from './rules'

const COLORS = ['#2f6fde', '#d64545', '#1f9d55', '#d97a00']
// 땅 색: 땅 층에서는 불투명하게 칠하고, 층 전체를 반투명하게 모래 위에 얹는다
const TINTS = ['#4f86ee', '#e0574f', '#2fae63', '#ef9a2e']
const STONE_R = 0.018
const MAX_PULL = 0.3 // 판 길이의 0.3만큼 당기면 최대 세기

export function mountTerritory(el: HTMLElement, ctx: GameContext<Move>): GameView<State> {
  el.innerHTML = `
    <div class="terr">
      <ul class="terr-scores"></ul>
      <div class="terr-wrap"><canvas class="terr-board" aria-label="땅따먹기 판"></canvas></div>
      <p class="terr-hint"></p>
    </div>`
  const scores = el.querySelector<HTMLElement>('.terr-scores')!
  const hint = el.querySelector<HTMLElement>('.terr-hint')!
  const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
  const g = canvas.getContext('2d')!
  const landLayer = document.createElement('canvas')

  let latest: State | null = null
  let size = 0
  let shownShot = -1
  let notice = ''
  let noticeUntil = 0
  let anim: { bodies: Body[]; acc: number; last: number; steps: number; player: number } | null = null
  let raf = 0
  let animTimer = 0
  let aim: { px: number; py: number } | null = null

  const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
  const myTurn = () => !!latest && !latest.winners && latest.turn === me() && !anim
  const name = (i: number) => ctx.names.get(latest!.order[i]) ?? ''

  function layout() {
    const w = Math.floor(Math.min(el.clientWidth, 560, Math.max(280, window.innerHeight - 260)))
    if (w <= 0 || w === size) return
    size = w
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = canvas.style.height = `${w}px`
    canvas.width = canvas.height = Math.round(w * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw()
  }

  const sx = (p: Point) => p.x * size
  const sy = (p: Point) => p.y * size

  function polyline(pts: Point[], color: string, dash: number[], close = false) {
    if (pts.length < 2) return
    g.strokeStyle = color
    g.lineWidth = 2
    g.setLineDash(dash)
    g.beginPath()
    g.moveTo(sx(pts[0]), sy(pts[0]))
    for (const p of pts.slice(1)) g.lineTo(sx(p), sy(p))
    if (close) g.closePath()
    g.stroke()
    g.setLineDash([])
  }

  function draw() {
    if (!size) return
    const sand = image(art.groundSand, draw)
    if (sand) g.drawImage(sand, 0, 0, size, size)
    else {
      g.fillStyle = '#efe9d8'
      g.fillRect(0, 0, size, size)
    }
    const s = latest
    if (!s) return

    // 땅은 따로 그린 층을 반투명하게 모래 위에 얹어 질감이 비치게 한다(겹친 곳의 색이 섞이지 않도록 층에서는 불투명하게 칠한다)
    const lg = landLayer.getContext('2d')!
    if (landLayer.width !== canvas.width) {
      landLayer.width = canvas.width
      landLayer.height = canvas.height
    }
    lg.setTransform(canvas.width / size, 0, 0, canvas.height / size, 0, 0)
    lg.clearRect(0, 0, size, size)

    // 땅은 지나온 경로 도형 그대로 칠한다. 겹친 곳은 먼저 얻은 사람 땅이므로, 나중에 얻은 도형부터 그리고
    // 먼저 얻은 도형을 위에 덮는다. 집은 맨 처음 땅이라 가장 위에 그린다
    for (let i = s.claims.length - 1; i >= 0; i--) {
      const { player, shape } = s.claims[i]
      lg.fillStyle = TINTS[player]
      lg.beginPath()
      lg.moveTo(sx(shape[0]), sy(shape[0]))
      for (const p of shape.slice(1)) lg.lineTo(sx(p), sy(p))
      lg.closePath()
      lg.fill('evenodd') // 꼬인 도형도 판정(even-odd)과 같은 모양으로 칠한다
    }
    s.corners.forEach((corner, p) => {
      const r = houseRect(corner)
      lg.fillStyle = TINTS[p]
      lg.fillRect(r.x * size, r.y * size, r.size * size, r.size * size)
    })
    g.save()
    g.globalAlpha = 0.62
    g.drawImage(landLayer, 0, 0, size, size)
    g.restore()
    s.corners.forEach((corner, p) => {
      const r = houseRect(corner)
      g.strokeStyle = COLORS[p]
      g.lineWidth = s.out.includes(p) ? 1 : 3
      g.strokeRect(r.x * size + 1.5, r.y * size + 1.5, r.size * size - 3, r.size * size - 3)
    })

    // 방금 끝난 턴의 도형, 이번 턴에 지나온 경로
    if (s.lastTurn && s.stops.length === 0 && !anim) {
      polyline(s.lastTurn.shape, COLORS[s.lastTurn.player], [4, 4], s.lastTurn.ok)
    }
    if (!s.winners) {
      const start = houseCenter(s.corners[s.turn])
      polyline([start, ...s.stops], COLORS[s.turn], [6, 4])
      for (const p of s.stops) {
        g.fillStyle = COLORS[s.turn]
        g.beginPath()
        g.arc(sx(p), sy(p), 3, 0, Math.PI * 2)
        g.fill()
      }
    }

    const stone = anim ? anim.bodies[0] : s.winners ? null : s.stone
    if (stone && !(anim && anim.bodies[0].out)) {
      const player = anim ? anim.player : s.turn
      g.beginPath()
      g.arc(sx(stone), sy(stone), STONE_R * size, 0, Math.PI * 2)
      g.fillStyle = COLORS[player]
      g.fill()
      g.strokeStyle = '#fff'
      g.lineWidth = 2
      g.stroke()
    }

    if (aim && stone) {
      const v = velocityFromAim()
      const power = Math.sqrt(v.vx * v.vx + v.vy * v.vy) / MAX_SPEED
      g.strokeStyle = '#1d1c1a'
      g.lineWidth = 2
      g.setLineDash([6, 6])
      g.beginPath()
      g.moveTo(sx(stone), sy(stone))
      g.lineTo(sx(stone) + v.vx * 0.25 * size, sy(stone) + v.vy * 0.25 * size)
      g.stroke()
      g.setLineDash([])
      g.fillStyle = power > 0.85 ? '#d64545' : '#1d1c1a'
      g.fillRect(8, size - 14, (size - 16) * power, 6)
    }
  }

  function updateText() {
    const s = latest
    if (!s) return
    scores.innerHTML = s.order
      .map((_, i) => {
        const pct = ((areaOf(s.land, i) / (G * G)) * 100).toFixed(1)
        const left = TURNS_EACH - s.turnsTaken[i]
        const cls = [i === s.turn && !s.winners && 'is-turn', i === me() && 'is-me', s.out.includes(i) && 'is-out']
          .filter(Boolean)
          .join(' ')
        return `<li class="${cls}"><i style="background:${COLORS[i]}"></i><span>${esc(name(i))}</span><b>${pct}%</b><small>${
          s.out.includes(i) ? '기권' : `남은 턴 ${left}`
        }</small></li>`
      })
      .join('')

    let text = ''
    if (Date.now() < noticeUntil) text = notice
    else if (anim || s.winners) text = ''
    else if (myTurn()) {
      text =
        s.stops.length === FLICKS - 1
          ? `마지막 ${FLICKS}번째! 내 땅 안에 멈춰야 땅을 얻어요.`
          : `${s.stops.length + 1}번째 튕기기. 돌을 당겼다 놓으세요. 3번째에 내 땅으로 돌아오면 성공!`
    } else text = `${name(s.turn)} 차례, ${s.stops.length + 1}/${FLICKS}번째 튕기기`
    hint.textContent = text
  }

  function velocityFromAim() {
    if (!aim || !latest) return { vx: 0, vy: 0 }
    const st = latest.stone
    let vx = ((st.x - aim.px / size) / MAX_PULL) * MAX_SPEED
    let vy = ((st.y - aim.py / size) / MAX_PULL) * MAX_SPEED
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
    const st = latest.stone
    // 손가락으로 잡기 쉽도록 돌 주변을 넉넉히 잡힌 것으로 본다
    if (Math.sqrt((px / size - st.x) ** 2 + (py / size - st.y) ** 2) > 0.07) return
    aim = { px, py }
    try {
      canvas.setPointerCapture(e.pointerId)
    } catch {
      // 포인터를 붙잡지 못해도 판 안에서는 그대로 동작한다
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
    aim = null
    draw()
    if (Math.sqrt(vx * vx + vy * vy) < MAX_SPEED * 0.05 || !myTurn()) return
    ctx.play(flick(latest.stone, vx, vy))
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
      const bodies = toBodies([{ ...shot.from, owner: 0, out: false }])
      bodies[0].vx = shot.vx
      bodies[0].vy = shot.vy
      return bodies
    }
    anim = { bodies: make(), acc: 0, last: performance.now(), steps: 0, player: shot.player }
    sfx.flick()
    // 브라우저가 그리기를 멈춰도 재생 길이가 지나면 끝낸다
    const probe = make()
    let total = 0
    while (total < 1200 && step(probe)) total++
    clearTimeout(animTimer)
    animTimer = window.setTimeout(endAnim, total * DT * 1000 + 500)
    cancelAnimationFrame(raf)
    const frame = (now: number) => {
      if (!anim) return
      anim.acc += Math.min(0.1, (now - anim.last) / 1000)
      anim.last = now
      let moving = true
      while (anim.acc >= DT && moving) {
        moving = step(anim.bodies)
        anim.acc -= DT
        anim.steps++
      }
      if (!moving || anim.steps > 1200) return endAnim()
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    updateText()
  }

  const onVisibility = () => {
    if (document.hidden && anim) endAnim()
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
      const prev = latest
      latest = s
      if (s.shotNo !== shownShot) {
        if (!fresh && s.lastShot && s.shotNo === shownShot + 1) animate(s.lastShot)
        // 턴이 끝났으면 결과를 잠깐 알려 준다
        if (!fresh && s.lastTurn && s.lastTurn !== prev?.lastTurn) {
          const who = name(s.lastTurn.player)
          notice = s.lastTurn.ok ? `${who} 성공! 땅 +${s.lastTurn.gained}칸` : `${who} 실패. 땅은 그대로예요`
          noticeUntil = Date.now() + 3000
          // 재생이 끝날 즈음 결과 소리를 낸다
          window.setTimeout(s.lastTurn.ok ? sfx.gain : sfx.fall, anim ? 900 : 0)
        }
        shownShot = s.shotNo
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
}
