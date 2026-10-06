# Supabase setup — M2

2026-10-06 사용자 승인된 GitHub integration으로 M2 schema와 initial catalog migration을 적용했다.
Supabase check 성공과 실제 공개 category 9개/published 문제 3개 조회를 확인했다.
익명 private 데이터 접근은 거절된다. 이후 사용자가 가입 메일 수신과 로그인된 상태의 인터뷰 시작,
메시지/힌트 저장 및 새로고침 복원을 확인했다. 일반 계정의 `/admin` 접근 차단과 첫 관리자 지정 안내 후
`/admin`, `/admin/categories`, `/admin/problems` 화면 열람도 사용자 확인이 끝났다.
현재 프로젝트는 아래 6–7번의 남은 검증을 이어간다. 완료 review, logout/재로그인, private package 내용,
일반 계정의 Admin 하위 route/private table 접근 차단과 사용자 간 격리 등은 **STATUS의 미검증 목록을 따른다.**
기존 migration을 SQL editor에서 다시 실행할 필요가 없다. 실제 검증 결과는 STATUS에 기록한다.

## 1. Project와 환경 변수

Supabase에서 이 서비스용 프로젝트를 생성하거나 기존 프로젝트를 선택한다.
기존 데이터/동명 table이 있으면 migration을 먼저 검토한다. 이 migration은 table을 삭제하거나
기존 schema를 덮어쓰지 않으며, 충돌 시 실패한다. 프로젝트 생성/결제/배포는 자동 수행하지 않았다.

프로젝트의 URL과 publishable key를 확인한다. 위치/명칭이 변경될 수 있으므로
[공식 API key 안내](https://supabase.com/docs/guides/getting-started/api-keys)를 기준으로 찾는다.

`.env.local`이 없을 때만 root `.env.example`을 복사하고 편집한다.

```bash
cd ~/code/tech-interview-ai
test -e .env.local || cp .env.example .env.local
```

| 변수 | 값 |
| --- | --- |
| NEXT_PUBLIC_APP_URL | `http://localhost:3001` (브라우저에서 실제 사용하는 origin) |
| NEXT_PUBLIC_SUPABASE_URL | 선택한 프로젝트 URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | 해당 프로젝트의 publishable key |

legacy anon key를 사용하는 프로젝트라면 그 값을 위 PUBLISHABLE_KEY 변수에 넣을 수 있다.
이름을 하나로 통일하며 별도의 ANON_KEY fallback은 없다. **service_role/secret key는 넣지 않는다.**
서버도 동일한 publishable key + 사용자 cookie session으로 RLS를 적용한다.

`.env.local`과 실제 키를 source, 문서, commit, 채팅에 붙여 넣지 않는다. `.gitignore`는
`.env*`를 제외하고 비어 있는 root `.env.example`만 허용한다. LLM 변수는 M2에서 사용하지 않는다.

## 2. Migration 적용

이 프로젝트는 사용자가 연결한 GitHub integration으로 migration을 적용한다.

- Repository: `shy020501/tech-interview-ai`
- Working directory: `.` (`supabase/`의 부모 경로)
- 배포 기준 branch: `main`
- Deploy to production: 사용자 활성화 확인

`supabase/config.toml`의 project_id는 local 식별자다. 실제 hosted project는 GitHub integration에서
선택하며 project credential을 repository에 넣지 않는다. Auth/API 설정을 변경하는 remotes override는 없다.

다음 파일들이 순서대로 적용된다.

1. `supabase/migrations/20261005000100_m2_foundation.sql`: 9개 table, constraint, trigger, grant, RLS, RPC.
2. `supabase/migrations/20261006000100_m2_initial_catalog.sql`: 기존 M2 초기 category/problem/private package.

Supabase migration runner가 각 파일의 transaction과 migration history를 관리한다. runner 내부에서
transaction을 조기에 끝내지 않도록 migration 자체의 최상위 BEGIN/COMMIT은 사용하지 않는다.
아직 적용되지 않은 foundation 파일을 최초 GitHub 실행 전에 이 방식으로 정리했다.

GitHub의 Supabase check와 실제 DB 결과를 함께 확인한다. 연결 설정만으로 적용 완료라고 판단하지 않는다.
이 경로에서는 SQL editor로 같은 schema 파일을 수동 실행하지 않는다. 수동 실행은 migration history와
실제 schema를 어긋나게 할 수 있다. 이미 수동 적용했다면 reset/재실행 대신 trusted operator가
실제 schema를 비교하고 CLI migration history repair 여부를 먼저 결정한다.

이후 변경은 새로운 timestamp의 migration으로 추가한다. 적용된 파일은 수정하지 않는다.
Supabase 기본 project DB의 migration 적용이며 Next.js 사이트 hosting/production deployment는 수행하지 않는다.
동작 기준은 [공식 GitHub integration 안내](https://supabase.com/docs/guides/deployment/branching/github-integration)를 따른다.

## 3. Seed 내용

- 현재 UI에서 가져온 category 9개와 problem 6개, 각 version/category 연결.
- Published: Drone Dynamics Adaptation, When a New Camera Changes Everything,
  What Makes a Representation Useful? (Advanced 2개/Core 1개).
- draft/needs_review/archived 예제와 private evaluation package 3개.
- 기존 공개 문구, version/category ID, visualization을 그대로 보존했다.
- 기존 debrief 문구도 seed-data의 deferredDebriefs에 보존했다. M2 SQL/runtime에서는 사용하지 않는다.
- 사용자/profile/admin 계정 seed는 없다. 실제 사용자 생성은 Auth로 한다.

`supabase/seed-data.json`은 초기 개발 자료이고 runtime은 DB만 조회한다. seed를 수정한 경우
`pnpm seed:generate`로 SQL을 재생성한다. seed 재실행은 빠진 row만 추가하며 이미 편집한 row는
덮어쓰지 않는다. 기존 DB 콘텐츠 변경은 별도의 migration 또는 후속 관리 workflow에서 수행한다.
`app_private` schema는 Data API exposed schema 목록에 추가하지 않는다.

GitHub production sync는 `seed.sql`을 기본적으로 적용하지 않는다. 그래서 최초 snapshot
`5448b4b`의 동일한 seed 내용을 고정된 `20261006000100_m2_initial_catalog.sql` data migration에
보존했다. 이 파일은 `pnpm seed:generate`로 다시 생성하지 않는다. local/preview에서 seed.sql을
추가 실행해도 같은 row는 건너뛰므로 중복되지 않는다. 새 사용자나 admin 계정을 자동 생성하지 않는다.

## 4. Authentication 설정과 email confirmation

프로젝트 Auth 설정에서 email/password 사용을 활성화하고 signup/confirmation 정책을 결정한다.
메뉴 이름을 고정해서 가정하지 말고 [공식 password Auth 안내](https://supabase.com/docs/guides/auth/passwords)를 참고한다.

- Site URL을 `.env.local`의 NEXT_PUBLIC_APP_URL과 맞춘다.
- 로컬 개발의 Redirect URL 허용 목록에 `http://localhost:3001/auth/callback**`를 추가한다.
  이 suffix wildcard는 callback의 `next` query도 허용한다. 별도 로컬 포트를 사용하면 origin도 맞춘다.
  패턴 의미는 [공식 Redirect URL 안내](https://supabase.com/docs/guides/auth/redirect-urls)를 따른다.
  실제 프로젝트에서 confirmation 완료 후 callback으로 돌아오는지는 별도 검증해야 한다.
- `localhost`와 `127.0.0.1`은 cookie origin이 다르므로 브라우저 주소를 일관되게 사용한다.
- confirmation이 필요한 경우 signup 화면은 “Check your email to confirm your account.”를 표시한다.
- 기본 confirmation 링크 + PKCE callback은 가입을 시작한 브라우저의 verifier cookie를 필요로 한다.
  링크를 같은 브라우저에서 열고, 성공하면 세션을 저장한 뒤 원래의 허용된 내부 경로로 이동한다.
- confirmation을 끈 개발 프로젝트는 signup 성공 후 바로 로그인 상태가 될 수 있다.
- 메일 발송 정책/제한/SMTP 설정은 프로젝트에서 확인한다. 2026-10-06 사용자가 가입 메일 수신을 확인했다.
  자동 메일 발송 테스트나 SMTP 설정 변경은 수행하지 않았다.

다른 브라우저에서의 confirmation이 필요하면 제공된 `/auth/confirm` route와 email template을 사용할 수 있다.
Confirm signup template의 링크를 다음 형태로 설정한다. 이는 프로젝트 소유자가 선택적으로 적용한다.

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your account</a>
```

이 route는 signup/email token만 검증하며, private 데이터나 role을 반환하지 않는다.
이메일 링크/토큰을 로그에 복사하지 않는다. token-hash 및 cookie 흐름은
[공식 SSR 가이드](https://supabase.com/docs/guides/auth/server-side/nextjs)를 참고한다.

## 5. 첫 일반 사용자와 Admin

1. 개발 서버를 실행하고 `/signup`에서 일반 사용자로 가입한다.
2. 프로젝트 정책에 따라 이메일을 확인하고 `/login`에서 로그인한다.
3. auth.users 생성 trigger가 profiles를 role=user로 만든다. signup metadata로 role을 지정할 수 없다.
4. 프로젝트의 trusted SQL editor에서 해당 사용자의 정확한 UUID를 확인한 뒤 아래 한 row만 승격한다.

```sql
update public.profiles
set role = 'admin'
where user_id = 'REPLACE_WITH_VERIFIED_USER_UUID'::uuid
  and role = 'user'
returning user_id, role;
```

UUID placeholder를 실제 확인한 값으로 바꾸고 반환 row가 맞는지 확인한다. 모든 사용자를 일괄 승격하지 않는다.
브라우저/API에 role 승격 endpoint는 없다. app admin도 profiles.role을 직접 UPDATE할 권한이 없다.
다시 화면을 열면 서버가 최신 DB role을 확인한다. 미인증 Admin 접근은 login으로, 일반 계정은 404로 처리한다.

## 6. RLS 확인

아래 query에서 9개 table 모두 `rowsecurity=true`인지 확인한다.

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'categories', 'problems', 'problem_versions',
    'problem_categories', 'problem_evaluation_packages', 'attempts', 'attempt_messages', 'hint_events')
order by tablename;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

이 목록만으로 격리가 검증되지는 않는다. 별도 개발/검증 프로젝트의 SQL editor에서
`supabase/tests/rls.sql` 전체를 실행한다. synthetic 사용자/문제를 transaction에 만들고
anon/user A/user B/admin 역할별 허용/거절, role 위조 방지, 다른 사용자 session 격리,
메시지/힌트 재시도, 버전 고정, 완료 후 변경 거절을 검사한 뒤 rollback한다. 예외가 나면 실패다.
CLI/pgTAP extension은 필요 없다. 이 SQL은 로컬 PGlite의 최소 Auth stub에서 통과했지만,
**hosted Supabase에서 이 전체 SQL suite를 실행한 것은 아니다.** 실제 익명 Data API 차단 결과와도 구분한다.

일반 계정에서 private table SELECT는 row가 없거나 권한 거절이어야 한다. 직접 attempt/message/hint
INSERT/UPDATE/DELETE는 거절되어야 하며 본인 확인 RPC만 변경을 허용한다. Admin에게도 다른 사용자의
attempt 조회 권한을 암묵적으로 주지 않는다. reasoning_state는 소유자에게도 직접 column SELECT를 허용하지 않는다.

## 7. 로컬 실행과 브라우저 검증

환경 변수 설정을 마친 뒤 기존 개발 서버를 실행한 터미널에서 정상 종료하고 다시 시작한다.
다른 프로세스를 임의로 종료하지 않는다. `NEXT_PUBLIC_*`를 바꾼 production build는 다시 생성해야 한다.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

VS Code Remote SSH의 Ports에서 3001을 forward하고 `http://localhost:3001`을 연다.

| Session | 확인 |
| --- | --- |
| 로그인 없음 | `/problems`의 published 목록, 문제 본문/visualization 표시, 저장 동작은 Sign in 안내 |
| 일반 user A | signup/login/logout, Start interview, 메시지/고정 hint, reload/resume, Finish 후 review |
| 일반 user B | A의 attempt ID로 review/action/Data API 접근 불가 |
| 일반 user | `/admin` 및 하위 route에서 Admin UI/data 수신 불가, private package 직접 SELECT 불가 |
| admin | `/admin/categories`, `/admin/problems` 및 private package 조회 가능 |
| public | draft/needs_review/archived slug와 이전 미공개 version 직접 조회 불가 |

브라우저 Network의 일반 문제 HTML/RSC/초기 client props에 reference answer, rubric,
misconceptions, 전체 hint ladder, evaluation examples가 없는지 확인한다. 클릭한 고정 hint와
이전에 본인이 요청해 저장된 hint는 재개 시 표시되어도 된다. `/review`에서도 reference answer는 아직 제공하지 않는다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:boundaries
```

build/정적 경계 검사 통과가 live RLS/Auth/persistence 검증의 대체는 아니다.
최종 실행 결과와 미검증 항목은 [STATUS](STATUS.md)에 별도로 기록한다.
