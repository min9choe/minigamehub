# minigamehub

링크 하나로 들어와 줄을 서면 정원이 찰 때 자동으로 대전이 시작되는 미니 게임 모음. GitHub Pages(정적 호스팅)와 Supabase Realtime으로 동작한다. 설계는 [기획안.md](기획안.md)를 본다.

## 들어 있는 것

- 게임 10개: 틱택토(3판 2선승), 오목(흑 3-3 금수), 알까기, 땅따먹기(2~4명, 남의 땅 빼앗기), 포트리스(2~4명), 윷놀이(2~4명, 꼴찌까지 등수), 리버시, 점 잇기(2~4명), 컬링, 숫자 야구(정답은 방장 브라우저에만)
- 로비: 게임별 줄서기, 2~4명 게임은 2명이 모이면 10초 뒤 시작, 로비 코드로 친구끼리만 모이기
- 관전: 로비의 '진행 중인 판'에서 '관전하기'로 남의 판을 지켜보기(새로고침해도 이어서 관전)
- 친구 초대 링크: 링크를 받은 친구가 들어오면 같은 게임 줄에 자동으로 서서 바로 시작
- 봇과 연습: 틱택토, 오목, 윷놀이, 리버시, 점 잇기, 숫자 야구(서버 없이 브라우저 안에서만)
- 효과음(게임 화면 오른쪽 위에서 끄고 켬), 새로고침·잠깐 끊김 뒤 이어 하기, 30초 재접속 대기 후 기권패

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # Supabase URL과 publishable 키를 넣는다
npm run dev
```

규칙·물리·봇 테스트(오목 3-3 금수, 땅 면적, 포탄 등)는 `npm test`로 돌린다.

개발 모드에서는 콘솔의 `__mghRoom.view()`로 진행 중인 판 상태를 볼 수 있다.

두 사람 테스트는 일반 창과 시크릿 창(또는 `localhost`와 `[::1]`처럼 다른 주소)으로 연다. 같은 브라우저의 탭은 한 사람으로 합쳐진다.

## 배포

main에 push하면 `.github/workflows/deploy.yml`이 빌드해서 Pages에 올린다. 처음 한 번은 저장소 설정이 필요하다.

1. Settings > Pages > Build and deployment의 Source를 **GitHub Actions**로 바꾼다.
2. Settings > Secrets and variables > Actions > **Variables**에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`를 추가한다.
