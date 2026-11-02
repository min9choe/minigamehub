/** 다른 사람이 정한 닉네임처럼 밖에서 온 글자는 반드시 이걸 거쳐 HTML에 넣는다 */
export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function $<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`요소를 찾을 수 없습니다: ${selector}`)
  return el
}
