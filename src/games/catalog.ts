// 로비 카드에 보여 줄 게임 목록(기획안 3장 정원 표). 게임 로직은 단계별로 games/<id>/ 폴더에 추가하고 def에 연결한다.
import { alkkagi } from './alkkagi'
import { baseball } from './baseball'
import { baseballBot } from './baseball/bot'
import { curling } from './curling'
import { dots } from './dots'
import { dotsBot } from './dots/bot'
import { fortress } from './fortress'
import { omok } from './omok'
import { omokBot } from './omok/bot'
import { reversi } from './reversi'
import { reversiBot } from './reversi/bot'
import { territory } from './territory'
import { tictactoe } from './tictactoe'
import { tictactoeBot } from './tictactoe/bot'
import { yut } from './yut'
import { yutBot } from './yut/bot'
import type { GameDef } from './types'

export type GameInfo = {
  id: string
  name: string
  summary: string
  min: number
  max: number
  /** 아직 만들지 않은 게임은 def가 없고, 카드만 보이며 줄을 설 수 없다 */
  def?: GameDef<any, any>
  /** 혼자서 연습할 때 상대가 되는 봇(기획안 3장 연습 모드) */
  bot?: (state: any, botId: string) => unknown
}

export const GAMES: GameInfo[] = [
  { id: 'tictactoe', name: '틱택토', summary: '3×3 판, 한 줄 먼저 잇기. 3판 2선승', min: 2, max: 2, def: tictactoe, bot: tictactoeBot },
  { id: 'omok', name: '오목', summary: '15×15 판, 다섯 개 먼저 잇기. 흑 3-3 금지', min: 2, max: 2, def: omok, bot: omokBot },
  { id: 'alkkagi', name: '알까기', summary: '돌을 튕겨 상대 돌을 판 밖으로', min: 2, max: 2, def: alkkagi },
  { id: 'territory', name: '땅따먹기', summary: '세 번 튕겨 집으로 돌아와 땅 넓히기', min: 2, max: 4, def: territory },
  { id: 'fortress', name: '포트리스', summary: '각도와 파워로 포탄을 쏘는 탱크 개인전', min: 2, max: 4, def: fortress },
  { id: 'yut', name: '윷놀이', summary: '윷을 던져 말을 모두 먼저 완주. 업고 잡고 지름길로', min: 2, max: 4, def: yut, bot: yutBot },
  { id: 'reversi', name: '리버시', summary: '끼운 돌을 뒤집어 판을 더 많이 차지하기', min: 2, max: 2, def: reversi, bot: reversiBot },
  { id: 'dots', name: '점 잇기', summary: '선을 그어 상자를 닫으면 내 것, 한 번 더', min: 2, max: 4, def: dots, bot: dotsBot },
  { id: 'curling', name: '컬링', summary: '얼음 위로 돌을 밀어 과녁 가운데에 가깝게', min: 2, max: 2, def: curling },
  { id: 'baseball', name: '숫자 야구', summary: '아무도 모르는 4자리를 번갈아 불러 먼저 맞히기', min: 2, max: 2, def: baseball, bot: baseballBot },
]

export function findGame(id: string) {
  return GAMES.find((g) => g.id === id)
}

export function capacityLabel(g: GameInfo) {
  return g.min === g.max ? `${g.max}명` : `${g.min}~${g.max}명`
}
