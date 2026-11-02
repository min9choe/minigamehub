// 로비 화면: 접속 인원, 게임 카드와 줄서기, 대기 바, 접속자 목록(기획안 7장).
import { getLobby, takeNotice } from '../app'
import { GAMES, capacityLabel, findGame } from '../games/catalog'
import { displayNames, getPlayerId, loadProfile } from '../identity'
import { isConfigured, type ChannelStatus } from '../net/realtime'
import { go } from '../router'
import { $, esc } from './dom'

const STATUS_TEXT: Record<ChannelStatus, string> = {
  connecting: '연결 중',
  connected: '연결됨',
  error: '연결 실패',
  closed: '연결 끊김',
}

/** 상태 변경 한도(30초에 5회) 때문에 줄서기·취소 버튼은 누른 뒤 잠시 막는다(기획안 10-4) */
const BUTTON_COOLDOWN = 2_000

export function renderLobby(root: HTMLElement) {
  const profile = loadProfile()
  if (!profile) {
    go('/')
    return () => {}
  }
  const myId = getPlayerId()

  root.innerHTML = `
    <div class="lobby">
      <header class="topbar">
        <div class="me">
          <strong class="my-nick">${esc(profile.nick)}</strong>
          <span class="lobby-name">${profile.code ? `로비 코드 <b>${esc(profile.code)}</b>` : '공용 로비'}</span>
        </div>
        <div class="online">
          <span class="status" data-status="connecting"><i></i><span class="status-text">연결 중</span></span>
          <span class="count">접속 <b>1</b>명 · 진행 중 <b class="rooms">0</b>판</span>
        </div>
      </header>
      <div class="banner" role="status" hidden></div>
      <main>
        <section class="games" aria-label="게임">
          ${GAMES.map(
            (g) => `
            <article class="game card${g.test ? ' is-test' : ''}" data-game="${g.id}">
              <div class="game-head">
                <h3>${esc(g.name)}${g.test ? ' <span class="tag">테스트</span>' : ''}</h3>
                <span class="cap">${capacityLabel(g)}</span>
              </div>
              <p>${esc(g.summary)}</p>
              <div class="game-foot">
                <span class="waiting">대기 <b>0</b>/${g.max}</span>
                <button class="btn" type="button" data-action="queue" disabled>${g.def ? '줄서기' : '준비 중'}</button>
              </div>
            </article>`
          ).join('')}
        </section>
        <section class="players card">
          <h2>지금 로비에 있는 사람</h2>
          <ul class="player-list"><li class="is-me">${esc(profile.nick)}</li></ul>
        </section>
      </main>
      <footer class="bottombar">
        <div class="queue-bar" hidden>
          <span class="queue-text"></span>
          <button class="btn" type="button" data-action="cancel">취소</button>
        </div>
        <button class="btn ghost" type="button" data-action="leave">닉네임·로비 바꾸기</button>
      </footer>
    </div>
  `

  const banner = $(root, '.banner')
  let cooldownUntil = 0

  function showBanner(text: string | null) {
    banner.hidden = !text
    banner.textContent = text ?? ''
  }

  if (!isConfigured) {
    showBanner(
      'Supabase 연결 정보가 없어요. .env.example을 .env.local로 복사해 URL과 publishable 키를 넣고 개발 서버를 다시 켜 주세요.'
    )
    setStatus('error')
    $(root, '[data-action=leave]').addEventListener('click', () => go('/'))
    return () => {}
  }

  const lobby = getLobby()!
  const notice = takeNotice()
  if (notice) showBanner(notice)

  function setStatus(status: ChannelStatus) {
    const el = $(root, '.status')
    el.dataset.status = status
    $(el, '.status-text').textContent = STATUS_TEXT[status]
  }

  function update() {
    const status = lobby.status()
    setStatus(status)
    if (status === 'error') {
      showBanner(
        '실시간 서버에 연결하지 못했어요. 회사 네트워크라면 WebSocket이 막혀 있을 수 있어요(기획안 6장). 자동으로 다시 시도합니다.'
      )
    }

    const players = lobby.players()
    const names = displayNames(players)
    const mine = lobby.mine()
    $(root, '.my-nick').textContent = names.get(myId) ?? profile!.nick
    $(root, '.count b').textContent = String(players.length)
    $(root, '.rooms').textContent = String(lobby.roomsInProgress())

    const cooling = Date.now() < cooldownUntil
    for (const g of GAMES) {
      const card = $(root, `[data-game="${g.id}"]`)
      const waiting = lobby.queueOf(g.id).length
      $(card, '.waiting b').textContent = String(waiting)
      const btn = $<HTMLButtonElement>(card, '[data-action=queue]')
      if (!g.def) continue
      const inThis = mine.game === g.id
      btn.textContent = inThis ? '취소' : '줄서기'
      btn.classList.toggle('primary', !inThis)
      btn.disabled = cooling || status !== 'connected' || !!mine.room
      card.classList.toggle('is-queued', inThis)
    }

    // 대기 바: '오목 대기 중 1/2 [취소]'
    const bar = $(root, '.queue-bar')
    const game = mine.game ? findGame(mine.game) : undefined
    bar.hidden = !game
    if (game) {
      const n = lobby.queueOf(game.id).length
      const soon = game.min < game.max && n >= game.min ? ' · 곧 시작해요' : ''
      $(bar, '.queue-text').textContent = `${game.name} 대기 중 ${n}/${game.max}${soon}`
      $<HTMLButtonElement>(bar, '[data-action=cancel]').disabled = cooling
    }

    const sorted = [...players].sort((a, b) =>
      a.id === myId ? -1 : b.id === myId ? 1 : a.nick.localeCompare(b.nick, 'ko')
    )
    $(root, '.player-list').innerHTML = sorted
      .map((p) => {
        const where = p.room ? '게임 중' : p.game ? `${findGame(p.game)?.name ?? ''} 대기` : ''
        return `<li${p.id === myId ? ' class="is-me"' : ''}>${esc(names.get(p.id)!)}${
          where ? ` <small>${esc(where)}</small>` : ''
        }</li>`
      })
      .join('')
  }

  let cooldownTimer = 0
  function cooldown() {
    cooldownUntil = Date.now() + BUTTON_COOLDOWN
    clearTimeout(cooldownTimer)
    cooldownTimer = window.setTimeout(update, BUTTON_COOLDOWN + 50)
  }

  root.addEventListener('click', onClick)
  function onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')
    if (!btn || btn.disabled) return
    switch (btn.dataset.action) {
      case 'queue': {
        const id = btn.closest<HTMLElement>('[data-game]')!.dataset.game!
        cooldown()
        if (lobby.mine().game === id) lobby.leaveQueue()
        else lobby.joinQueue(id)
        break
      }
      case 'cancel':
        cooldown()
        lobby.leaveQueue()
        break
      case 'leave':
        go('/')
        break
    }
  }

  const unsubscribe = lobby.subscribe(update)
  update()
  return () => {
    clearTimeout(cooldownTimer) // 줄서기 직후 매칭되어 화면이 바뀌면 남은 갱신을 취소한다
    unsubscribe()
    root.removeEventListener('click', onClick)
  }
}
