// 로비 화면: 접속 인원, 게임 카드 5개, 접속자 목록(기획안 7장). 줄서기는 2단계에서 붙인다.
import { GAMES, capacityLabel } from '../games/catalog'
import { displayNames, getPlayerId, loadProfile } from '../identity'
import { joinLobby, type LobbyPlayer } from '../lobby'
import { isConfigured, type ChannelStatus } from '../net/realtime'
import { go } from '../router'
import { $, esc } from './dom'

const STATUS_TEXT: Record<ChannelStatus, string> = {
  connecting: '연결 중',
  connected: '연결됨',
  error: '연결 실패',
  closed: '연결 끊김',
}

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
          <strong class="my-nick"></strong>
          <span class="lobby-name">${profile.code ? `로비 코드 <b>${esc(profile.code)}</b>` : '공용 로비'}</span>
        </div>
        <div class="online">
          <span class="status" data-status="connecting"><i></i><span class="status-text">연결 중</span></span>
          <span class="count">접속 <b>-</b>명</span>
        </div>
      </header>
      <div class="banner" role="status" hidden></div>
      <main>
        <section class="games" aria-label="게임"></section>
        <section class="players card">
          <h2>지금 로비에 있는 사람</h2>
          <ul class="player-list"></ul>
        </section>
      </main>
      <footer class="bottombar">
        <button class="btn ghost" type="button" data-action="leave">닉네임·로비 바꾸기</button>
      </footer>
    </div>
  `

  const statusEl = $(root, '.status')
  const banner = $(root, '.banner')

  $(root, '.games').innerHTML = GAMES.map(
    (g) => `
      <article class="game card" data-game="${g.id}">
        <div class="game-head">
          <h3>${esc(g.name)}</h3>
          <span class="cap">${capacityLabel(g)}</span>
        </div>
        <p>${esc(g.summary)}</p>
        <div class="game-foot">
          <span class="waiting">대기 <b>0</b>/${g.max}</span>
          <button class="btn" type="button" disabled>${g.ready ? '줄서기' : '준비 중'}</button>
        </div>
      </article>`
  ).join('')

  $(root, '[data-action=leave]').addEventListener('click', () => go('/'))

  function showBanner(text: string | null) {
    banner.hidden = !text
    banner.textContent = text ?? ''
  }

  function renderPlayers(players: LobbyPlayer[]) {
    const names = displayNames(players)
    $(root, '.my-nick').textContent = names.get(myId) ?? profile!.nick
    $(root, '.count b').textContent = String(players.length)
    // 나를 맨 앞에, 나머지는 닉네임 순으로
    const sorted = [...players].sort((a, b) =>
      a.id === myId ? -1 : b.id === myId ? 1 : a.nick.localeCompare(b.nick, 'ko')
    )
    $(root, '.player-list').innerHTML = sorted
      .map((p) => `<li${p.id === myId ? ' class="is-me"' : ''}>${esc(names.get(p.id)!)}</li>`)
      .join('')
  }

  function setStatus(status: ChannelStatus) {
    statusEl.dataset.status = status
    $(statusEl, '.status-text').textContent = STATUS_TEXT[status]
    if (status === 'error') {
      showBanner(
        '실시간 서버에 연결하지 못했어요. 회사 네트워크라면 WebSocket이 막혀 있을 수 있어요(기획안 6장). 자동으로 다시 시도합니다.'
      )
    } else if (status === 'connected') {
      showBanner(null)
    }
  }

  // 연결 전에도 나 자신은 보이게 한다
  renderPlayers([{ id: myId, nick: profile.nick, game: null, queuedAt: null }])

  if (!isConfigured) {
    setStatus('error')
    showBanner(
      'Supabase 연결 정보가 없어요. .env.example을 .env.local로 복사해 URL과 publishable 키를 넣고 개발 서버를 다시 켜 주세요.'
    )
    return () => {}
  }

  const lobby = joinLobby({
    nick: profile.nick,
    code: profile.code,
    onPlayers: renderPlayers,
    onStatus: setStatus,
  })
  return () => lobby.leave()
}
