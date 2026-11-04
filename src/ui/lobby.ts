// 로비 화면: 접속 인원, 게임 카드와 줄서기, 대기 바, 접속자 목록(기획안 7장).
import { closeInvite, currentInvite, getLobby, makeInvite, startPractice, takeNotice, takePendingQueue } from '../app'
import { cardArt } from '../assets/art'
import { GAMES, capacityLabel, findGame } from '../games/catalog'
import { displayNames, getPlayerId, loadProfile } from '../identity'
import { isConfigured, type ChannelStatus } from '../net/realtime'
import { go, refresh } from '../router'
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
      <section class="invite card" hidden>
        <p class="invite-text"></p>
        <div class="invite-link">
          <input type="text" readonly aria-label="초대 링크" />
          <button class="btn primary" type="button" data-action="copy-invite">복사</button>
        </div>
        <div class="invite-actions">
          <button class="btn" type="button" data-action="share-invite" hidden>공유하기</button>
          <button class="btn ghost" type="button" data-action="close-invite">닫기</button>
        </div>
      </section>
      <main>
        <section class="games" aria-label="게임">
          ${GAMES.map(
            (g) => `
            <article class="game card" data-game="${g.id}">
              ${cardArt[g.id] ? `<img class="game-art" src="${cardArt[g.id]}" alt="" loading="lazy" decoding="async" />` : ''}
              <div class="game-head">
                <h3>${esc(g.name)}</h3>
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
        <div class="bottom-actions">
          <button class="btn" type="button" data-action="open-invite">친구 초대 링크</button>
          <button class="btn" type="button" data-action="open-practice">봇과 연습</button>
          <button class="btn ghost" type="button" data-action="leave">닉네임·로비 바꾸기</button>
        </div>
      </footer>
      <div class="sheet" hidden>
        <div class="sheet-card" role="dialog" aria-modal="true">
          <h2 class="sheet-title"></h2>
          <p class="sheet-desc"></p>
          <div class="sheet-list"></div>
          <button class="btn ghost" type="button" data-action="close-sheet">닫기</button>
        </div>
      </div>
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

    // 초대한 사람·초대 링크로 들어온 사람은 연결되자마자 그 게임 줄에 선다
    if (status === 'connected' && !mine.room) {
      const auto = takePendingQueue()
      if (auto && mine.game !== auto) lobby.joinQueue(auto)
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
    if (e.target === sheet) sheet.hidden = true // 바깥을 누르면 닫는다
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
      case 'open-invite':
        openSheet(
          '친구 초대 링크',
          '어떤 게임으로 초대할까요? 링크를 받은 친구가 들어오면 줄 없이 바로 시작해요.',
          GAMES.filter((g) => g.def),
          'invite'
        )
        break
      case 'open-practice':
        openSheet('봇과 연습', '혼자서 봇과 둬요. 줄을 서 있었다면 연습하는 동안에도 매칭될 수 있어요.', GAMES.filter((g) => g.bot), 'practice')
        break
      case 'close-sheet':
        sheet.hidden = true
        break
      case 'pick': {
        sheet.hidden = true
        const id = btn.dataset.game!
        if (btn.dataset.kind === 'practice') startPractice(id)
        else if (makeInvite(id)) refresh() // 초대 전용 로비로 옮겨 간다
        break
      }
      case 'copy-invite':
        void copyInvite(btn)
        break
      case 'share-invite': {
        const inv = currentInvite()
        if (inv) void navigator.share?.({ title: '미니 게임 허브', text: `${findGame(inv.gameId)?.name} 한 판 해요!`, url: inv.link }).catch(() => {})
        break
      }
      case 'close-invite':
        closeInvite()
        showInvite()
        break
    }
  }

  const sheet = $(root, '.sheet')
  function openSheet(title: string, desc: string, games: typeof GAMES, kind: 'invite' | 'practice') {
    $(sheet, '.sheet-title').textContent = title
    $(sheet, '.sheet-desc').textContent = desc
    $(sheet, '.sheet-list').innerHTML = games
      .map(
        (g) => `<button class="btn" type="button" data-action="pick" data-kind="${kind}" data-game="${g.id}">
          ${esc(g.name)} <small>${capacityLabel(g)}</small></button>`
      )
      .join('')
    sheet.hidden = false
  }

  // 초대 링크 안내: 초대로 만든 로비에 있는 동안 보인다
  const invitePanel = $(root, '.invite')
  function showInvite() {
    const inv = currentInvite()
    invitePanel.hidden = !inv
    if (!inv) return
    const game = findGame(inv.gameId)!
    $(invitePanel, '.invite-text').textContent = `${game.name} 초대 링크를 만들었어요. 친구에게 보내면 링크로 들어온 사람과 바로 시작해요(${capacityLabel(game)}).`
    $<HTMLInputElement>(invitePanel, 'input').value = inv.link
    $(invitePanel, '[data-action=share-invite]').hidden = typeof navigator.share !== 'function'
  }

  async function copyInvite(btn: HTMLButtonElement) {
    const input = $<HTMLInputElement>(invitePanel, 'input')
    try {
      await navigator.clipboard.writeText(input.value)
      btn.textContent = '복사됨'
    } catch {
      // 클립보드를 쓸 수 없으면 링크를 선택해 두어 직접 복사하게 한다
      input.select()
      btn.textContent = '길게 눌러 복사'
    }
    setTimeout(() => (btn.textContent = '복사'), 2000)
  }
  showInvite()

  const unsubscribe = lobby.subscribe(update)
  update()
  return () => {
    clearTimeout(cooldownTimer) // 줄서기 직후 매칭되어 화면이 바뀌면 남은 갱신을 취소한다
    unsubscribe()
    root.removeEventListener('click', onClick)
  }
}
