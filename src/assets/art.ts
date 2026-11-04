// 힉스필드로 만든 게임 그래픽(로비 카드, 입장 화면, 판 질감, 포트리스 배경). 빌드할 때 경로에 해시가 붙는다.
import boardWood from './img/board-wood.webp'
import cardAlkkagi from './img/card-alkkagi.webp'
import cardFortress from './img/card-fortress.webp'
import cardOmok from './img/card-omok.webp'
import cardTerritory from './img/card-territory.webp'
import cardTictactoe from './img/card-tictactoe.webp'
import fortressSky from './img/fortress-sky.webp'
import fortressSoil from './img/fortress-soil.webp'
import groundSand from './img/ground-sand.webp'
import hero from './img/hero.webp'
import cardCurling from './img/card-curling.webp'
import cardDots from './img/card-dots.webp'
import cardReversi from './img/card-reversi.webp'
import cardYut from './img/card-yut.webp'
import ice from './img/ice.webp'
import yutBoard from './img/yut-board.webp'

export const art = { boardWood, groundSand, fortressSky, fortressSoil, hero, ice, yutBoard }

export const cardArt: Record<string, string> = {
  tictactoe: cardTictactoe,
  omok: cardOmok,
  alkkagi: cardAlkkagi,
  territory: cardTerritory,
  fortress: cardFortress,
  reversi: cardReversi,
  dots: cardDots,
  curling: cardCurling,
  yut: cardYut,
}

const cache = new Map<string, HTMLImageElement>()

/**
 * 캔버스에 그릴 이미지를 한 번만 불러온다. 아직 안 왔으면 null을 돌려주고, 다 오면 onReady로 다시 그리게 한다.
 * 이미지가 없을 때도 게임은 단색으로 그대로 그려진다.
 */
export function image(url: string, onReady: () => void): HTMLImageElement | null {
  let img = cache.get(url)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = url
    cache.set(url, img)
  }
  if (img.complete && img.naturalWidth > 0) return img
  img.addEventListener('load', onReady, { once: true })
  return null
}
