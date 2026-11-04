// 입장 화면: 닉네임과 로비 코드(선택)를 정한다(기획안 7장).
import { queueOnConnect } from '../app'
import { art } from '../assets/art'
import { findGame } from '../games/catalog'
import { CODE_MAX, NICK_MAX, cleanNick, loadProfile, normalizeCode, saveProfile, validateNick } from '../identity'
import { go, type Route } from '../router'
import { $, esc } from './dom'

export function renderEntry(root: HTMLElement, route: Route) {
  const saved = loadProfile()
  // 초대 링크(#/?code=xxx&game=yyy)로 들어오면 코드를 미리 채우고, 입장하면 그 게임 줄에 바로 선다
  const code = normalizeCode(route.params.get('code') ?? saved?.code ?? '')
  const invited = findGame(route.params.get('game') ?? '')
  const invitedGame = invited?.def ? invited : undefined

  root.innerHTML = `
    <main class="entry">
      <img class="entry-hero" src="${art.hero}" alt="" decoding="async" />
      <h1 class="brand">미니 게임 허브</h1>
      <p class="tagline">링크만 열면 바로 한 판. 줄을 서면 정원이 찰 때 자동으로 시작해요.</p>
      ${invitedGame ? `<p class="invite-note card"><b>${esc(invitedGame.name)}</b> 초대를 받았어요. 닉네임을 정하고 입장하면 바로 시작해요.</p>` : ''}
      <form class="card entry-form" novalidate>
        <label class="field">
          <span>닉네임</span>
          <input name="nick" autocomplete="nickname" maxlength="${NICK_MAX + 4}"
            placeholder="2~${NICK_MAX}자" value="${esc(saved?.nick ?? '')}" required />
        </label>
        <label class="field">
          <span>로비 코드 <small>선택</small></span>
          <input name="code" autocomplete="off" autocapitalize="off" maxlength="${CODE_MAX}"
            placeholder="비우면 공용 로비" value="${esc(code)}" />
          <small class="hint">같은 코드를 입력한 사람끼리만 한 로비에 모여요. 비밀번호는 아니에요.</small>
        </label>
        <p class="error" role="alert" hidden></p>
        <button class="btn primary" type="submit">입장</button>
      </form>
    </main>
  `

  const form = $<HTMLFormElement>(root, 'form')
  const nickInput = $<HTMLInputElement>(form, '[name=nick]')
  const codeInput = $<HTMLInputElement>(form, '[name=code]')
  const error = $(form, '.error')
  if (!nickInput.value) nickInput.focus()

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const nick = cleanNick(nickInput.value)
    const problem = validateNick(nick)
    if (problem) {
      error.textContent = problem
      error.hidden = false
      nickInput.focus()
      return
    }
    const finalCode = normalizeCode(codeInput.value)
    saveProfile({ nick, code: finalCode })
    // 초대 코드를 그대로 두고 들어왔을 때만 그 게임 줄에 자동으로 선다
    queueOnConnect(invitedGame && finalCode === code ? invitedGame.id : null)
    go('/lobby')
  })

  return () => {}
}
