// 공통 게임 인터페이스(기획안 5장). 게임은 규칙과 화면만 갖고, 순서·시간·접속 처리는 room.ts가 맡는다.
// 상태(S)와 수(M)는 메시지로 주고받으므로 JSON으로 바꿀 수 있는 값만 담는다.

/** winners가 비어 있으면 무승부. ranking이 있으면 결과 화면에 등수를 보여 준다(1등부터) */
export type Result = { winners: string[]; ranking?: string[] }

export interface GameContext<M> {
  myId: string
  /** 플레이어 ID → 화면에 보일 이름 */
  names: Map<string, string>
  /** 내 차례에 수를 둔다. 방장이 확인하면 모두의 화면에 반영된다 */
  play(move: M): void
}

export interface GameView<S> {
  render(state: S): void
  destroy(): void
}

export interface GameDef<S, M> {
  turnSeconds: number
  /** 판 시작 상태. 같은 순서와 시드면 모든 기기에서 같은 상태가 나와야 한다 */
  init(order: string[], seed: number): S
  /** 지금 차례인 플레이어. 끝났으면 null */
  turnOf(state: S): string | null
  /** 수를 적용한 새 상태. 규칙에 어긋나면 null */
  apply(state: S, by: string, move: M): S | null
  /** 턴 제한 시간을 넘겨 차례를 넘긴 상태 */
  skip(state: S): S
  /** 기권하거나 연결이 끊겨 빠진 상태. 남은 사람이 한 명이면 그 사람이 이긴다 */
  eliminate(state: S, id: string): S
  result(state: S): Result | null
  mount(el: HTMLElement, ctx: GameContext<M>): GameView<S>
  /**
   * 방장만 아는 값(비밀)을 쓰는 게임(숫자 야구). 이 함수들은 방장 브라우저에서만 불리고, 비밀은 상태에 넣지 않는다.
   * 다른 사람 화면에는 방장이 판정해 붙인 결과만 전해진다.
   */
  host?: HostSecret<S, M>
}

export interface HostSecret<S, M> {
  /** 판이 시작될 때 비밀을 만든다. move는 방장이 첫 사건으로 모두에게 알린다(예: 정답의 지문) */
  setup(state: S): { secret: unknown; move: M }
  /** 받은 수에 비밀로 판정 결과를 붙인다. 규칙에 어긋나면 null */
  judge(state: S, by: string, move: M, secret: unknown): M | null
}
