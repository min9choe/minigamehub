// 로비 카드에 보여 줄 게임 목록(기획안 3장 정원 표). 게임 로직은 단계별로 games/<id>/ 폴더에 추가한다.

export type GameInfo = {
  id: string
  name: string
  summary: string
  min: number
  max: number
  /** 아직 만들지 않은 게임은 카드만 보이고 줄을 설 수 없다 */
  ready: boolean
}

export const GAMES: GameInfo[] = [
  { id: 'tictactoe', name: '틱택토', summary: '3×3 판, 한 줄 먼저 잇기. 3판 2선승', min: 2, max: 2, ready: false },
  { id: 'omok', name: '오목', summary: '15×15 판, 다섯 개 먼저 잇기. 흑 3-3 금지', min: 2, max: 2, ready: false },
  { id: 'alkkagi', name: '알까기', summary: '돌을 튕겨 상대 돌을 판 밖으로', min: 2, max: 2, ready: false },
  { id: 'territory', name: '땅따먹기', summary: '세 번 튕겨 집으로 돌아와 땅 넓히기', min: 2, max: 4, ready: false },
  { id: 'fortress', name: '포트리스', summary: '각도와 파워로 포탄을 쏘는 탱크 개인전', min: 2, max: 4, ready: false },
]

export function capacityLabel(g: GameInfo) {
  return g.min === g.max ? `${g.max}명` : `${g.min}~${g.max}명`
}
