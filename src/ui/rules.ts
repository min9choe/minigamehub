// 규칙서 창: 로비의 '규칙' 버튼과 게임 화면의 '규칙' 버튼이 같은 창을 연다.
import { cardArt } from '../assets/art'
import { capacityLabel, findGame } from '../games/catalog'
import { RULEBOOK } from '../games/rulebook'
import { esc } from './dom'

let dialog: HTMLDialogElement | null = null

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog
  dialog = document.createElement('dialog')
  dialog.className = 'rules'
  dialog.setAttribute('aria-labelledby', 'rules-title')
  // 바깥(배경)을 누르면 닫는다
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || (e.target as HTMLElement).closest('[data-action=close-rules]')) dialog!.close()
  })
  document.body.append(dialog)
  return dialog
}

const list = (items: string[]) => `<ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`

export function openRules(gameId: string) {
  const game = findGame(gameId)
  const book = RULEBOOK[gameId]
  if (!game || !book) return
  const d = ensureDialog()
  const art = cardArt[gameId]
  d.innerHTML = `
    <article class="rules-card">
      <header class="rules-head">
        ${art ? `<img src="${art}" alt="" />` : ''}
        <div>
          <h2 id="rules-title">${esc(game.name)} 규칙</h2>
          <p>${capacityLabel(game)}${game.def ? `, 한 차례 ${game.def.turnSeconds}초` : ''}</p>
        </div>
        <button class="btn ghost icon" type="button" data-action="close-rules" aria-label="규칙 닫기">✕</button>
      </header>
      <div class="rules-body">
        <p class="rules-goal">${esc(book.goal)}</p>
        <section><h3>내 차례에 할 일</h3>${list(book.turn)}</section>
        <section><h3>알아 둘 규칙</h3>${list(book.rules)}</section>
        <section><h3>끝나는 때</h3>${list(book.end)}</section>
        ${book.tip ? `<section class="rules-tip"><h3>요령</h3><p>${esc(book.tip)}</p></section>` : ''}
        <p class="rules-common">모든 게임 공통: 차례 시간을 넘기면 차례가 넘어가고, 두 번 연달아 넘기면 기권패예요. 연결이 끊기면 30초 동안 기다려요.</p>
      </div>
    </article>`
  if (!d.open) d.showModal()
  d.querySelector('.rules-body')!.scrollTop = 0
}
