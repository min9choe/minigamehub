// 주소 뒤 # 방식 화면 이동(기획안 5장). GitHub Pages는 하위 경로로 새로고침하면 페이지를 못 찾기 때문이다.

export type Route = { path: string; params: URLSearchParams }

export function currentRoute(): Route {
  const raw = location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

export function go(path: string) {
  location.hash = `#${path}`
}

/** 주소는 그대로 두고 지금 화면을 다시 그린다(로비 코드를 바꿨을 때 등) */
export function refresh() {
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
