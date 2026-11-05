// 해적선 찾기(2명): 각자 자기 바다에 배 4척을 몰래 놓고, 번갈아 상대 바다의 칸을 골라 대포를 쏜다.
// 상대 배를 모두 먼저 가라앉히면 이긴다.
//
// 배치는 각자 자기 브라우저에만 있다(숫자 야구와 달리 방장도 상대 배를 모른다).
// - 판이 시작되면 각자 배치의 지문(소금 섞은 해시)만 알린다.
// - 상대가 쏜 칸이 맞았는지는 맞은 쪽 브라우저가 스스로 답한다(맞으면 가라앉았는지도).
// - 판이 끝나면 둘 다 배치를 공개하고, 모든 화면이 지문과 지금까지의 답이 맞는지 확인한다. 거짓으로 답했으면 진다.
import { sfx } from '../../sound'
import { esc } from '../../ui/dom'
import { fingerprint } from '../baseball'
import type { GameDef } from '../types'
import { N, SHIPS, answerFor, fleetText, randomFleet, validFleet, type Fleet } from './rules'

export type Reveal = { fleet: Fleet; salt: string; verified: boolean }
export type State = {
  order: string[]
  phase: 'setup' | 'play' | 'reveal' | 'done'
  /** 배치를 먼저 알리는 사람(order 번호). 쏘기도 이 사람부터 */
  first: number
  commits: (string | null)[]
  /** 지금 쏘는 사람 */
  turn: number
  /** 쏘고 답을 기다리는 칸 */
  pending: number | null
  /** shots[p]: p의 바다에 날아온 포탄과 답 */
  shots: { cell: number; hit: boolean }[][]
  /** sunk[p]: p의 배 중 가라앉은 배 */
  sunk: number[][][]
  reveals: (Reveal | null)[]
  /** 상대 배를 모두 가라앉힌 사람 */
  sinker: number | null
  winner: number | null
}
export type Move =
  | { kind: 'commit'; hash: string }
  | { kind: 'shot'; cell: number }
  | { kind: 'answer'; hit: boolean; sunk: number[] | null }
  | { kind: 'reveal'; fleet: Fleet; salt: string }

const other = (p: number) => 1 - p
const commitOf = (fleet: Fleet, salt: string) => fingerprint(`${fleetText(fleet)}:${salt}`)

/** 공개한 배치가 지문, 그동안의 답과 모두 맞는가 */
export function checkReveal(s: State, p: number, fleet: unknown, salt: unknown): boolean {
  if (!validFleet(fleet) || typeof salt !== 'string' || commitOf(fleet, salt) !== s.commits[p]) return false
  const cells = new Set(fleet.flat())
  if (!s.shots[p].every((sh) => sh.hit === cells.has(sh.cell))) return false
  const hit = new Set(s.shots[p].filter((sh) => sh.hit).map((sh) => sh.cell))
  // 다 맞은 배는 가라앉았다고 알렸어야 하고, 알린 배는 실제 배와 같아야 한다
  const key = (ship: number[]) => [...ship].sort((a, b) => a - b).join()
  const reported = new Set(s.sunk[p].map(key))
  return fleet.every((ship) => ship.every((c) => hit.has(c)) === reported.has(key(ship))) && reported.size === s.sunk[p].length
}

function finishReveal(s: State): State {
  if (s.reveals.some((r) => r === null)) return s
  const bad = s.reveals.map((r) => !r!.verified)
  const winner = bad[0] && bad[1] ? null : bad[0] ? 1 : bad[1] ? 0 : s.sinker
  return { ...s, phase: 'done', winner }
}

/** 공개할 차례인 사람: 먼저 한 사람부터, 아직 안 한 사람 */
const revealTurn = (s: State) => [s.first, other(s.first)].find((p) => s.reveals[p] === null) ?? null
const commitTurn = (s: State) => [s.first, other(s.first)].find((p) => s.commits[p] === null) ?? null

export const pirates: GameDef<State, Move> = {
  turnSeconds: 40,

  init: (order, seed) => ({
    order,
    phase: 'setup',
    first: seed % 2,
    commits: [null, null],
    turn: seed % 2,
    pending: null,
    shots: [[], []],
    sunk: [[], []],
    reveals: [null, null],
    sinker: null,
    winner: null,
  }),

  turnOf(s) {
    if (s.phase === 'setup') return s.order[commitTurn(s)!]
    if (s.phase === 'play') return s.order[s.pending === null ? s.turn : other(s.turn)]
    if (s.phase === 'reveal') return s.order[revealTurn(s)!]
    return null
  },

  apply(s, by, move) {
    const me = s.order.indexOf(by)
    if (me < 0 || typeof move !== 'object' || move === null || pirates.turnOf(s) !== by) return null
    if (s.phase === 'setup' && move.kind === 'commit') {
      if (typeof move.hash !== 'string' || !/^[0-9a-f]{14}$/.test(move.hash)) return null
      const commits = s.commits.map((c, p) => (p === me ? move.hash : c))
      return { ...s, commits, phase: commits.every(Boolean) ? 'play' : 'setup' }
    }
    if (s.phase === 'play' && move.kind === 'shot' && s.pending === null) {
      const target = other(me)
      if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell >= N * N || s.shots[target].some((sh) => sh.cell === move.cell)) return null
      return { ...s, pending: move.cell }
    }
    if (s.phase === 'play' && move.kind === 'answer' && s.pending !== null) {
      // 답하는 사람(me)은 맞은 쪽. 답이 앞뒤가 맞는지만 본다(진짜인지는 끝나고 공개할 때 확인한다)
      const cell = s.pending
      const hits = [...s.shots[me].filter((sh) => sh.hit).map((sh) => sh.cell), ...(move.hit ? [cell] : [])]
      let sunkShip: number[] | null = null
      if (move.sunk !== null && move.sunk !== undefined) {
        const ship = Array.isArray(move.sunk) ? [...new Set(move.sunk)].sort((a, b) => a - b) : []
        const sizesLeft = [...SHIPS]
        for (const done of s.sunk[me]) sizesLeft.splice(sizesLeft.indexOf(done.length), 1)
        if (!move.hit || !ship.includes(cell) || !sizesLeft.includes(ship.length) || !ship.every((c) => hits.includes(c))) return null
        if (s.sunk[me].some((d) => d.some((c) => ship.includes(c)))) return null
        sunkShip = ship
      }
      const shots = s.shots.map((list, p) => (p === me ? [...list, { cell, hit: !!move.hit }] : list))
      const sunk = s.sunk.map((list, p) => (p === me && sunkShip ? [...list, sunkShip] : list))
      const next: State = { ...s, shots, sunk, pending: null, turn: me }
      // 배가 모두 가라앉았거나, 더 쏠 칸이 없으면(누군가 거짓으로 답했다) 공개로 넘어간다
      if (sunk[me].length === SHIPS.length) return { ...next, phase: 'reveal', sinker: other(me) }
      if (shots[me].length >= N * N) return { ...next, phase: 'reveal', sinker: null }
      return next
    }
    if (s.phase === 'reveal' && move.kind === 'reveal') {
      const reveals = s.reveals.map((r, p) => (p === me ? { fleet: move.fleet, salt: move.salt, verified: checkReveal(s, me, move.fleet, move.salt) } : r))
      return finishReveal({ ...s, reveals })
    }
    return null
  },

  skip(s) {
    if (s.phase === 'play' && s.pending === null) return { ...s, turn: other(s.turn) }
    if (s.phase === 'reveal') {
      // 공개하지 못하면(나갔거나 배치를 잃었다) 확인 실패로 친다
      const p = revealTurn(s)!
      const reveals = s.reveals.map((r, k) => (k === p ? { fleet: [], salt: '', verified: false } : r))
      return finishReveal({ ...s, reveals })
    }
    // 배치를 알리지 않거나 답하지 않으면 그대로 기다린다(두 번 넘기면 기권패)
    return { ...s }
  },

  eliminate(s, id) {
    const out = s.order.indexOf(id)
    if (s.phase === 'done' || out < 0) return s
    return { ...s, phase: 'done', winner: other(out) }
  },

  result: (s) => (s.phase !== 'done' ? null : { winners: s.winner === null ? [] : [s.order[s.winner]] }),

  mount(el, ctx) {
    el.innerHTML = `
      <div class="pr">
        <p class="pr-info"></p>
        <div class="pr-seas">
          <section class="pr-sea is-enemy"><h3></h3><div class="pr-grid" data-sea="enemy"></div></section>
          <section class="pr-sea is-mine"><h3>내 바다</h3><div class="pr-grid" data-sea="mine"></div></section>
        </div>
        <div class="pr-setup">
          <button class="btn" type="button" data-action="shuffle">다시 섞기</button>
          <button class="btn primary" type="button" data-action="ready">이대로 시작</button>
        </div>
        <p class="pr-note"></p>
      </div>`
    const info = el.querySelector<HTMLElement>('.pr-info')!
    const enemyTitle = el.querySelector<HTMLElement>('.is-enemy h3')!
    const enemy = el.querySelector<HTMLElement>('[data-sea=enemy]')!
    const mine = el.querySelector<HTMLElement>('[data-sea=mine]')!
    const setupBar = el.querySelector<HTMLElement>('.pr-setup')!
    const readyBtn = el.querySelector<HTMLButtonElement>('[data-action=ready]')!
    const note = el.querySelector<HTMLElement>('.pr-note')!
    const seas = el.querySelector<HTMLElement>('.pr-seas')!

    let latest: State | null = null
    let draft: Fleet = randomFleet()
    let ready = false
    let autoTimer = 0
    let sentKey = ''

    const me = () => (latest ? latest.order.indexOf(ctx.myId) : -1)
    const playing = () => me() >= 0
    const myFleet = (): { fleet: Fleet; salt: string } | null => {
      const s = latest
      if (!s || !playing()) return null
      const c = s.commits[me()]
      return c ? loadFleet(c) : null
    }

    function cellHtml(i: number, cls: string[], clickable: boolean) {
      return `<button class="${['pr-cell', ...cls].join(' ')}" type="button" data-cell="${i}" ${clickable ? '' : 'disabled'}></button>`
    }

    function draw() {
      const s = latest!
      const p = me()
      const spectator = !playing()
      const foe = spectator ? 1 : other(p)
      const own = spectator ? 0 : p
      const name = (k: number) => esc(ctx.names.get(s.order[k]) ?? '')
      const shooting = s.phase === 'play' && s.pending === null && s.turn === p
      seas.classList.toggle('is-setup', s.phase === 'setup' && !spectator && !s.commits[p])
      setupBar.hidden = spectator || s.phase !== 'setup' || !!s.commits[p]
      readyBtn.disabled = ready
      readyBtn.textContent = ready ? '상대를 기다려요' : '이대로 시작'

      // 상대 바다: 내가 쏜 결과만 보인다. 판이 끝나면 공개된 배까지
      enemyTitle.innerHTML = spectator ? `${name(foe)}의 바다` : `${name(foe)}의 바다 <small>가라앉힌 배 ${s.sunk[foe].length}/${SHIPS.length}</small>`
      const foeReveal = s.reveals[foe]?.fleet ?? []
      const foeShips = new Set(foeReveal.flat())
      const foeSunk = new Set(s.sunk[foe].flat())
      enemy.innerHTML = Array.from({ length: N * N }, (_, i) => {
        const shot = s.shots[foe].find((sh) => sh.cell === i)
        const cls = [
          shot ? (shot.hit ? 'is-hit' : 'is-miss') : '',
          foeSunk.has(i) ? 'is-sunk' : '',
          !shot && foeShips.has(i) ? 'is-ship is-revealed' : '',
          s.pending === i && s.turn === own ? 'is-pending' : '',
        ].filter(Boolean)
        return cellHtml(i, cls, shooting && !shot)
      }).join('')

      // 내 바다: 내 배와 날아온 포탄
      const fleet = s.phase === 'setup' && !s.commits[own] && !spectator ? draft : spectator ? (s.reveals[own]?.fleet ?? []) : (myFleet()?.fleet ?? [])
      const ships = new Set(fleet.flat())
      const ownSunk = new Set(s.sunk[own].flat())
      mine.innerHTML = Array.from({ length: N * N }, (_, i) => {
        const shot = s.shots[own].find((sh) => sh.cell === i)
        const cls = [ships.has(i) ? 'is-ship' : '', shot ? (shot.hit ? 'is-hit' : 'is-miss') : '', ownSunk.has(i) ? 'is-sunk' : '', s.pending === i && s.turn !== own ? 'is-pending' : ''].filter(Boolean)
        return cellHtml(i, cls, false)
      }).join('')

      const turnName = esc(ctx.names.get(pirates.turnOf(s) ?? '') ?? '')
      info.innerHTML =
        s.phase === 'setup'
          ? spectator
            ? '선장들이 배를 숨기는 중이에요.'
            : s.commits[p]
              ? '배를 숨겼어요. 상대가 숨기기를 기다려요.'
              : '내 배 4척이 아래처럼 놓였어요. 마음에 들 때까지 섞고 시작해요.'
          : s.phase === 'play'
            ? s.pending !== null
              ? '포탄이 날아가는 중…'
              : shooting
                ? '<b>내 차례</b>예요. 상대 바다의 칸을 눌러 대포를 쏴요.'
                : `${esc(ctx.names.get(s.order[s.turn]) ?? '')} 차례`
            : s.phase === 'reveal'
              ? `${turnName} 배치를 공개하는 중…`
              : '전투 끝'
      note.innerHTML =
        s.phase === 'done' && s.reveals.every(Boolean)
          ? s.order
              .map((_, k) => `${name(k)}: ${s.reveals[k]!.verified ? '처음 숨긴 배치와 같아요 ✓' : '<b class="pr-bad">배치나 답이 맞지 않아요!</b>'}`)
              .join('<br>')
          : s.phase === 'play' || s.phase === 'setup'
            ? '배치는 각자 브라우저에만 있어요. 끝나면 서로 공개해서 거짓 답이 없었는지 확인해요.'
            : ''
    }

    /** 내가 할 일을 저절로 한다: 배치 알리기, 포탄에 답하기, 끝나고 공개하기 */
    function autoPlay() {
      const s = latest
      if (!s || !playing() || pirates.turnOf(s) !== ctx.myId) return
      const p = me()
      const key = `${s.phase}:${s.pending}:${s.shots[p].length}:${s.commits[p]}:${s.reveals[p] ? 1 : 0}`
      if (key === sentKey) return
      let move: Move | null = null
      if (s.phase === 'setup' && ready && !s.commits[p]) {
        const salt = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('')
        const hash = commitOf(draft, salt)
        saveFleet(hash, { fleet: draft, salt })
        move = { kind: 'commit', hash }
      } else if (s.phase === 'play' && s.pending !== null) {
        const mine = myFleet()
        if (!mine) return // 배치를 잃었다(다른 브라우저에서 이어 함). 답하지 못하고 시간이 지나면 기권패
        const hitsBefore = s.shots[p].filter((sh) => sh.hit).map((sh) => sh.cell)
        move = { kind: 'answer', ...answerFor(mine.fleet, hitsBefore, s.pending) }
      } else if (s.phase === 'reveal') {
        const mine = myFleet()
        if (!mine) return
        move = { kind: 'reveal', fleet: mine.fleet, salt: mine.salt }
      }
      if (!move) return
      sentKey = key
      ctx.play(move)
    }

    const onClick = (e: Event) => {
      const s = latest
      if (!s) return
      const t = e.target as HTMLElement
      if (t.closest('[data-action=shuffle]') && !ready) {
        draft = randomFleet()
        draw()
        return
      }
      if (t.closest('[data-action=ready]') && !ready) {
        ready = true
        draw()
        scheduleAuto()
        return
      }
      const cell = t.closest<HTMLButtonElement>('[data-sea=enemy] [data-cell]')
      if (cell && !cell.disabled && s.phase === 'play' && s.pending === null && s.turn === me()) ctx.play({ kind: 'shot', cell: Number(cell.dataset.cell) })
    }
    el.addEventListener('click', onClick)

    // 화면을 그리는 도중에 수를 보내면 그 수가 곧바로 다시 화면을 그리게 되므로 한 박자 뒤에 보낸다
    // 게임 화면은 0.25초마다 다시 그리므로, 이미 잡아 둔 타이머는 새로 잡지 않는다(그러지 않으면 영영 안 보낸다)
    function scheduleAuto() {
      if (autoTimer) return
      autoTimer = window.setTimeout(() => {
        autoTimer = 0
        autoPlay()
      }, 350)
    }

    return {
      render(s) {
        const prev = latest
        if (prev && playing()) {
          const p = me()
          const foe = other(p)
          if (s.shots[foe].length > prev.shots[foe].length) (s.shots[foe].at(-1)!.hit ? sfx.boom : sfx.fall)()
          if (s.shots[p].length > prev.shots[p].length && s.shots[p].at(-1)!.hit) sfx.boom()
        }
        // 이미 배치를 알렸으면(새로고침) 준비된 상태로 본다
        if (playing() && s.commits[s.order.indexOf(ctx.myId)]) ready = true
        latest = s
        draw()
        scheduleAuto()
      },
      destroy() {
        clearTimeout(autoTimer)
        el.removeEventListener('click', onClick)
        el.innerHTML = ''
      },
    }
  },
}

// 배치는 이 탭에만 저장해, 새로고침해도 이어서 답할 수 있게 한다. 지문으로 찾는다
const fleets = new Map<string, { fleet: Fleet; salt: string }>()
export function saveFleet(hash: string, value: { fleet: Fleet; salt: string }) {
  fleets.set(hash, value)
  try {
    sessionStorage.setItem(`mgh.fleet:${hash}`, JSON.stringify(value))
  } catch {
    // 저장이 막혀 있으면 메모리에만 둔다(새로고침하면 답할 수 없다)
  }
}
export function loadFleet(hash: string): { fleet: Fleet; salt: string } | null {
  if (fleets.has(hash)) return fleets.get(hash)!
  try {
    const raw = sessionStorage.getItem(`mgh.fleet:${hash}`)
    if (raw) {
      const v = JSON.parse(raw)
      fleets.set(hash, v)
      return v
    }
  } catch {
    // 위와 같다
  }
  return null
}
export { commitOf }
