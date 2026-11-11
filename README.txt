안약 기록 앱 v2.2 — 기존 Firebase 설정 유지 업데이트

1. GitHub 저장소에 이 ZIP의 index.html, app.js, cloud.js, sw.js, manifest.webmanifest, icon.svg 파일만 업로드합니다.
2. 기존 firebase-config.js는 덮어쓰거나 삭제하지 마세요.
3. Firebase 규칙도 기존 권한 분리 규칙을 유지합니다.
4. A33 / 아이폰에서 v2.2 표시 확인. A33 기존 기록 및 백업 보관.
5. 오늘 화면의 [지금 동기화] 버튼을 누르면 미전송 기록을 REST API로 전송하고 서버 데이터를 다시 조회합니다.
6. 성공 결과와 실패 원인을 화면에 표시합니다. 오류가 나면 문구를 확인해 주세요.

기술 변경: Firestore SDK 오프라인 대기 쓰기와 구분하여, 인증 토큰 기반 HTTP PATCH 전송에 12초 제한과 실패 원인 표시를 추가했습니다. 기존 대기열 키를 유지합니다.
주의: 실제 A33/아이폰/Firebase 연동 검증은 배포 후 필요합니다. 이미 점안한 약을 동기화 문제로 다시 넣지 마세요.
