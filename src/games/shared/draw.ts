// 여러 게임이 함께 쓰는 그리기 도우미.

/** 위에서 빛을 받은 듯한 반들반들한 바둑돌 */
export function drawStone(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: 'black' | 'white' | 'mono') {
  const light = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  if (kind === 'black') {
    light.addColorStop(0, '#5a5a5a')
    light.addColorStop(0.45, '#1c1c1c')
    light.addColorStop(1, '#050505')
  } else if (kind === 'white') {
    light.addColorStop(0, '#ffffff')
    light.addColorStop(0.6, '#f1f0ea')
    light.addColorStop(1, '#c9c6bb')
  } else {
    light.addColorStop(0, '#8a92a3')
    light.addColorStop(0.5, '#4a5160')
    light.addColorStop(1, '#2e333d')
  }
  // 판에 드리운 그림자
  g.fillStyle = 'rgba(0, 0, 0, 0.25)'
  g.beginPath()
  g.arc(x + r * 0.08, y + r * 0.12, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = light
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fill()
}
