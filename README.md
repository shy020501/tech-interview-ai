# tech-interview-ai

기술적 판단과 reasoning을 채팅으로 연습하는 technical interview 서비스.
Advanced / Scenario-based 질문을 핵심 콘텐츠로 한다.

현재는 **M2: Supabase DB/Auth + User/Admin authorization + persistence integration** 단계다.
기존 UI 스타일을 보존하고 데이터 저장/인증 계층을 연결했다. 실제 LLM/crawling/웹서비스 배포는 없다.
GitHub integration으로 Supabase schema와 초기 catalog를 적용했고 공개 문제 조회를 확인했다.
사용자가 가입 메일 수신과 로그인된 인터뷰의 메시지/힌트 저장, 새로고침 복원을 확인했다.
일반 계정의 `/admin` 접근 차단과 첫 관리자 지정 안내 후 Admin/Categories/Problems 화면 열람도 확인했다.
관리자의 정답/rubric 열람, 인터뷰 완료 review, logout/재로그인 후 완료 기록 유지도 사용자 확인이 끝났다.
hosted SQL Editor의 RLS 검사도 사용자 실행 기준 통과로 기록했다. 실제 Auth 세션의 HTTP 격리/session 등
미검증 범위는 [현재 상태](docs/STATUS.md)에 구분해 기록한다.
다음 확인 순서는 [Supabase 설정 안내](docs/SUPABASE_SETUP.md)의 Admin/RLS/브라우저 검증을 따른다.
새 Supabase 프로젝트를 연결하는 경우에는 해당 문서의 migration 설정도 필요하다.

## 개발 환경

- 프로젝트: `/home/seunghyo/code/tech-interview-ai`
- 검증 환경: Node.js `v24.21.0`, pnpm `12.5.1`
- Next.js App Router `16.3.8`, React `19.2.8`, TypeScript `5.9.3`, Tailwind CSS `4.3.3`, ESLint `9.39.5`
- 소스: `src/`, import alias: `@/*` → `src/*`
- 개발 주소: `http://127.0.0.1:3001`

기존 Node.js/package manager를 사용하며 global package 설치나 업그레이드는 필요 없다.
아래 명령은 이 Linux/SSH 환경 기준이다. lockfile과 `packageManager`를 유지한다.

```bash
cd ~/code/tech-interview-ai
pnpm install --frozen-lockfile
pnpm dev
```

의존성이 이미 설치되어 있으면 `pnpm dev`만 실행하면 된다. Supabase가 미설정이면
서비스 unavailable 안내와 비활성 로그인 폼을 표시하며, mock DB fallback은 사용하지 않는다. 종료는 실행한 터미널에서
`Ctrl+C`를 누른다. 포트 점유 여부를 먼저 확인할 때는 다음 명령을 사용한다.

```bash
ss -ltnp '( sport = :3000 or sport = :3001 )'
```

3001이 사용 중이면 기존 프로세스를 종료하지 말고 사용 가능한 포트를 확인한 뒤
대체 포트를 결정한다. 필요하면 `pnpm dev --port 3002`처럼 명시적으로 지정한다.

## SSH / VS Code에서 접속

원격 서버에서 `pnpm dev`를 실행한 뒤 VS Code Remote SSH의 **Ports** 패널에서
원격 포트 `3001`을 forward하고 로컬 브라우저에서 `http://127.0.0.1:3001`을 연다.
VS Code가 다른 로컬 포트를 지정하면 Ports 패널의 전달 주소를 사용한다.

일반 SSH라면 로컬 컴퓨터에서 다음과 같이 터널을 열 수 있다.

```bash
ssh -N -L 3001:127.0.0.1:3001 user@server
```

`user@server`는 실제 SSH 접속 대상으로 바꾼다. 로컬 3001도 사용 중이면 터널의
첫 포트만 `13001` 등으로 바꾸고 해당 로컬 주소로 접속한다. 서버는 loopback 주소에
바인딩하므로 외부 공개나 서버 방화벽 변경 없이 확인할 수 있다.

## 명령과 검증

| 명령 | 목적 |
| --- | --- |
| `pnpm dev` | `127.0.0.1:3001`에서 개발 서버 실행 |
| `pnpm lint` | ESLint 실행, warning도 실패로 처리 |
| `pnpm typecheck` | Next.js route type 생성 후 `tsc --noEmit` |
| `pnpm test` | Node 내장 runner로 domain/auth validation/seed/정적 정책 검사 |
| `pnpm build` | production build 생성; 배포는 하지 않음 |
| `pnpm check:boundaries` | build 후 client import/browser JS/정적 public HTML 경계 검사 |
| `pnpm seed:generate` | 보존한 seed 자료로 초기 SQL 재생성 (DB 적용 안 함) |
| `pnpm start` | build 결과를 같은 loopback 주소/포트에서 로컬 확인 |

`next typegen`을 먼저 실행하여 새 checkout에서도 generated route/layout type을
만든 뒤 타입 검사한다. Next.js 명령에는 이 프로젝트의 명령 실행에만 적용되는
`NEXT_TELEMETRY_DISABLED=1`을 지정했다. 외부 폰트도 사용하지 않는다.

추가 test framework는 설치하지 않았다. `pnpm test`는 기존 Node.js 24의 TypeScript
type stripping과 내장 test runner를 사용한다. 단일 process 실행은 이 환경의 자식 process
test reporting 제약을 피하기 위한 설정이다. 현재 ESM TypeScript 자동 인식 warning이
출력될 수 있지만 검사는 통과한다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:boundaries
```

`check:boundaries`는 build가 필요하다. 현재 동적 DB 응답의 실제 권한/누출 여부까지 검증하는
도구는 아니다. 연결 후에는 Supabase RLS SQL 및 브라우저 Network 검사도 수행한다.

## M2 화면과 확인 순서

| Route | 내용 |
| --- | --- |
| `/` | `/problems`로 redirect |
| `/problems` | category/type/difficulty/search 필터, Advanced 우선 목록 |
| `/problems/drone-dynamics-adaptation` | 대표 3열 인터뷰, 시스템 도식, mock 채팅/힌트 |
| `/problems/camera-shift-diagnosis` | Computer Vision Advanced 문제 |
| `/problems/useful-representations` | Core 문제 |
| `/review` | 로그인 후 본인의 최근 완료 회차, 저장된 메시지/힌트 조회 |
| `/login`, `/signup` | email/password 로그인/가입 |
| `/admin` | admin 전용 DB 문제 지표 + pipeline demo dashboard |
| `/admin/sources` | source screening mock |
| `/admin/candidates` | reject/undo와 draft 연결 |
| `/admin/problems` | DB 문제 상태/version, local preview와 admin-only private package 조회 |
| `/admin/categories` | 실제 DB category tree |
| `/admin/evals` | 잘못된 mock 판정과 human review |

User는 공개된 문제를 로그인 없이 읽을 수 있다. **Start interview**에는 로그인이 필요하고,
message/hint를 저장한 후 새로고침하면 같은 version의 진행 중 attempt를 복원한다.
**Finish interview** 후 review에서 본인의 저장된 대화/힌트를 확인한다. reference answer와
실제 평가 debrief는 아직 공개하지 않는다. 피드백/progress는 시연용이며 실제 LLM이 없다.

모든 Admin route는 login + DB의 admin role이 필요하다. 일반 사용자는 404로 거절된다.
source/candidate/eval은 demo이며 source fetch나 evaluator 호출을 하지 않는다. 기존 editor의
**Update local preview**는 저장/publish하지 않는다고 명시한다. full content lifecycle은 M3 범위다.

## 데이터 경계와 환경 설정

- `src/lib/data/`: UI가 사용하는 server-only DB repository.
- `src/lib/auth/`, `src/proxy.ts`: cookie refresh, 서버 identity/role 검사, 안전한 redirect.
- `supabase/migrations/`: 9개 table, RLS/grants, profile trigger, 원자적인 본인 attempt RPC.
- `supabase/seed-data.json`: M2 시작 당시 UI 자료를 보존한 seed 전용 입력. runtime에서 import하지 않는다.
- `problem_evaluation_packages`: admin-only. User initial payload에 answer/rubric/전체 ladder를 보내지 않는다.
- 원자적 RPC가 메시지, deterministic feedback, 고정 hint를 저장한다. runtime service-role key는 없다.
- 제품 표시명은 Core/Advanced, 내부 type key는 fundamental/applied다. 한국어/i18n은 없다.

`.env.local`에는 Supabase URL, publishable key와 app URL을 설정한다. `.env.example`에는 실제 값을
넣지 않는다. DB 생성/seed/Auth/최초 admin/RLS 검증 순서는 [SUPABASE_SETUP](docs/SUPABASE_SETUP.md)을 따른다.
실제 환경 파일은 Git에서 제외하며 일반 runtime에 elevated key를 설정하지 않는다.

## 문서

- [AGENTS.md](AGENTS.md): repository 작업 규칙과 milestone 경계
- [제품 명세](docs/PRODUCT_SPEC.md): 사용자 경험과 콘텐츠/분류 방향
- [Architecture](docs/ARCHITECTURE.md): 데이터/권한 경계, LLM, 평가, source pipeline
- [현재 상태](docs/STATUS.md): 완료 항목, 미구현 범위, 실제 검증 결과
- [Supabase 설정](docs/SUPABASE_SETUP.md): project/env/migration/seed/Auth/admin/RLS 검증

다음 milestone은 M3의 Admin content lifecycle과 problem package 관리다.
M2 이후 별도 사용자 지시 전까지 진행하지 않는다.

## 공식 참고 자료

- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)
- [create-next-app CLI](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [Next.js CLI와 typegen](https://nextjs.org/docs/app/api-reference/cli/next)
