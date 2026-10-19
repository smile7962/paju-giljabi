# 출장ON AI v1.5 배포 및 실기기 검증표 (2026-10-19)

> **적용 범위:** `smile7962/paju-giljabi`의 `main/v2/`. 기존 루트 `index.html` 유지. 
> 개인·민원·내부 현장정보를 공개 GitHub, 지도 서비스, 시험용 Gemini로 전송하지 않습니다.

## 1. 자동검증
- [ ] GitHub Actions [출장ON AI v2 자동검증](https://github.com/smile7962/paju-giljabi/actions/workflows/v2-ci.yml): Node 22 문법/회귀시험/HTML 참조/자격증명 보호 검사 PASS
- [ ] 기존 `index.html` 해시 변경 없음
- [ ] PR 테스트 통과 후 `main` 반영. `main` Pages 배포 성공 확인: [Actions](https://github.com/smile7962/paju-giljabi/actions)

## 2. Pages UI 확인
- [ ] [기존 파주길잡이](https://smile7962.github.io/paju-giljabi/) 정상
- [ ] [출장ON AI PC](https://smile7962.github.io/paju-giljabi/v2/) 정상
- [ ] PC 계획·경로표 QR → 모바일 접속 → 사진/메모 → PC 복명 → 원본 HWPX 기존 기능 회귀확인
- [ ] [출장복명 화면](https://smile7962.github.io/paju-giljabi/v2/report.html)에서 계획 확정 뒤 'AI 연결 방식 선택' 확인
- [ ] 기본값 '보안 프록시', 직접 모드에서 모델/키 입력 및 '키 지우기' 버튼 확인
- [ ] 실제 한글에서 HWPX 본문/결재란/사진 2장씩/표 가운데정렬 육안 확인

## 3. Gemini 직접 연결 (반드시 합성자료, 본인 브라우저에서만)
1. Google AI Studio에서 별도 시연용 API 키 발급. 키를 채팅/커밋/스크린샷/URL에 절대 붙이지 않기
2. `출장ON AI PC`에서 공개 가능한 **가상 주소**로 출장계획을 확정하고 '출장결과보고서 작성'으로 이동
3. AI 연결 방식에서 **Gemini API 직접 연결 (합성자료 시연 전용)** 선택, 기본 **3.5 Flash-Lite** 선택 후 API 키 입력
4. '합성자료로 AI 연결 테스트' 클릭. 이 버튼은 현재 보고서의 내용이 아니라 고정된 가상 테스트 데이터를 전송함
5. '연결 성공' 문구 확인. CORS/403/404/429 오류는 문구와 콘솔 네트워크 상태를 확인하되 키 원문은 공유하지 않기
6. 목적/확인/조치에 가상 내용만 기입, '모든 내용 합성자료' 체크 → '생성형 AI 초안 요청' → 최종 확인
7. AI 제안 결과를 검토하고 **확인 후 적용** 클릭. 비어 있는 조치사항에 임의 결과가 생기면 거부되는지 확인
8. 모델·키·방문지·메모 변경 시 기존 초안 폐기, 프록시 전환/탭 종료 시 API 키 지워짐 확인

**합격 기준:** 자동검증 PASS + GitHub Pages 성공 + 위 브라우저 실제 Gemini 200 응답 및 CORS 통과 + 원본 HWPX 사용자 실기기 확인.

**제외:** Cloudflare Worker 실제 배포(현재 직접 시연은 Worker 불필요); 기관 보안승인 전 실제 업무자료 AI 전송. 자동검증 PASS가 실 API 응답/기관 사용 승인을 의미하지 않습니다.

## 4. 장애 시 대안
- 브라우저가 CORS를 차단하면 직접 연결이 불가능합니다. 승인된 Worker 프록시를 배포해 이용하며, 브라우저 키로 CORS를 우회하지 않습니다.
- 키 오류/모델 접근 제한은 Google AI Studio의 모델별 접근권한 및 요금제를 확인합니다.
- 실패 로그를 전달할 때는 주소/민원내용/키/토큰을 마스킹하고 에러 코드만 공유합니다.

## v1.5.1 HTTP 400 재확인
- [ ] 브라우저 `Ctrl+F5`로 최신 `gemini-direct.js`를 로드하고 **합성자료로 AI 연결 테스트** 재실행
- [ ] Gemini 요청의 `generationConfig.responseFormat.text.mimeType`이 `APPLICATION_JSON`으로 보내지는지 확인 (실제 키/요청 페이로드/업무정보는 공유 금지)
- [ ] 재시험이 400이면 브라우저 화면의 오류 문구 및 선택 모델명만 공유하고 API 키는 숨기기
