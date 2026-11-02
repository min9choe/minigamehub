// 로비 채널(기획안 10-3). 로비의 Presence 상태가 곧 접속자 목록이고, 2단계에서는 줄 상태도 여기에 싣는다.
import { getPlayerId } from './identity'
import { openChannel, type ChannelStatus } from './net/realtime'

export type LobbyState = { nick: string; game: string | null; queuedAt: number | null }
export type LobbyPlayer = LobbyState & { id: string }

export function lobbyChannelName(code: string) {
  return code ? `lobby:${code}` : 'lobby'
}

export function joinLobby(opts: {
  nick: string
  code: string
  onPlayers: (players: LobbyPlayer[]) => void
  onStatus: (status: ChannelStatus) => void
}) {
  const lobby = openChannel<LobbyState>(lobbyChannelName(opts.code), getPlayerId(), {
    onPresence: (members) =>
      opts.onPlayers(Object.entries(members).map(([id, state]) => ({ id, ...state }))),
    onStatus: opts.onStatus,
  })
  void lobby.track({ nick: opts.nick, game: null, queuedAt: null })
  return lobby
}
