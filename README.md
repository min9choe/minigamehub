# minigamehub

링크 하나로 들어와 줄을 서면 정원이 찰 때 자동으로 대전이 시작되는 미니 게임 모음. GitHub Pages(정적 호스팅)와 Supabase Realtime으로 동작한다. 설계는 [기획안.md](기획안.md)를 본다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase URL과 publishable 키를 넣는다
npm run dev
```

두 사람 테스트는 일반 창과 시크릿 창(또는 `localhost`와 `[::1]`처럼 다른 주소)으로 연다. 같은 브라우저의 탭은 한 사람으로 합쳐진다.

## 배포

main에 push하면 `.github/workflows/deploy.yml`이 빌드해서 Pages에 올린다. 처음 한 번은 저장소 설정이 필요하다.

1. Settings > Pages > Build and deployment의 Source를 **GitHub Actions**로 바꾼다.
2. Settings > Secrets and variables > Actions > **Variables**에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`를 추가한다.
