// 효과음(기획안 8장 7단계). 소리 파일 없이 Web Audio로 짧은 소리를 만든다.
// 브라우저는 사용자가 화면을 누르기 전에는 소리를 막으므로, 첫 입력 때 오디오를 깨운다.

const MUTE_KEY = 'mgh.muted'

let ctx: AudioContext | null = null
let muted = (() => {
  try {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
})()
const listeners = new Set<() => void>()

export const isMuted = () => muted

export function setMuted(next: boolean) {
  muted = next
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0')
  } catch {
    // 저장이 막혀도 이번 접속 동안은 적용된다
  }
  listeners.forEach((fn) => fn())
}

export function onMuteChange(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

function audio(): AudioContext | null {
  if (muted) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null // 소리를 낼 수 없는 환경
  }
}

// 첫 입력 때 오디오를 깨워 둔다
const unlock = () => {
  audio()
  window.removeEventListener('pointerdown', unlock)
  window.removeEventListener('keydown', unlock)
}
if (typeof window !== 'undefined') {
  // 테스트처럼 브라우저가 아닌 곳에서 불러와도 깨지지 않게 한다
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, delay = 0, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + delay
  const osc = a.createOscillator()
  const amp = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(a.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

function noise(dur: number, gain = 0.3) {
  const a = audio()
  if (!a) return
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2
  const src = a.createBufferSource()
  const filter = a.createBiquadFilter()
  const amp = a.createGain()
  src.buffer = buf
  filter.type = 'lowpass'
  filter.frequency.value = 900
  amp.gain.value = gain
  src.connect(filter).connect(amp).connect(a.destination)
  src.start()
}

export const sfx = {
  /** 카운트다운 3, 2, 1 */
  tick: () => tone(880, 0.08, 'square', 0.05),
  /** 시작 */
  go: () => tone(1320, 0.18, 'square', 0.06),
  /** 내 차례가 왔다 */
  myTurn: () => {
    tone(660, 0.08, 'sine', 0.1)
    tone(990, 0.12, 'sine', 0.1, 0.08)
  },
  /** 돌을 놓거나 칸을 고름 */
  place: () => tone(260, 0.07, 'triangle', 0.25, 0, 180),
  /** 돌을 튕기거나 포탄을 쏨 */
  flick: () => tone(420, 0.12, 'sawtooth', 0.05, 0, 160),
  /** 돌이 떨어지거나 실패 */
  fall: () => tone(520, 0.35, 'sine', 0.08, 0, 90),
  /** 땅을 얻음 */
  gain: () => {
    tone(784, 0.1, 'triangle', 0.1)
    tone(1047, 0.16, 'triangle', 0.1, 0.09)
  },
  /** 포탄 폭발 */
  boom: () => noise(0.5, 0.35),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.15)),
}
