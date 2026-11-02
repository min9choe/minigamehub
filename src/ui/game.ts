// 게임 화면 공통 틀(기획안 7장): 위쪽에 참가자·턴·남은 시간과 기권, 가운데 게임, 그 위에 대기·카운트다운·결과를 띄운다.
import { leaveRoom } from '../app'
import { findGame } from '../games/catalog'
import { displayNames, getPlayerId } from '../identity'
import type { RoomHandle, RoomView } from '../room'
import { go } from '../router'
import { $, esc } from './dom'

const secondsLeft = (until: number | null) => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0)

export function renderGame(root: HTMLElement, room: RoomHandle) {
  const { info } = room
  const game = findGame(info.gameId)!
  const def = game.def!
  const me = getPlayerId()
  const names = displayNames(info.players)
  const name = (id: string) => esc(names.get(id) ?? '?')

  root.innerHTML = `
    <div class="game-screen">
      <header class="game-top">
        <div class="game-title">
          <strong>${esc(game.name)}</strong>
          <span class="clock"></span>
        </div>
        <button class="btn ghost danger" type="button" data-action="forfeit" hidden>기권</button>
      </header>
      <ul class="seats"></ul>
      <div class="game-notice" hidden></div>
      <main class="board locked"></main>
      <div class="overlay" hidden></div>
    </div>
  `
  const clock = $(root, '.clock')
  const seats = $(root, '.seats')
  const notice = $(root, '.game-notice')
  const board = $(root, '.board')
  const overlay = $(root, '.overlay')
  const forfeitBtn = $<HTMLButtonElement>(root, '[data-action=forfeit]')

  const gameView = def.mount(board, { myId: me, names, play: (m) => room.play(m) })
  let overlayKey = ''

  // 0.25초마다 다시 그리므로, 내용이 같으면 건드리지 않아야 누르던 버튼이 사라지지 않는다
  const lastHtml = new Map<HTMLElement, string>()
  function setHtml(el: HTMLElement, html: string) {
    if (lastHtml.get(el) === html) return
    lastHtml.set(el, html)
    el.innerHTML = html
  }

  function update() {
    const v = room.view()
    if (v.phase === 'closed') return
    const turn = v.state !== null && v.phase === 'playing' ? def.turnOf(v.state) : null
    const iPlay = v.order.includes(me)
    const iAmOut = v.forfeited.has(me)

    if (v.state !== null) gameView.render(v.state)
    board.classList.toggle('locked', v.phase !== 'playing' || turn !== me)
    forfeitBtn.hidden = !(iPlay && !iAmOut && (v.phase === 'countdown' || v.phase === 'playing'))

    const ids = v.order.length ? v.order : info.players.map((p) => p.id)
    setHtml(seats, ids
      .map((id) => {
        const away = v.away.get(id)
        const badge = v.forfeited.has(id)
          ? '기권'
          : away
            ? `연결 끊김 ${secondsLeft(away)}초`
            : id === turn
              ? '차례'
              : !v.present.has(id) && v.phase === 'waiting'
                ? '입장 중'
                : ''
        const cls = [id === turn && 'is-turn', id === me && 'is-me', v.forfeited.has(id) && 'is-out', away && 'is-away']
          .filter(Boolean)
          .join(' ')
        return `<li class="${cls}"><span>${name(id)}</span>${badge ? `<small>${badge}</small>` : ''}</li>`
      })
      .join(''))

    clock.textContent =
      v.phase === 'playing' && v.deadline
        ? `${turn === me ? '내 차례' : `${names.get(turn ?? '') ?? ''} 차례`} · ${secondsLeft(v.deadline)}초`
        : ''

    const spectating = !iPlay && v.phase === 'playing'
    notice.hidden = !(iAmOut || spectating) || v.phase === 'result'
    if (!notice.hidden) {
      setHtml(notice, `${iAmOut ? '기권했어요.' : '이번 판은 관전 중이에요.'} <button class="btn" type="button" data-action="lobby">로비로</button>`)
    }

    renderOverlay(v)
  }

  function renderOverlay(v: RoomView) {
    const here = info.players.filter((p) => v.present.has(p.id)).length
    const key = [v.phase, v.round, v.rematch.size, here, v.phase === 'countdown' ? secondsLeft(v.countdownEnd) : ''].join('|')
    if (key === overlayKey) return
    overlayKey = key

    overlay.hidden = v.phase === 'playing'
    if (v.phase === 'waiting') {
      overlay.innerHTML = `
        <div class="overlay-card">
          <h2>상대를 찾았어요</h2>
          <p>모두 들어오기를 기다리는 중… (${here}/${info.players.length})</p>
          <button class="btn ghost" type="button" data-action="lobby">나가기</button>
        </div>`
    } else if (v.phase === 'countdown') {
      overlay.innerHTML = `
        <div class="overlay-card">
          <p>곧 시작해요</p>
          <div class="countdown">${secondsLeft(v.countdownEnd)}</div>
        </div>`
    } else if (v.phase === 'result' && v.result) {
      const winners = v.result.winners
      const title = winners.length === 0 ? '무승부' : winners.includes(me) ? '승리!' : v.order.includes(me) ? '패배' : '경기 종료'
      const sub = winners.length ? `${winners.map(name).join(', ')} 승리` : '승부가 나지 않았어요'
      const voted = v.rematch.has(me)
      const canRematch = here >= game.min
      const votes = info.players.filter((p) => v.present.has(p.id) && v.rematch.has(p.id)).length
      overlay.innerHTML = `
        <div class="overlay-card">
          <h2 class="result-title${winners.includes(me) ? ' is-win' : ''}">${title}</h2>
          <p>${sub}</p>
          <div class="overlay-actions">
            <button class="btn primary" type="button" data-action="rematch" ${voted || !canRematch ? 'disabled' : ''}>
              ${canRematch ? `다시 하기 ${votes}/${here}` : '상대가 나갔어요'}
            </button>
            <button class="btn" type="button" data-action="lobby">로비로</button>
          </div>
        </div>`
    }
  }

  async function onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!btn || btn.disabled) return
    switch (btn.dataset.action) {
      case 'forfeit':
        if (confirm('기권할까요? 이번 판은 패배로 처리돼요.')) room.forfeit()
        break
      case 'rematch':
        btn.disabled = true
        room.requestRematch()
        break
      case 'lobby':
        btn.disabled = true
        await leaveRoom()
        go('/lobby')
        break
    }
  }

  root.addEventListener('click', onClick)
  const unsubscribe = room.subscribe(update)
  const ticker = window.setInterval(update, 250) // 남은 시간과 카운트다운 숫자
  update()

  return () => {
    clearInterval(ticker)
    unsubscribe()
    root.removeEventListener('click', onClick)
    gameView.destroy()
  }
}
