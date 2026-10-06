# Milestone status

Current milestone: **M2**

Status: **Hosted signup and persistence confirmed by user; admin/isolation verification pending**

Last updated: 2026-10-06 (Asia/Seoul)

2026-10-06 사용자 승인된 GitHub–Supabase integration을 통해 foundation과 initial catalog
migration을 적용했다. commit 7fe8256의 Supabase check가 성공했고 실제 Data API에서
category 9개와 published 문제/version 3개를 확인했다. 익명 private/package/사용자 기록 조회는
거절된다. 이후 사용자가 가입 메일 수신과 로그인된 상태에서의 인터뷰 시작, 메시지/힌트 저장,
새로고침 후 복원을 확인했다. 이는 사용자 보고이며 자동화된 계정 검증과 구분한다.
admin session, 사용자 간 데이터 격리 등 아래 미검증 항목은 남아 있으며 M3는 미착수다.

## Completed — repository implementation

- 현재 UI/route/type/mock/env/Git 상태를 조사하고 M1 이후 UI를 source of truth로 유지.
- @supabase/supabase-js 2.117.2, @supabase/ssr 0.12.7 두 dependency만 추가.
- browser/server client, Next.js 16 proxy cookie refresh, Auth 서버 identity 검사.
- English email/password login/signup, confirmation callback/선택적 token-hash route, Sign out.
- DB profiles.role 기반 requireUser/requireAdmin; Admin layout와 모든 page/private service에서 검사.
- 9개 table, FK/check/index/trigger/grant/RLS 및 원자적인 본인 attempt RPC migration 작성.
- 현재 category 9개/problem 6개/private package 3개를 seed로 보존하고 SQL generator 작성.
  기존 debrief 3개 문구도 deferredDebriefs 자료로 보존하며 M2 SQL/runtime에는 제공하지 않는다.
- DB category/public problem/admin problem/private package repository 연결, runtime mock catalog 제거.
- attempt version 고정, 활성 회차 resume, 메시지+mock feedback 저장, hint 기록, Finish/history 코드.
- 메시지 재시도 request_id, 중복 hint 방지, 긴 대화의 page 단위 복원 조회.
- review는 본인의 completed 대화/힌트만 반환; answer/rubric/전체 ladder를 공개하지 않음.
- 기존 인증 없는 mock-hint action과 메모리 attempt context 제거; 내용은 seed/이전 snapshot으로 보존.
- Supabase 미설정 시 명확한 unavailable 상태; 저장된 것처럼 보이는 mock DB fallback 없음.
- 설정/최초 admin/RLS 검증 문서 및 실행 준비된 rollback SQL 검사 작성.

## Confirmed by user against hosted Supabase (2026-10-06)

- 가입 후 Supabase confirmation email 수신 및 정상 진행을 확인했다.
- 로그인된 상태에서 대표 드론 문제의 Start interview, 메시지 전송, Hint 요청을 확인했다.
- 새로고침 후 대화와 사용한 힌트가 복원되는 것을 확인했다.
- 사용자의 브라우저 수동 확인 결과다. Codex가 계정 credential을 받아 재현하거나 DB row를 직접 검사한 것은 아니다.

## Not yet verified against hosted Supabase

- Sign out 후 재로그인, 만료된 session의 자동 refresh
- Finish interview 후 본인의 completed review 조회
- 로그인된 일반 계정의 Admin route 차단 및 private package 직접 조회 차단
- 실제 admin 계정의 DB category/problem/private package 조회
- 두 일반 계정 사이의 데이터 격리, 일반 user의 role 변경 차단, 실제 RLS/column grant 실행 결과
- hosted DB에서 supabase/tests/rls.sql 실행과 로그인된 인터뷰 payload 검사

익명 Data API/페이지 경계와 로컬 SQL role 검증은 완료했다. 위 항목은 해당 결과와 구분한다.
실행 순서는 [SUPABASE_SETUP.md](SUPABASE_SETUP.md)를 따른다.

## Still mock / intentionally not implemented

- 메시지 내용과 무관한 deterministic feedback, 시연 progress, 고정 첫 hint
- source/candidate/evaluation review demo와 local-only draft preview
- 실제 LLM evaluator/authoring, adaptive hints/progress/escalation, benchmark
- source discovery/crawler, jobs, full content lifecycle/automatic publishing
- reference answer 및 평가 debrief release
- Korean localization, OAuth/MFA, billing/payment, production deployment

## Environment

- Path: /home/seunghyo/code/tech-interview-ai; branch: main.
- 최초 repository 파일은 모두 untracked였다. GitHub 연결/최초 snapshot 준비는 아래 인계 기록을 참조한다.
- Node.js v24.21.0, pnpm 12.5.1, Next.js 16.3.8, React 19.2.8, TypeScript 5.9.3.
- 기존 dependency/devDependency 버전과 설정은 유지. global 설치/CLI 설치 없음.
- M2 초기 구현 때는 `.env.example`만 있었으며, 2026-10-06 사용자가 `.env.local`을 설정했다.
  필수 세 변수의 존재, publishable key 형식, elevated runtime key 부재, Git ignore를 확인했다.
  실제 URL/key 값은 출력하거나 문서에 기록하지 않았다.
- 2026-10-06 3001 포트가 비어 있음을 확인한 뒤 `pnpm dev`로 서버를 다시 실행했다.
  `.env.local`을 읽고 127.0.0.1:3001에서 준비 완료했다. 기존 process를 종료하지 않았다.
- Supabase CLI/psql/global package를 설치하지 않았다. 사용자 승인된 GitHub integration이
  schema/catalog migration을 실행했으며 앱에는 elevated runtime key를 추가하지 않았다.
  프로젝트 dependency 변경 없이 /tmp에 설치한 PGlite로 로컬 SQL을 검증했다. LLM API 호출은 없다.

## Actual verification — initial implementation (2026-10-05)

| Command / check | Result |
| --- | --- |
| pnpm lint | 최종 성공, warnings 0 |
| pnpm typecheck | 성공, Next route types + TypeScript |
| pnpm test | 성공, 11개 (domain, auth 입력/redirect, seed 무결성, migration 정적 검사) |
| pnpm build | 성공, production build/route 생성 |
| pnpm check:boundaries | 성공, 9개 client import graph / 15개 browser chunk / 5개 static public HTML |
| node scripts/generate-seed.mjs | 성공, category 9/problem 6/private package 3개 SQL 생성 |
| migration/seed 정적 검토 | RLS/grant/definer search_path/owner/version/private 경계 검토; 실제 Postgres 실행 아님 |
| localhost HTTP 검사 | 공개/인증 4개 route 200, 보호 route 7개 login 307, invalid callback 2개 307 |
| Firefox 157 headless | 미설정 로그인/가입/문제 안내 및 Admin/review → login 이동 확인 |
| screenshot 직접 확인 | login 1440px, signup 500px; 가로 overflow 없음 |
| git check-ignore | .env/.env.local/.env.production 제외, .env.example 예외 확인 |
| process/port 확인 | 3001 기존 서버 유지, 이번 검사용 Firefox/WebDriver 종료 |

HTTP 200: /problems, /problems/drone-dynamics-adaptation, /login, /signup.
이 결과는 미설정 상태 안내이며 실제 DB 문제 조회 성공을 의미하지 않는다.
HTTP 307: /review 및 /admin, /admin/sources, /admin/candidates, /admin/problems,
/admin/categories, /admin/evals → /login. 잘못된 /auth/callback, /auth/confirm은 confirmation 오류 안내로 이동한다.

최초 lint는 signOut의 미사용 인자 warning으로 실패했고 해당 인자를 제거한 후 통과했다.
기존 Node TypeScript ESM 자동 인식 warning은 test 실행에 남지만 11개 모두 통과했다.
build는 기존 도구 sandbox의 내부 socket 제한을 피하기 위해 권한 확장으로 실행했다.

## Connection follow-up (2026-10-06)

- `.env.local`의 필수 설정과 publishable key 형식을 값 노출 없이 확인했다.
- Auth settings: HTTP 200, email enabled, signup enabled, email confirmation required.
- categories, problems, problem_evaluation_packages: HTTP 404 / PGRST205.
  table 조회 실패이므로 private 접근 차단/RLS 검증 성공으로 해석하지 않는다.
- `pnpm dev`: `.env.local`을 읽고 127.0.0.1:3001에서 기동 성공, 서버를 유지한다.
- migration/seed는 실행하지 않았다. publishable key는 schema 관리 credential이 아니므로
  [SUPABASE_SETUP.md](SUPABASE_SETUP.md)의 SQL editor 적용 순서를 따른다.
- 코드 변경 없이 연결 상태와 문서만 갱신했다. lint/typecheck/test/build는 이번 확인에서 재실행하지 않았다.

## GitHub repository handoff (2026-10-06)

- 사용자 지정 repository: https://github.com/shy020501/tech-interview-ai.
- origin을 해당 HTTPS URL로 연결했다. 기존 인증의 push 권한과 원격 main이 아직 비어 있음을 확인했다.
- 확인 당시 repository는 Public이다. source와 개발용 mock 문제/정답 seed가 snapshot 범위에 포함된다.
- 최초 snapshot은 현재 M2 코드, SQL migration/seed, 테스트와 문서다. 실제 Supabase 데이터나
  환경 파일, node_modules, .next는 포함하지 않는다. 환경 파일은 비어 있는 .env.example만 저장한다.
- 업로드 대상 81개 파일에서 실제 환경 변수 값과 주요 key/token/private-key 패턴을 검사했고
  발견 사항은 없었다. GitHub credential은 기존 credential helper로 사용하며 출력/저장하지 않았다.
- pnpm lint, pnpm typecheck, pnpm test (11개), pnpm build, pnpm check:boundaries를 다시 실행해 통과했다.
  이번 build는 .env.local 설정을 읽었고, 경계 검사는 client graph 9개/browser chunk 15개/static HTML 3개다.
- Supabase 읽기 전용 연결 이후의 상태를 README/ARCHITECTURE에 반영했다. UI/기능 변경은 없다.
- migration/seed 실행, Auth/RLS/persistence의 live 검증과 production deployment는 이번 GitHub 인계에 포함되지 않는다.

## GitHub migration preparation (2026-10-06)

- 사용자가 GitHub–Supabase 연결과 Deploy to production 활성화를 확인했다.
- supabase/config.toml을 추가하고 기존 M2 seed snapshot을 initial catalog data migration으로 기록했다.
- 최초 적용 전 foundation의 최상위 transaction 제어를 제거하여 Supabase runner의 transaction/history를 사용한다.
- Docker daemon 접근 권한이 없어 사용하지 않았다. /tmp의 PGlite 0.5.8에서 최소 auth.users/auth.uid
  stub과 실제 anon/authenticated DB role을 구성하여 두 migration을 각각 transaction으로 실행했다.
- 로컬 SQL 실행 성공: category 9/problem 6/private package 3, RLS table 9.
- seed 재실행이 기존 편집을 덮어쓰지 않는지, anon에게 published 문제/version 3개만 보이는지 확인했다.
- supabase/tests/rls.sql의 user A/user B/admin 격리, role 승격 차단, RPC/힌트 재시도, version 고정,
  완료 후 변경 차단 검사가 로컬에서 통과했고 synthetic row는 rollback됐다.
- PGlite는 로컬 단일 연결 검증이다. 실제 Supabase Auth, hosted RLS, 동시성 검증의 대체가 아니다.
- TOML 구문 및 seed/data migration 내용 일치를 확인했다. lint/typecheck/test (11개)/build와
  check:boundaries (client 9/browser chunk 15/static HTML 3)도 다시 실행해 통과했다.
- Next.js UI/runtime dependency 변경은 없다. 실제 GitHub/Supabase 실행 결과는 적용 후 별도로 기록한다.

## Hosted migration and public UI verification (2026-10-06)

- Commit 7fe8256을 main에 push했고 GitHub의 Supabase Preview check가 completed/success가 됐다.
- 실제 Data API: categories 200/9개, 기존 seed의 ID/name/parent 관계와 일치.
- 실제 Data API: problems와 problem_versions 각각 200/3개, published/current version만 반환.
- 익명 private package/profiles/attempts/attempt_messages/hint_events SELECT는 모두 401/42501로 거절.
- localhost 공개 목록·published 상세 3개·login/signup은 200. 실제 DB problem title 표시를 확인했다.
- review 및 Admin 6개 route는 비로그인 접근 시 login으로 307 redirect.
- draft/needs_review/archived slug는 접근 불가 화면이며 비공개 title/scenario가 응답에 없다.
  Next.js streamed notFound 응답은 HTTP 200일 수 있어 상태 코드와 렌더링 내용을 함께 검사했다.
- 검사한 HTTP payload에서 reference answer, hint ladder, misconception fixture marker를 발견하지 못했다.
- Firefox 1440px에서 실제 DB 문제 목록/필터/empty state/reset과 인터뷰를 확인하고 스크린샷을 직접 검토했다.
  문제/채팅 panel은 각각 567px, 비로그인 입력은 disabled다. 500px에서도 가로 overflow가 없다.
- 현재 사용자 계정 credential이 없어 signup/login/실제 소유자 저장·재개/admin 세션 검증은 수행하지 않았다.
- 스크린샷과 로컬 SQL 검증 artifact: /tmp/tech-interview-ai-m2-sql-rJYfA7/.

## User confirmation follow-up (2026-10-06)

- 사용자가 가입 메일 수신 문제 해결과 위 인터뷰 저장/복원 흐름을 확인했다.
- STATUS, README, SUPABASE_SETUP, ARCHITECTURE의 현재 검증 상태를 맞췄다.
- 문서만 변경했다. `git diff --check`로 변경 형식을 검사하며 lint/typecheck/test/build는 재실행하지 않는다.
- Auth 설정, DB 권한, UI, 기존 서버를 변경하지 않았고 M3를 시작하지 않았다.

## UI regression scope

- src/app/globals.css는 시작 당시와 바이트 단위로 동일하다.
  SHA256: 72dddeff378bac943b5bbbbbc3b8677ff04008de09a7510cfb3a6207f8dc753e.
- 문제 목록/상세/Admin layout의 기존 class 조합은 모두 유지했다. 문제/채팅 1:1 비율도 동일하다.
- chat panel/composer/message/action 스타일은 유지하고 DB 상태/저장 호출/로그인 안내를 연결했다.
  실제 사용자 메시지로 혼동될 수 있는 기존 sample 표시만 runtime에서 제외했다.
- reference review의 큰 panel 배치는 유지하되 비공개 정답 대신 저장된 대화/힌트와 제한 안내를 제공한다.
- 실제 DB-backed 비로그인 화면을 이번에 확인했다. 로그인별 렌더링은 계정 설정/검증 후 확인해야 한다.
- 시작 snapshot: /tmp/tech-interview-ai-m2-before-3hvdza4u/.
- screenshot: /tmp/tech-interview-ai-m2-login.png, /tmp/tech-interview-ai-m2-signup.png,
  /tmp/tech-interview-ai-m2-problems.png. 실제 모바일/Safari/Chromium 검사는 하지 않았다.

## Next milestone

**M3 — Admin content lifecycle and problem package management**

- 먼저 남은 hosted Auth/admin/RLS/review 검증을 완료한다.
- DB-backed category/problem version 편집과 private package 검수 흐름을 설계한다.
- draft → review → human-approved publish와 변경 이력을 구현한다.
- 현재 source/candidate demo와 실제 관리 workflow의 경계를 정리한다.
- 별도 사용자 승인 전에는 M3를 시작하지 않는다.

## History and update rule

M1 및 M0 상세 검증 이력은 [history/M1_STATUS.md](history/M1_STATUS.md)에 보존했다.
변경 후 이 파일에 완료한 코드와 실제 실행한 검증, 미검증/외부 설정을 구분해 기록한다.
