// 해적선 찾기 연습 봇: 자기 배치를 기억해 답하고, 쏠 때는 맞힌 칸 둘레를 먼저 찾고 아니면 바둑판 무늬로 쏜다.
import { commitOf, saveFleet, loadFleet, type Move, type State } from '.'
import { N, answerFor, randomFleet } from './rules'

export function piratesBot(s: State, botId: string, random = Math.random): Move {
  const me = s.order.indexOf(botId)
  const foe = 1 - me
  if (s.phase === 'setup') {
    const fleet = randomFleet(random)
    const salt = Math.floor(random() * 2 ** 32).toString(16)
    const hash = commitOf(fleet, salt)
    saveFleet(hash, { fleet, salt })
    return { kind: 'commit', hash }
  }
  const mine = loadFleet(s.commits[me]!)!
  if (s.phase === 'reveal') return { kind: 'reveal', fleet: mine.fleet, salt: mine.salt }
  if (s.pending !== null) {
    const hits = s.shots[me].filter((sh) => sh.hit).map((sh) => sh.cell)
    return { kind: 'answer', ...answerFor(mine.fleet, hits, s.pending) }
  }

  const shot = new Set(s.shots[foe].map((sh) => sh.cell))
  const sunk = new Set(s.sunk[foe].flat())
  // 맞았지만 아직 안 가라앉은 칸 둘레
  const open = s.shots[foe].filter((sh) => sh.hit && !sunk.has(sh.cell)).map((sh) => sh.cell)
  const around: number[] = []
  for (const c of open) {
    const x = c % N
    const y = Math.floor(c / N)
    // 같은 줄에 맞은 칸이 둘 이상이면 그 방향으로만 잇는다
    const lineH = open.some((o) => o !== c && Math.floor(o / N) === y && Math.abs((o % N) - x) === 1)
    const lineV = open.some((o) => o !== c && o % N === x && Math.abs(Math.floor(o / N) - y) === 1)
    const dirs = lineH ? [[1, 0], [-1, 0]] : lineV ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const [dx, dy] of dirs) {
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < N && ny >= 0 && ny < N && !shot.has(ny * N + nx)) around.push(ny * N + nx)
    }
  }
  const pool = around.length
    ? around
    : Array.from({ length: N * N }, (_, i) => i).filter((i) => !shot.has(i) && ((i % N) + Math.floor(i / N)) % 2 === 0)
  const rest = pool.length ? pool : Array.from({ length: N * N }, (_, i) => i).filter((i) => !shot.has(i))
  return { kind: 'shot', cell: rest[Math.floor(random() * rest.length)] }
}
