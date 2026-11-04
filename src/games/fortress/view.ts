// 포트리스 화면: 지형과 탱크, 포탄 재생, 이동·각도·파워 조작.
import { art, image } from '../../assets/art'
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import type { GameContext, GameView } from '../types'
import type { Move, State } from '.'
import { BLAST, DT, FUEL, H, TANK_LIFT, fly, type Point, type Tank } from './world'

const COLORS = ['#2f6fde', '#d64545', '#1f9d55', '#d97a00']
/** 파워 게이지가 0에서 100까지 차는 시간 */
const CHARGE_MS = 1600
/** 지형은 이보다 높이 솟지 않으므로 위쪽 하늘은 잘라서 판을 크게 보여 준다. 포탄은 그 위로 날아갔다 돌아올 수 있다 */
const VIEW_TOP = 120

export function mountFortress(el: HTMLElement, ctx: GameContext<Move>): GameView<State> {
  el.innerHTML = `
    <div class="ft">
      <div class="ft-top">
        <span class="ft-wind"></span>
        <span class="ft-turn"></span>
      </div>
      <canvas class="ft-board" aria-label="포트리스 지형"></canvas>
      <p class="ft-rotate">휴대폰을 가로로 돌리면 더 크게 보여요.</p>
      <div class="ft-controls">
        <div class="ft-move">
          <button class="btn" type="button" data-move="-1" aria-label="왼쪽으로 이동">◀</button>
          <span class="ft-fuel"></span>
          <button class="btn" type="button" data-move="1" aria-label="오른쪽으로 이동">▶</button>
        </div>
        <label class="ft-slider">각도 <input type="range" min="0" max="180" step="1" data-input="angle" /> <b class="ft-angle"></b></label>
        <div class="ft-slider">파워
          <div class="ft-gauge" aria-label="파워 게이지"><i class="ft-gauge-fill"></i><i class="ft-gauge-last" hidden></i></div>
          <b class="ft-power"></b>
        </div>
        <button class="btn primary ft-fire" type="button" data-action="fire">꾹 눌러 발사</button>
      </div>
    </div>`
  const canvas = el.querySelector<HTMLCanvasElement>('canvas')!
  const g = canvas.getContext('2d')!
  const windEl = el.querySelector<HTMLElement>('.ft-wind')!
  const turnEl = el.querySelector<HTMLElement>('.ft-turn')!
  const fuelEl = el.querySelector<HTMLElement>('.ft-fuel')!
  const angleIn = el.querySelector<HTMLInputElement>('[data-input=angle]')!
  const gaugeFill = el.querySelector<HTMLElement>('.ft-gauge-fill')!
  const gaugeLast = el.querySelector<HTMLElement>('.ft-gauge-last')!
  const angleOut = el.querySelector<HTMLElement>('.ft-angle')!
  const powerOut = el.querySelector<HTMLElement>('.ft-power')!
  const fireBtn = el.querySelector<HTMLButtonElement>('[data-action=fire]')!
  const moveBtns = [...el.querySelectorAll<HTMLButtonElement>('[data-move]')]

  let latest: State | null = null
  let shownShot = -1
  let width = 0
  let scale = 1
  // 내 차례에 아직 보내지 않은 조작
  let local: { turnNo: number; x: number; angle: number } | null = null
  // 발사 버튼(또는 스페이스)을 누르고 있는 동안 파워가 차오르고, 떼는 순간 쏜다
  let charge: { start: number } | null = null
  let chargeRaf = 0
  let lastPower: number | null = null
  let moveTimer = 0
  // 포탄 재생
  let anim: {
    ground: number[]
    tanks: Tank[]
    shooter: number
    path: Point[]
    impact: Point | null
    t: number
    last: number
    boomUntil: number
  } | null = null
  let raf = 0
  let animTimer = 0

  const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
  const myTurn = () => !!latest && !latest.winners && latest.turn === me() && !anim

  // 흙 질감은 반복 무늬로 깐다. 한 번 만들어 두고 계속 쓴다
  let soil: CanvasPattern | null = null
  function soilPattern(): CanvasPattern | null {
    if (soil) return soil
    const img = image(art.fortressSoil, draw)
    if (!img) return null
    soil = g.createPattern(img, 'repeat')
    soil?.setTransform(new DOMMatrix().scale(0.35))
    return soil
  }
  const name = (i: number) => ctx.names.get(latest!.order[i]) ?? ''

  function layout() {
    if (!latest) return
    const W = latest.ground.length
    // 가로로는 화면 폭, 세로로는 아래 조작부가 함께 보이는 높이 안에 맞춘다(휴대폰 가로 화면)
    const availH = Math.max(150, window.innerHeight - 200)
    const s = Math.min(Math.min(el.clientWidth, 960) / W, availH / (H - VIEW_TOP))
    const w = Math.floor(W * s)
    if (w <= 0 || w === width) return
    width = w
    scale = s
    const h = Math.round((H - VIEW_TOP) * scale)
    const dpr = window.devicePixelRatio || 1
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, -VIEW_TOP * dpr * scale)
    draw()
  }

  function syncLocal(s: State) {
    // 내 차례가 새로 시작되면 조작을 내 탱크 위치와 지난 각도로 맞춘다
    if (s.turn === me() && !s.winners && local?.turnNo !== s.turnNo) {
      const t = s.tanks[me()]
      local = { turnNo: s.turnNo, x: t.x, angle: t.angle }
    }
    if (s.turn !== me() || s.winners) local = null
  }

  function drawTank(ground: number[], t: Tank, i: number, angle: number, x = t.x) {
    if (t.out) return
    const y = ground[x] - TANK_LIFT
    // 판이 작게 그려지는 휴대폰 세로 화면에서도 탱크가 보이도록, 탱크만 크게 그린다(맞는 범위는 그대로)
    const k = Math.max(1, 0.7 / scale)
    g.save()
    g.translate(x, y)
    g.scale(k, k)
    g.translate(-x, -y)
    // 포신
    const rad = (angle * Math.PI) / 180
    g.strokeStyle = '#2b2b2b'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(x, y - 4)
    g.lineTo(x + Math.cos(rad) * 16, y - 4 - Math.sin(rad) * 16)
    g.stroke()
    // 몸체
    g.fillStyle = COLORS[i]
    g.beginPath()
    g.arc(x, y - 3, 7, Math.PI, 0)
    g.fill()
    g.fillRect(x - 12, y - 3, 24, 9)
    // 체력 막대와 이름
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.fillRect(x - 16, y - 26, 32, 5)
    g.fillStyle = t.hp > 50 ? '#1f9d55' : t.hp > 25 ? '#d97a00' : '#d64545'
    g.fillRect(x - 16, y - 26, (32 * t.hp) / 100, 5)
    g.fillStyle = '#1d1c1a'
    g.font = `${12 / scale / k}px 'Gowun Dodum', system-ui, sans-serif` // 화면에서 12px로 보이게 축척을 되돌린다
    g.textAlign = 'center'
    g.fillText(name(i), x, y - 31)
    g.restore()
  }

  function draw() {
    const s = latest
    if (!s || !width) return
    const W = s.ground.length
    const skyImg = image(art.fortressSky, draw)
    if (skyImg) {
      // 보이는 하늘(VIEW_TOP~H)을 가득 채우고, 산이 아래쪽에 오도록 아래에 맞춘다
      const viewH = H - VIEW_TOP
      const k = Math.max(W / skyImg.naturalWidth, viewH / skyImg.naturalHeight)
      const dw = skyImg.naturalWidth * k
      const dh = skyImg.naturalHeight * k
      g.drawImage(skyImg, (W - dw) / 2, H - dh, dw, dh)
    } else {
      const sky = g.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#bcd8f0')
      sky.addColorStop(1, '#eef4f8')
      g.fillStyle = sky
      g.fillRect(0, 0, W, H)
    }

    const ground = anim ? anim.ground : s.ground
    const tanks = anim ? anim.tanks : s.tanks
    g.fillStyle = soilPattern() ?? '#8a5a32'
    g.beginPath()
    g.moveTo(0, H)
    for (let x = 0; x < W; x++) g.lineTo(x, ground[x])
    g.lineTo(W, ground[W - 1])
    g.lineTo(W, H)
    g.closePath()
    g.fill()
    // 땅 윗면은 풀로 덮는다
    const surface = (width: number, color: string, lift: number) => {
      g.strokeStyle = color
      g.lineWidth = width
      g.lineCap = 'round'
      g.beginPath()
      for (let x = 0; x < W; x++) {
        if (ground[x] >= H) continue
        g.moveTo(x, ground[x] + lift)
        g.lineTo(x + 1, ground[Math.min(W - 1, x + 1)] + lift)
      }
      g.stroke()
      g.lineCap = 'butt'
    }
    surface(9, '#3f8a2a', 2)
    surface(3, '#8fd14f', -1)

    tanks.forEach((t, i) => {
      if (anim && i === anim.shooter) return drawTank(ground, t, i, t.angle)
      if (local && i === me()) return drawTank(ground, t, i, local.angle, local.x)
      drawTank(ground, t, i, t.angle)
    })

    if (anim) {
      const k = Math.min(anim.path.length - 1, Math.floor(anim.t / DT))
      if (k < anim.path.length - 1 || !anim.impact) {
        g.strokeStyle = 'rgba(0,0,0,0.2)'
        g.lineWidth = 1.5
        g.beginPath()
        for (let i = Math.max(0, k - 40); i <= k; i++) g.lineTo(anim.path[i].x, anim.path[i].y)
        g.stroke()
        const p = anim.path[k]
        g.fillStyle = '#1d1c1a'
        g.beginPath()
        g.arc(p.x, p.y, 4 * Math.max(1, 0.7 / scale), 0, Math.PI * 2)
        g.fill()
      } else if (anim.impact) {
        const left = (anim.boomUntil - performance.now()) / 400
        g.fillStyle = `rgba(255, 140, 40, ${Math.max(0, left)})`
        g.beginPath()
        g.arc(anim.impact.x, anim.impact.y, BLAST * (1.2 - left * 0.4), 0, Math.PI * 2)
        g.fill()
      }
    }
  }

  function updateControls() {
    const s = latest
    if (!s) return
    const w = s.wind
    windEl.textContent = w === 0 ? '바람 없음' : `바람 ${w < 0 ? '←'.repeat(Math.min(3, Math.ceil(-w / 2))) : '→'.repeat(Math.min(3, Math.ceil(w / 2)))} ${Math.abs(w)}`
    turnEl.innerHTML = s.winners ? '' : myTurn() ? '<b>내 차례</b>' : `${esc(name(s.turn))} 차례`
    const can = myTurn() && !!local
    for (const b of moveBtns) b.disabled = !can
    angleIn.disabled = fireBtn.disabled = !can
    if (local) {
      angleIn.value = String(local.angle)
      fuelEl.textContent = `이동 ${FUEL - Math.abs(local.x - s.tanks[me()].x)}`
    } else {
      fuelEl.textContent = ''
    }
    angleOut.textContent = `${angleIn.value}°`
    updateGauge()
  }

  function chargePower() {
    return charge ? Math.min(100, Math.round(((performance.now() - charge.start) / CHARGE_MS) * 100)) : 0
  }

  function updateGauge() {
    const p = chargePower()
    gaugeFill.style.width = `${p}%`
    gaugeFill.classList.toggle('is-max', p >= 100)
    gaugeLast.hidden = lastPower === null
    if (lastPower !== null) gaugeLast.style.left = `${lastPower}%`
    powerOut.textContent = charge ? String(p) : lastPower === null ? '' : String(lastPower)
  }

  function startCharge() {
    if (!myTurn() || !local || charge) return
    charge = { start: performance.now() }
    fireBtn.classList.add('is-charging')
    const tick = () => {
      if (!charge) return
      updateGauge()
      chargeRaf = requestAnimationFrame(tick)
    }
    chargeRaf = requestAnimationFrame(tick)
  }

  function stopCharge() {
    charge = null
    cancelAnimationFrame(chargeRaf)
    fireBtn.classList.remove('is-charging')
    updateGauge()
  }

  /** 손을 떼면 그때까지 찬 파워로 쏜다 */
  function releaseCharge() {
    if (!charge) return
    const p = chargePower()
    stopCharge()
    fire(p)
  }

  function stepMove(dir: number) {
    const s = latest
    if (!s || !local || !myTurn()) return
    const nx = local.x + dir
    if (nx < 0 || nx >= s.ground.length || Math.abs(nx - s.tanks[me()].x) > FUEL || s.ground[nx] >= H) return
    local.x = nx
    updateControls()
    draw()
  }

  function startMove(dir: number) {
    stopMove()
    stepMove(dir)
    moveTimer = window.setInterval(() => stepMove(dir), 30)
  }

  function stopMove() {
    clearInterval(moveTimer)
  }

  function fire(power: number) {
    const s = latest
    if (!s || !local || !myTurn()) return
    lastPower = power // 다음 턴에 게이지에 지난 파워를 표시해 준다
    updateGauge()
    const shot = { x: local.x, angle: local.angle, power, wind: s.wind }
    const tanks = s.tanks.map((t, i) => (i === me() ? { ...t, x: local!.x } : t))
    const { impact } = fly(s.ground, tanks, me(), shot)
    ctx.play({ x: local.x, angle: local.angle, power, impact })
  }

  function endAnim() {
    cancelAnimationFrame(raf)
    clearTimeout(animTimer)
    anim = null
    updateControls()
    draw()
  }

  function animate(shot: NonNullable<State['lastShot']>) {
    if (document.hidden) return
    const { path } = fly(shot.ground, shot.tanks, shot.player, { x: shot.x, angle: shot.angle, power: shot.power, wind: shot.wind })
    // 날아가는 모습은 이 기기에서 계산한 궤적으로, 끝점은 쏜 사람이 보낸 착탄 위치로 맞춘다
    if (shot.impact) path[path.length - 1] = shot.impact
    anim = { ground: shot.ground, tanks: shot.tanks, shooter: shot.player, path, impact: shot.impact, t: 0, last: performance.now(), boomUntil: 0 }
    sfx.flick()
    const flight = path.length * DT
    // 브라우저가 그리기를 멈춰도 재생 길이가 지나면 끝낸다
    clearTimeout(animTimer)
    animTimer = window.setTimeout(endAnim, flight * 1000 + 900)
    cancelAnimationFrame(raf)
    const frame = (now: number) => {
      if (!anim) return
      anim.t += Math.min(0.1, (now - anim.last) / 1000)
      anim.last = now
      if (anim.t >= flight) {
        if (!anim.impact) return endAnim()
        if (!anim.boomUntil) {
          anim.boomUntil = now + 400
          sfx.boom()
        }
        if (now >= anim.boomUntil) return endAnim()
      }
      draw()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    updateControls()
  }

  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement
    if (t === angleIn && local) local.angle = Number(angleIn.value)
    updateControls()
    draw()
  }
  const onPointerDown = (e: PointerEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-move]')
    if (b && !b.disabled) {
      e.preventDefault()
      startMove(Number(b.dataset.move))
    }
    if ((e.target as HTMLElement).closest('[data-action=fire]') && !fireBtn.disabled) {
      e.preventDefault()
      try {
        fireBtn.setPointerCapture(e.pointerId) // 손가락이 버튼 밖으로 밀려도 떼는 순간까지 따라간다
      } catch {
        // 붙잡지 못해도 버튼 위에서 떼면 쏜다
      }
      startCharge()
    }
  }
  const onFireUp = () => releaseCharge()
  // 키보드: ←→ 이동, ↑↓ 각도, 스페이스를 누르고 있다가 떼면 발사
  const onKey = (e: KeyboardEvent) => {
    if (!myTurn() || !local || (e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') stepMove(e.key === 'ArrowLeft' ? -1 : 1)
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') local.angle = Math.max(0, Math.min(180, local.angle + (e.key === 'ArrowUp' ? 1 : -1)))
    else if (e.key === ' ') {
      if (!e.repeat) startCharge()
    } else return
    e.preventDefault()
    updateControls()
    draw()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== ' ' || !charge) return
    e.preventDefault()
    releaseCharge()
  }
  const onVisibility = () => {
    if (document.hidden && anim) endAnim()
  }

  el.addEventListener('input', onInput)
  el.addEventListener('pointerdown', onPointerDown)
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) el.addEventListener(ev, stopMove)
  fireBtn.addEventListener('pointerup', onFireUp)
  fireBtn.addEventListener('pointercancel', stopCharge)
  fireBtn.addEventListener('contextmenu', (e) => e.preventDefault()) // 휴대폰에서 길게 누를 때 메뉴가 뜨지 않게
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibility)
  const ro = new ResizeObserver(layout)
  ro.observe(el)
  window.addEventListener('resize', layout) // 화면을 돌리면 높이가 바뀐다

  return {
    render(s) {
      const fresh = latest === null
      latest = s
      if (s.shotNo !== shownShot) {
        if (!fresh && s.lastShot && s.shotNo === shownShot + 1) animate(s.lastShot)
        shownShot = s.shotNo
      }
      syncLocal(s)
      if (charge && !myTurn()) stopCharge() // 누르고 있는 사이 시간이 다 되면 취소
      layout()
      updateControls()
      if (!anim) draw()
    },
    destroy() {
      stopMove()
      stopCharge()
      cancelAnimationFrame(raf)
      window.removeEventListener('keyup', onKeyUp)
      clearTimeout(animTimer)
      ro.disconnect()
      window.removeEventListener('resize', layout)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      el.innerHTML = ''
    },
  }
}
