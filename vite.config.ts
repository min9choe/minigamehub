import { defineConfig } from 'vite'

// GitHub Pages는 https://아이디.github.io/저장소이름/ 아래에서 열린다.
// 배포 workflow가 저장소 이름으로 BASE_PATH를 넘겨 주고, 로컬 개발은 '/'를 쓴다.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
})
