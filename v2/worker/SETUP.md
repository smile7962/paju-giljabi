# 출장ON AI v0.9 — Gemini AI 초안 프록시 설치 안내

**현재 상태:** GitHub Pages에는 AI 초안 요청 화면만 배포합니다. 이 Worker는 자동 배포되지 않습니다. **Cloudflare 계정 소유자가 별도로 설치·비밀키 설정을 마치기 전에는 실제 생성형 AI 호출을 할 수 없습니다.**

## 1. 운영 범위

- 대상: **공개되지 않은 실제 민원기록이 아닌 합성 시연자료**만 허용
- 전달하는 항목: 출장목적, 가상 장소, 가상 일시/참석, 현장확인 메모, 실제 수행한 것으로 설정한 가상 조치
- 전달하지 않는 항목: 사진, 원본 HWPX, 출장 ID, 주민등록번호 등 별도 개인정보 필드
- 안전장치: 32자 이상 서버 접근 토큰, GitHub Pages 출처 제한, Cloudflare 요청 제한(5회/분), JSON 스키마 검증, 빈 조치사항 생성 거부, 담당자 검토 후 적용
- 이 프록시는 **시연 전용**입니다. 접근 토큰과 CORS만으로 기관 내부 실제 민원정보 처리시스템 수준의 인증·감사·보안을 보장하지 않습니다.

## 2. 준비

공식 안내: https://developers.cloudflare.com/workers/configuration/secrets/
공식 안내: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
Gemini: https://ai.google.dev/gemini-api/docs/generate-content/structured-output

1. Cloudflare Workers를 사용할 계정을 준비합니다.
2. Google AI Studio 등에서 서버용 Gemini API 키를 발급받습니다.
3. 소속기관의 외부 생성형 AI 서비스 이용 승인과 데이터 처리 제한을 확인합니다.
4. 터미널에서 GitHub 저장소 `smile7962/paju-giljabi`를 클론 또는 다운로드합니다.

비밀키·토큰은 이 대화, 코드, GitHub, GitHub Issues, 브라우저 주소창에 **절대 붙여넣지 마세요**.

## 3. 로컬 시험

Node.js 설치 후 저장소의 `v2/worker`에서:

```bash
cd v2/worker
node --test ai-draft.test.mjs
```

테스트는 실제 Gemini API에 접근하지 않는 모의 응답입니다.

## 4. Worker 배포 및 보안 설정

`v2/worker/wrangler.toml`에서 `namespace_id`를 자신의 Cloudflare 계정에서 사용할 고유한 정수 문자열로 정하고, 제한 설정을 확인합니다.

```bash
cd v2/worker
npx wrangler@latest login
npx wrangler@latest deploy
npx wrangler@latest secret put GEMINI_API_KEY
npx wrangler@latest secret put TRIPON_DEMO_TOKEN
```

- `GEMINI_API_KEY`: 서버에서만 사용하는 Gemini API 키
- `TRIPON_DEMO_TOKEN`: **영문·숫자 32자 이상의 임의 접근 토큰**. 32바이트의 암호학적 난수로 생성하는 것을 권장합니다. 이 값을 사용자에게 별도 보안 경로로 전달합니다.
- 사용 모델: `GEMINI_MODEL` 환경변수. 기본 `gemini-3.5-flash-lite`. 모델 접근권한이나 비용정책이 달라질 수 있으므로 확인합니다.
- `DRAFT_RATE_LIMITER`는 Wrangler의 `ratelimits` 바인딩으로 자동 설정됩니다. 없는 경우 서버가 요청을 거부합니다.
- 실제 운영환경에서는 별도의 사용자 인증·감사로그·요금 상한·기관 승인망 연결까지 필요하며, 본 시연용 Worker를 그대로 업무에 사용하지 마세요.

`npx wrangler deploy` 결과의 Worker 기본 주소가 예를 들어
`https://tripon-ai-draft-demo.<계정>.workers.dev` 라면 프로그램에 입력할 주소는
`https://tripon-ai-draft-demo.<계정>.workers.dev/draft`입니다.

## 5. GitHub Pages에서 AI 연결 시험

1. https://smile7962.github.io/paju-giljabi/v2/report.html 에 접속
2. 오른쪽 **승인된 AI 프록시 주소**에 Worker `/draft` URL 입력
3. **AI 프록시 접근 토큰**에 발급 토큰 입력 — 토큰은 브라우저에 저장하지 않습니다.
4. **합성자료로 AI 연결 테스트** 클릭 → 실제 출장계획이나 메모와 관계없는 가상 현장자료만 전송
5. 시험이 성공하면 *합성 시연자료만 입력된 상태에서* **현재 작성 내용은 모두 합성자료** 체크 후 **생성형 AI 초안 요청** 실행
6. 초안 결과를 원본 메모와 비교하고 수동 수정 → **확인 후 적용** 클릭
7. 기존 **원본 HWPX로 저장**은 승인된 초안만 사용하고, 사진·서식은 PC 내부에서 처리

실패 시 화면의 상태 문구를 확인합니다. `401` 토큰 오류, `429` 분당 제한, `503` 서버 비밀키·바인딩 미설정, `502` 모델 권한·API 오류입니다.

**중요:** 이 Worker는 아직 배포되지 않았습니다. GitHub 브랜치 병합·Pages 배포만으로 AI 호출이 자동 연결되지 않습니다.
