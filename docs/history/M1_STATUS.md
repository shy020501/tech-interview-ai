# Milestone status

Current milestone: **M1**

Status: **Completed** — M1 완료, M2 미착수

Last updated: 2026-10-05 (Asia/Seoul)

## Completed

- M0 문서/설정/Git/dependency를 먼저 확인하고 기존 프로젝트를 이어서 확장.
- English-first User mock UI: 목록, category/type/difficulty/search 필터, Advanced 우선 배치.
- 대표 Drone Dynamics Adaptation 인터뷰, desktop 3열 화면과 HTML/CSS visualization.
- 자유 입력 채팅, content-independent mock feedback, mock progress, 명시적인 단일 hint 요청.
- Finish → review 연결, 실제 입력 메시지와 hints used 전달, 제한된 reference debrief.
- Admin dashboard, sources, candidates, problems, categories, evals 6개 화면과 공통 navigation.
- local screening, reject/undo, draft preview 수정/reset, human evaluation review.
- Category/Problem/Evaluation/Attempt/Source/QuestionCandidate TypeScript 계약.
- public/private mock data 분리, server-only import 경계, published-only 사용자 조회.
- 깊이가 고정되지 않은 category tree, descendant/secondary category 필터, many-to-many 방향.
- English 표시명과 machine-readable ID 분리; Korean optional/검수된 localization 방향 유지.
- provider-agnostic 평가 결과와 offline authoring/online evaluation 분리 문서화.
- Node 내장 테스트 및 build 산출물의 공개 데이터 경계 검증.
- 실제 Firefox headless interaction 검사와 desktop/축소 창 screenshot 직접 확인.

## Not implemented

- Supabase/SDK, database/schema/migration, persistence, category storage
- authentication, login, admin authorization, attempt ownership/completion access control
- 실제 LLM/evaluator, adaptive hint selection, escalation, evaluator benchmark
- 실제 source discovery/crawler, arXiv/YouTube/Instagram API, authoring/publish pipeline, scheduled jobs
- Redis/vector DB, billing/payment, fine-tuning
- Korean UI/localization, locale switcher/routing, translation API/i18n framework
- production deployment, Vercel configuration

## Environment and scope

- Path: `/home/seunghyo/code/tech-interview-ai`; branch: `main`.
- 시작 당시 M0 파일은 모두 untracked였으며 기존 commit/remote가 없었다. commit/push는 하지 않았다.
- Node.js `v24.21.0`, pnpm `12.5.1`; Next.js `16.3.8`, React `19.2.8`, TypeScript `5.9.3`.
- Tailwind CSS `4.3.3`, ESLint `9.39.5`. dependency 추가/업그레이드 및 lockfile 변경 없음.
- 총 문제 6개: published 3 (Advanced 2 / Core 1), needs_review 1, draft 1, archived 1.
- category 9, competency 7, source 6, candidate 3, evaluation review 2개 fixture.
- 개발 주소: `http://127.0.0.1:3001`; 외부 서비스 API/LLM/유료 API를 호출하지 않았다.

## M1 Question Type naming — 2026-10-05

- Question Type 표시명을 Core (기본 개념 질문) / Advanced (scenario 기반 응용 질문)로 변경했다.
  드론 문제는 Advanced 유형, Intermediate 난이도다.
- User 필터/문제 카드/인터뷰와 Admin 문제/candidate가 공통 `questionTypeLabels`를 사용한다.
  필터는 Core → Advanced 순서로 표시하며, 문제 목록의 Advanced 우선 정렬은 유지한다.
- 표시명과 내부 key를 분리하기 위해 `fundamental`/`applied` 계약은 유지했다.
  별도 Difficulty 분류와 구분하여 제품 명세, architecture, README에 반영했다.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (7개), `pnpm build`,
  `pnpm check:boundaries`가 모두 성공했다.
- localhost의 `/problems`, 드론/Core 문제, `/admin/problems`, `/admin/candidates`에서
  HTTP 200 및 새 표시명 반영을 확인했다. 필터 option과 Difficulty 값을 HTML로 확인했다.
  이번 표시명 변경에서는 브라우저 시각 검사를 다시 실행하지 않았다.
- 개발 서버는 `127.0.0.1:3001`에서 계속 실행 중이며 M2는 미착수다.

## M1 UI follow-up — 2026-10-05

- 사용자 요청에 따라 문제와 Interview Workspace가 남은 가로 공간을 1:1로 사용하도록
  조정했다. 내비게이션이 있는 desktop과 없는 중간 화면에 모두 적용하며, 800px 이하는
  기존 세로 배치를 유지한다.
- 문제의 `Your challenge` 표시 문구를 `Interview Question`으로 변경했다.
- Firefox에서 1920/1500/1440/1200/1199/1000/801/800/500px 창의 실제 너비와 배치를
  측정했다. 가로 배치에서 두 영역 너비가 같고 모든 확인 크기에서 가로 overflow가 없었다.
  1440px과 801px screenshot을 직접 확인했다. screenshot은 `/tmp/tech-interview-ai-layout-*.png`에 있다.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (7개), `pnpm build`,
  `pnpm check:boundaries`가 성공했다. 문구 변경 후 lint/typecheck/build/boundary를 재확인했다.
- 대표 문제의 localhost HTTP 200 응답과 새 문구 표시, 기존 문구 부재를 확인했다.
- 사용자 요청대로 개발 서버는 `127.0.0.1:3001`에서 실행 중이다. 확인용 Firefox/WebDriver만 종료했다.
- M1 UI 조정이며 M2 기능이나 dependency는 추가하지 않았다.

## M1 verification

| 실제 command / 검사 | 결과 |
| --- | --- |
| `pnpm lint` | 성공. 최종 추가 script 포함 재확인 완료 |
| `pnpm typecheck` | 성공 |
| `pnpm test` | 성공, Node 내장 runner 7개 테스트 |
| `pnpm build` | 성공. 기존 Turbopack 내부 socket 제한 때문에 권한 확장 실행 |
| `pnpm check:boundaries` | 성공. 인터뷰 HTML 3개와 browser chunk 15개에서 private fixture 부재 확인 |
| `pnpm dev` | `127.0.0.1:3001` 기동 성공 |
| Python `urllib.request`로 localhost route GET | 아래 정상 경로 11개 HTTP 200, 비공개/없는 경로 5개 HTTP 404 |
| Firefox 157 / geckodriver 0.37.1 | 필터/채팅/힌트/review/Admin local interaction 통과 |
| rendered screenshot 직접 확인 | 목록, 3열 인터뷰, review, Admin dashboard/problem, 축소 창 인터뷰 확인 |
| `ss -ltnp '( sport = :3000 or sport = :3001 or sport = :4447 )'` | 검증 종료 후 세 포트 모두 리스너 없음 |

HTTP 200을 확인한 경로:

- `/problems`
- `/problems/drone-dynamics-adaptation`
- `/problems/camera-shift-diagnosis`
- `/problems/useful-representations`
- `/review`
- `/admin`
- `/admin/sources`
- `/admin/candidates`
- `/admin/problems`
- `/admin/categories`
- `/admin/evals`

HTTP 404를 확인한 경로:

- `/problems/unknown-robot-payload` (needs_review)
- `/problems/depth-estimation-in-fog` (draft)
- `/problems/augmentation-assumptions` (archived)
- `/problems/not-a-problem`
- `/review?problem=not-a-problem`

브라우저 검사에서는 Security empty state, type/difficulty 필터와 reset, 빈 입력 validation,
메시지 전송과 60% mock progress, 클릭 전 hint/answer 부재, 클릭 후 hint 하나, Finish 후
입력/힌트 수와 reference answer 표시를 확인했다. Admin screening, reject/undo, draft 연결,
local editor/reset, 재귀 category tree, human review 변경도 확인했다.

검증 harness와 screenshot은 `/tmp/tech-interview-ai-m1-jwqaf3oa/`에 있다. 제품 dependency나
코드에 browser framework를 추가하지 않았다. Firefox는 localhost만 직접 연결하고 외부
연결은 닫힌 loopback proxy로 제한했다. User UI의 external API 요청은 없다.

### 검증 중 이슈와 한계

- 최초 sandbox의 Firefox version 조회는 snap 권한 제한으로 실패했다. 권한 확장 후 설치된
  브라우저를 사용했고 package를 설치하지 않았다.
- 브라우저 harness의 Unicode XPath와 CSS 대문자 표시 비교 두 곳을 수정한 뒤 전체 흐름이
  통과했다. 제품의 기능 오류는 아니었다.
- Node 기본 test child-process report가 파일 단위 한 건으로 표시되어, 실제 7개 검사 결과가
  드러나도록 `--test-isolation=none`을 사용한다. ESM TypeScript 자동 인식 warning은 남지만
  7개 검사가 실행되고 통과했다.
- 축소 창 screenshot 폭은 Firefox가 허용한 500px이다. 가로 overflow가 없음을 확인했으나
  실제 모바일 기기, Safari/Chromium, 전체 screen reader 접근성 검사를 한 것은 아니다.
- Firefox는 WebDriver session 종료로 닫았고 Next.js/driver는 이번에 시작한 세션에만 Ctrl+C를
  보내 종료했다. Next.js 종료 시 exit 1은 수동 중단 결과다. 기존 process는 종료하지 않았다.

## Limitations

- 채팅 feedback/progress는 reasoning 판정이 아닌 scripted demo이며 completion을 자동 판정하지 않는다.
- 힌트는 고정 첫 항목 하나다. 실제 state/prerequisite/used-hint 기반 선택이나 호출 권한 검사가 없다.
- Review는 local 완료 상태가 있으면 입력/힌트 수를 표시하며, 직접 접속/refresh는 sample debrief다.
- session과 Admin 편집/검토는 React 메모리 상태이며 refresh/화면 이탈 시 초기화된다. 화면 간
  Admin mutation 동기화, 저장, 실제 publish는 없다.
- server-only는 import/bundling 경계다. **Admin/review는 인증 없이 직접 접속 가능**하며 실제
  비공개 데이터나 사용자 데이터를 넣지 않는다. 모든 source URL도 합성 example.com URL이다.

## Next milestone

**M2 — Supabase, persistence, authentication, authorization, category storage**

- Supabase 환경과 category/problem/version 저장 구조 정리.
- authentication 및 서버/DB의 User/Admin 권한 경계 구현.
- attempt 소유권/완료 상태 검사와 persistence 연결.
- mock 조회 경계를 실제 저장소로 교체하고 공개/서버 전용 데이터 경계 검증.
- 범위에 맞는 검증 및 문서 갱신 후 중단. 별도 사용자 지시 전에는 미착수.

## 상태 갱신 규칙

변경과 milestone 완료 시 실제 완료 항목/미구현 항목/검증 결과를 구분해 갱신한다.
M1 완료가 M2의 구현 승인을 의미하지 않는다.

## M0 verification history

### 최초 M0 bootstrap 검증

2026-10-05에 project root에서 다음을 실제 실행했다. 아래 HTTP/HTML 결과는 언어 방향
추가 요청 전의 초기 검증 이력이며 현재 제품 언어는 English다.

| 명령/검사 | 결과 |
| --- | --- |
| `pnpm install` | 성공. 프로젝트 의존성 및 lockfile 생성 |
| `pnpm lint` | 성공 (exit 0). `eslint . --max-warnings=0` |
| `pnpm typecheck` | 성공 (exit 0). `next typegen` 후 `tsc --noEmit` |
| `pnpm build` | 최종 성공 (exit 0). Turbopack compile, TypeScript 검사, 정적 페이지 생성 완료 |
| `pnpm dev` | 성공. `127.0.0.1:3001`에서 Ready 확인 |
| `curl --fail --silent --show-error --max-time 30 --output /tmp/tech-interview-ai-bootstrap.lvNy7Y/dev.html --write-out 'HTTP %{http_code}\n' http://127.0.0.1:3001/` | 성공 (exit 0), HTTP 200 |
| 내려받은 HTML을 Python으로 검사 | 성공. `lang="ko"`, title, h1, 준비 중 안내, stylesheet link 확인 |
| `git rev-parse --show-toplevel` | 이 프로젝트 경로 확인. 상위 디렉터리와 독립 |
| `git check-ignore -v --no-index .env .env.local .env.production .env.example node_modules .next next-env.d.ts tsconfig.tsbuildinfo` | 실제 환경 파일/생성물 제외, `.env.example`만 예외인 것 확인 |
| `ss -ltnp '( sport = :3000 or sport = :3001 )'` | 최초 및 개발 서버 종료 후 두 포트 모두 리스너 없음 |

### 실패와 복구 이력

- 최초 샌드박스 `ss`는 netlink 조회 권한이 없어 포트를 판정할 수 없었다.
  읽기 전용 권한 확장 실행으로 두 포트가 비어 있음을 확인했다.
- 최초 `pnpm ... dlx create-next-app@latest --help`와 registry 접속 진단은
  샌드박스 DNS 제한 (`EAI_AGAIN` / `ERR_PNPM_RESOLVING_NPM_RESOLVER_NETWORK_ERROR`)으로
  실패했다. 네트워크 접근이 가능한 실행으로 공식 CLI `16.3.8`을 임시 다운로드했다.
- 첫 `pnpm build`는 Turbopack의 PostCSS 처리 중 내부 포트 바인딩이 차단되어
  `Operation not permitted`로 실패했다. 기존 생성 캐시를 둔 권한 확장 재시도에서도
  같은 오류가 발생했다.
- 호스트 loopback 바인딩은 정상임을 별도로 확인했다. 실패 시 생성된 `.next`를
  `/tmp/tech-interview-ai-bootstrap.lvNy7Y/next-failed-build`에 보관한 뒤 깨끗한 출력
  디렉터리에서 권한 확장으로 같은 `pnpm build`를 실행해 성공했다. 소스 변경이나
  bundler 교체 없이 복구했다. 이 실행 도구의 샌드박스 제한이며 일반 SSH 명령에
  관리자 권한을 요구하도록 설정한 것은 아니다.
- 의존성 설치는 성공했으며 공식 템플릿의 ESLint `9.39.5`에 deprecation warning이
  표시되었다. 도구나 의존성을 임의로 업그레이드하지 않고 실제 lint 통과를 확인했다.
- 개발 서버는 이번 작업에서 시작한 세션에만 `Ctrl+C`를 보내 종료했다. 이때 pnpm의
  중단 관련 exit 1/`ELIFECYCLE` 메시지가 출력되었으나 요청은 먼저 HTTP 200으로 완료됐다.
  종료 후 포트 해제를 확인했으며 기존 프로세스는 종료하지 않았다.

### 검증 범위

M0에는 test script/framework가 없어 unit/integration/E2E test는 실행하지 않았다.
실제 브라우저 UI/상호작용 검사와 SSH port forwarding은 실행하지 않았다.
HTTP/HTML 확인은 최소 기동 smoke check이며 향후 기능 테스트를 대체하지 않는다.
Next.js `next dev`가 추가한 공식 안내 block은 `AGENTS.md`의 repository 규칙 아래에
유지했다. M0의 사용자 규칙과 범위는 그대로다.

M0 검증 당시 개발 서버는 종료했다. 서버가 꺼져 있다면 `pnpm dev`를 실행한 뒤
VS Code Remote SSH에서 3001 포트를 forward한다. 환경 변수 설정이나 외부 서비스
계정 생성은 M0 실행에 필요하지 않다.

### 언어 방향 반영 후 검증

기존 페이지 문구와 metadata/HTML 언어, 관련 문서만 변경했다. 이 당시에는 M1 기능과 mock content가
미착수 상태였다. 2026-10-05에 변경 후 다음을 실제 확인했다.

| 명령/검사 | 결과 |
| --- | --- |
| `pnpm lint` | 성공 (exit 0) |
| `pnpm typecheck` | 성공 (exit 0) |
| `pnpm build` | 성공 (exit 0). 기존에 확인한 내부 포트 제한 때문에 권한 확장으로 실행 |
| `rg -n '[가-힣]' src` | 한글 검색 결과 없음 |
| 생성된 `.next/server/app/index.html`에서 HTML/metadata/본문 추출 확인 | `lang="en"`, 영어 description과 홈 안내 문구 확인 |

이번 변경에서는 개발 서버나 브라우저를 다시 실행하지 않고 production build의
생성 HTML을 확인했다. 테스트 프레임워크, 기능 테스트, dependency, route는 추가하지 않았다.
기존 bootstrap의 HTTP 확인 기록은 위에 별도로 보존했다.
