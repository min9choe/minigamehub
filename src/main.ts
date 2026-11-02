import './style.css'
import { currentRoom, leaveRoom, stopLobby } from './app'
import { closeAll } from './net/realtime'
import { currentRoute, go } from './router'
import { renderEntry } from './ui/entry'
import { renderGame } from './ui/game'
import { renderLobby } from './ui/lobby'

const root = document.querySelector<HTMLElement>('#app')!
let cleanup: () => void = () => {}

function render() {
  cleanup() // 화면을 떠날 때 그 화면의 구독을 정리한다
  cleanup = () => {}
  const route = currentRoute()
  switch (route.path) {
    case '/game': {
      const room = currentRoom()
      if (room) cleanup = renderGame(root, room)
      else go('/lobby')
      break
    }
    case '/lobby':
      // 게임 화면에서 뒤로 가기로 나왔으면 방에서도 나간다
      void leaveRoom()
      cleanup = renderLobby(root)
      break
    default:
      stopLobby()
      cleanup = renderEntry(root, route)
  }
}

window.addEventListener('hashchange', render)
// 모바일 브라우저는 beforeunload를 잘 부르지 않으므로 pagehide를 쓴다(기획안 10-6)
window.addEventListener('pagehide', closeAll)
// 뒤로 가기 캐시에서 페이지가 되살아나면 닫았던 채널을 다시 연다
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload()
})
render()
