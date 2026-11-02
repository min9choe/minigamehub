// 통신 어댑터(기획안 5장). 게임과 화면 코드는 이 파일의 함수만 쓰고 Supabase를 직접 부르지 않는다.
// 나중에 실시간 서비스를 바꾸면 이 파일만 고치면 된다.
import { createClient, REALTIME_SUBSCRIBE_STATES, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

// .env.local이 비어 있으면 null이고, 화면에서 설정 안내를 띄운다
const client: SupabaseClient | null = url && key ? createClient(url, key) : null

export const isConfigured = client !== null

export type ChannelStatus = 'connecting' | 'connected' | 'error' | 'closed'

export interface ChannelHandlers<T> {
  /** 접속자 목록이 바뀔 때마다 { 접속자 키: 상태 } 전체를 받는다 */
  onPresence?: (members: Record<string, T>) => void
  /** 이벤트 이름별로 다른 사람이 보낸 메시지를 받는다. 내가 보낸 메시지는 오지 않는다 */
  messages?: Record<string, (payload: any) => void>
  onStatus?: (status: ChannelStatus) => void
}

export interface Channel<T> {
  /** 내 상태를 공유한다. 연결 전이면 연결되는 대로 공유하고, 실패하면 3초 뒤 한 번 더 시도한다 */
  track(state: T): Promise<boolean>
  send(event: string, payload: object): Promise<boolean>
  leave(): void
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function openChannel<T extends object>(
  name: string,
  myKey: string,
  handlers: ChannelHandlers<T>
): Channel<T> {
  if (!client) throw new Error('Supabase 설정이 없습니다')
  const sb = client

  const ch = sb.channel(name, {
    config: { presence: { key: myKey }, broadcast: { self: false, ack: true } },
  })
  let joined = false
  let lastState: T | null = null

  async function trackNow(state: T) {
    // _t: 같은 사람의 상태가 여럿 보일 때 가장 최근 것을 고르는 데 쓴다
    if ((await ch.track({ ...state, _t: Date.now() })) === 'ok') return true
    await wait(3_000) // 무료 요금제의 상태 변경 한도(30초에 5회)에 걸렸을 수 있다
    return (await ch.track({ ...state, _t: Date.now() })) === 'ok'
  }

  ch.on('presence', { event: 'sync' }, () => {
    const members: Record<string, T> = {}
    for (const [id, metas] of Object.entries(ch.presenceState<T & { _t?: number }>())) {
      // 같은 키로 상태가 여럿이면(새로고침 직후 옛 연결이 아직 남아 있거나, 같은 브라우저의 탭 여러 개) 가장 최근에 보낸 것을 쓴다
      const latest = metas.reduce((a, b) => ((b._t ?? 0) > (a._t ?? 0) ? b : a))
      const { presence_ref: _ref, _t, ...state } = latest
      members[id] = state as unknown as T
    }
    handlers.onPresence?.(members)
  })

  for (const [event, cb] of Object.entries(handlers.messages ?? {})) {
    ch.on('broadcast', { event }, ({ payload }) => cb(payload))
  }

  handlers.onStatus?.('connecting')
  ch.subscribe((status) => {
    switch (status) {
      case REALTIME_SUBSCRIBE_STATES.SUBSCRIBED:
        joined = true
        handlers.onStatus?.('connected')
        // 처음 연결되었거나 끊겼다 다시 연결되면 마지막 상태를 다시 공유한다
        if (lastState) void trackNow(lastState)
        break
      case REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR:
      case REALTIME_SUBSCRIBE_STATES.TIMED_OUT:
        joined = false
        handlers.onStatus?.('error')
        break
      case REALTIME_SUBSCRIBE_STATES.CLOSED:
        joined = false
        handlers.onStatus?.('closed')
        break
    }
  })

  return {
    async track(state) {
      lastState = state
      return joined ? trackNow(state) : true
    },
    async send(event, payload) {
      return (await ch.send({ type: 'broadcast', event, payload })) === 'ok'
    },
    leave() {
      lastState = null
      void sb.removeChannel(ch)
    },
  }
}

/** 탭을 닫을 때 모든 채널에서 바로 빠져 다른 사람 화면에서도 즉시 사라지게 한다 */
export function closeAll() {
  void client?.removeAllChannels()
}
