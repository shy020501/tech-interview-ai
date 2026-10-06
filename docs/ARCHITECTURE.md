# Architecture 방향

## 적용 범위

M0의 Next.js App Router, TypeScript, Tailwind CSS, ESLint 구성을 유지한다.
**M2는 기존 UI 위에 Supabase DB/Auth와 persistence/authorization을 연결한다.**
M1 이후의 현재 layout, CSS, typography, panel sizing이 source of truth다.
LLM provider/evaluator, source worker/job, 전체 content lifecycle은 구현하지 않는다.
실제 Supabase credential이 없는 환경에서는 연결 코드를 준비하되 live 검증과 구분한다.

## 애플리케이션과 권한

초기에는 사용자와 관리자를 별도 웹사이트로 배포하지 않고 같은 Next.js app에서
route와 책임을 나눈다.

| 영역 | 목표 routes | 역할 |
| --- | --- | --- |
| User | `/` → `/problems`, `/problems`, `/problems/[slug]`, `/review` | 문제 선택, 연습, 종료 후 복습 |
| Admin | `/admin`, `/admin/sources`, `/admin/candidates`, `/admin/problems`, `/admin/categories`, `/admin/evals` | 콘텐츠 제작, 검수, publish, evaluator 품질 확인 |

사용자는 category/type/difficulty로 문제를 선택하고 문제와 visualization을 본다.
reasoning을 채팅으로 입력하고 progress를 확인하며 필요할 때 Hint를 요청한다.
문제 종료 후 debrief를 확인한다.

Admin은 자동/수동으로 발견한 source 확인, source candidate 검토, 문제 draft
생성/수정, reasoning rubric·misconception·hint ladder 검수, category 설정,
사용자 화면 preview, publish, evaluator 품질 확인을 담당한다.
자동 생성한 문제는 human approval 없이 publish하지 않는 것이 기본 원칙이다.
승인은 검토한 draft version에 연결하고 승인 뒤 수정한 내용은 다시 검토한다.

route 분리는 권한 검사의 대체가 아니다. M2는 admin layout뿐 아니라 모든 Admin page와
private data service에서 requireAdmin()을 호출한다. 미인증은 /login으로 redirect하고
로그인된 일반 사용자는 notFound()로 거절한다. role은 profiles의 DB 값이며 metadata를
사용하지 않는다. 사용자 작업은 세션 소유권/상태를 확인하고 DB의 RLS 및 제한된 RPC로 다시 검증한다.

## Problem package와 공개 경계

| Public: 연습 중 공개 가능한 데이터 | Server-only: 정답/평가 데이터 |
| --- | --- |
| scenario/question | reference answer |
| assumptions | reasoning rubric / reasoning graph |
| visualization | acceptable alternative approaches |
| category, tags, competency 표시 정보 | misconceptions |
| question type | hint ladder |
| difficulty | completion criteria |
| | evaluation examples |

공개 응답은 허용된 필드만 선택한 별도 projection으로 만든다. 원본 문제 객체를
그대로 직렬화한 뒤 UI에서 숨기는 방식은 사용하지 않는다. 서버 전용 package는
client import, public asset, serialized Server Component props, 일반 사용자 API,
로그에 포함되지 않도록 한다. 향후 서버 모듈의 import 경계와 응답 계약을 검증한다.

M2 Hint 요청은 DB 함수가 본인 attempt와 진행 상태를 확인한 후 고정 첫 힌트 하나만
기록/반환한다. 전체 ladder/rubric은 전송하지 않는다. M2 review는 소유권과 completed
상태를 검사하고 저장된 대화/사용한 힌트만 제공한다. reference answer와 평가 debrief 공개는
후속 milestone까지 제한한다. 향후에도 별도의 검증된 projection만 사용한다.

## 분류

category는 DB 기반 계층 구조다. category ID와 부모 관계를 중심으로 확장하며 코드
enum으로 분야를 고정하지 않는다. 하나의 문제를 여러 category/tag에 연결할 수
있어야 한다. Core/Advanced인 Question Type과 Objective Design, Failure
Diagnosis 등의 Competency는 category와 별개다. Core는 기본 개념 질문, Advanced는
scenario에서 응용력을 요구하는 질문이다. 표시명은 `questionTypeLabels`에서 관리하고
기존 semantic key인 `fundamental`/`applied`를 유지한다. User/Admin/필터는 같은 mapping을
공유하며 표시명 변경이 data contract나 분기 조건을 바꾸지 않는다. Question Type과
Difficulty는 독립적이므로 Advanced 유형이 Intermediate 난이도일 수 있다.
M2 schema는 categories, problems, problem_versions, problem_categories로 이 관계를 구현한다.

## 언어와 국제화 방향

### 기본 제품 언어와 M2 범위

기본 언어는 **English**다. MVP는 영어만 제공하고 Korean은 향후 optional locale로
추가할 수 있다. 개발 지시와 repository 문서의 언어는 제품 표시 언어와 별개다.
User/Admin UI, navigation/button label, empty state, validation message와 mock
interview question, feedback, hint, review/debrief, source/candidate/problem content는
특별한 이유가 없는 한 영어로 작성한다. 현재 root layout은 `lang="en"`을 사용한다.

M2에서도 한국어 번역, locale switcher, 자동 번역, browser locale 자동 감지, bilingual
UI, translation API, locale별 routing은 구현하지 않는다. `/problems`, `/admin/problems`
같은 locale prefix 없는 route 방향을 유지하며 `/en/problems`, `/ko/problems` 또는
`[locale]` route를 추가하지 않는다. 전체 i18n framework나 번역 catalog도 도입하지 않는다.

### Domain identifier와 표시 문구

core problem/evaluation logic는 가능한 한 언어와 독립적으로 설계한다. 사용자에게
보이는 영어 문구를 business logic의 identifier나 비교 조건으로 사용하지 않는다.

| 대상 | 안정적인 내부 값의 예 | 현재 영어 표시명 예 |
| --- | --- | --- |
| 검수 상태 | `needs_review` | Needs Review |
| 공개 상태 | `published` | Published |
| category ID | `physical-ai` | Physical AI |
| competency ID | `objective_design` | Objective Design |

분기는 `status === "needs_review"`처럼 내부 key로 판단하고 label은 UI에서만
표현한다. enum/status/internal key에 `Needs Review`, `Published Problem`,
`Physical AI Category` 같은 표시 문장을 값으로 사용하지 않는다.

category는 개념적으로 `{ id: "physical-ai", name: "Physical AI" }`처럼 ID와 현재
영어 표시명을 분리한다. 표시명이 바뀌어도 ID는 유지하며 이름에서 ID를 매번 다시
만들지 않는다. category ID는 DB 기반 taxonomy의 안정적인 참조이며 category enum을
고정하라는 의미가 아니다. 향후 표시명을 locale별로 확장할 수 있도록 하되 M2에서
실제 `labels` 객체나 번역 자료 구조는 구현하지 않는다.

problem ID, problem version ID, category ID, rubric node ID, source ID, attempt ID,
evaluation status, competency ID는 표시 언어와 독립적으로 유지한다. 평가 진행 상태,
rubric 충족 여부, completion 판정은 번역된 문구가 아니라 이 identifier로 연결한다.

여러 component에서 반복되는 UI 문자열은 필요할 때 작은 constants/module 수준으로
공유한다. 표현을 한곳에서 수정할 수 있게 하되 화면 문구를 domain 계층에 끌어들이거나
현재 필요 없는 번역 framework를 만들지 않는다.

### 향후 문제 콘텐츠 localization

localized content는 안정적인 problem/category/rubric identifier와 분리한다.
문제의 identity와 version을 유지하면서, 향후 개념적으로 다음 내용의
`ProblemContent`를 locale별로 연결할 수 있어야 한다.

- locale
- title, shortDescription
- scenario, question, assumptions
- referenceAnswer, hints

이는 설계 방향이며 M2에서 localized DB schema나 locale별 `ProblemContent`를
구현하지 않는다. seed/mock content를 만들 때는 영어만 작성한다.

이 개념적 콘텐츠 목록이 하나의 공개 응답을 뜻하지는 않는다. reference answer와
hint ladder는 계속 서버 전용이며, 검수된 힌트 요청과 종료 후 debrief에서 허용한
부분만 공개한다. locale이 추가되어도 기존 데이터/권한 경계를 유지한다.

문제의 기술적 의미가 중요하므로 향후 한국어 지원은 자동 번역 결과를 그대로 신뢰하기보다
검수된 localized content를 우선한다. scenario의 가정, reference answer의 의미,
rubric과 hint 단계가 원문과 일치하는지 검수하고 technical terminology는 정확성을
우선한다. 언어별 표현 차이가 core 평가 기준이나 안정적인 ID를 바꾸도록 설계하지 않는다.

## Authoring과 LLM provider

| 구분 | Offline authoring | Online evaluation |
| --- | --- | --- |
| 목적 | 문제와 검수 가능한 evaluation package 제작 | 사용자 reasoning의 rubric 충족 여부 판단 |
| 호출 특성 | 낮은 빈도의 비동기 job | 사용자 수/메시지에 비례하는 반복 요청 |
| 선택 기준 | 비용보다 정확도를 우선, 강한 모델 사용 가능 | 저렴하고 빠른 lightweight LLM 우선 |
| 결과 | human review 대상 draft | 서버가 검증하는 structured evaluation |

provider-agnostic interface를 경계로 사용한다. M2는 `EvaluationResult` 같은 데이터
계약만 정의하며 다음 provider interface와 adapter는 문서상의 개념이다.

```text
EvaluatorProvider
  evaluate(input) -> EvaluationResult

AuthoringProvider
  generateProblemPackage(input) -> ProblemDraft
```

business logic은 특정 회사 SDK, model name, provider 고유 응답 형식에 의존하지
않는다. 향후 서버 adapter가 provider 요청/응답과 공통 계약 사이를 변환하고,
provider/model 설정은 환경 설정으로 주입한다. authoring, evaluator, escalation은
각각 독립적으로 선택할 수 있다.

후보는 OpenAI, Google, Anthropic, DeepSeek, Qwen, Mistral, OpenRouter 기반 provider,
기타 저가 LLM API, 장기적으로 self-hosted model이다. 실제 provider는 검수된 평가
예제로 품질, 정답 유출 여부, latency, 비용, structured output 준수 여부를 benchmark한
뒤 선택한다. M2에서도 후보를 선택하거나 SDK를 설치하거나 API를 호출하지 않는다.

## Evaluation scalability

1. 매 사용자 message마다 큰 LLM이 문제 전체를 새로 풀지 않는다. 문제 제작 시
   rubric과 핵심 평가 근거를 담은 compact evaluation package를 미리 생성·검수한다.
2. evaluator는 현재 발언이 rubric의 어떤 항목을 충족하는지, 어떤 misconception을
   드러내는지, 어떤 근거로 판단했는지에 집중한다.
3. 전체 대화를 매번 전송하지 않는다. 서버가 보관한 누적 reasoning state와 필요한
   최근 메시지, 필요한 평가 package 부분을 입력으로 사용한다.
4. model의 결과는 structured output으로 받고 서버에서 형식, 허용된 rubric ID,
   증거와 state 전이의 유효성을 확인한다. output schema는 후속 milestone에서 정한다.
5. progress 계산과 completion 판정은 가능하면 서버 코드가 rubric/state와 검수된
   completion criteria를 바탕으로 수행한다. self-reported confidence만으로 정답을
   확정하지 않는다. 타당한 alternative approach도 평가 기준에 포함한다.
6. 일반 feedback은 가능한 한 template/rule 기반으로 만들며 정답이나 다음 해결 단계가
   섞이지 않도록 한다. 숨은 rubric이나 model 원본 출력을 client에 그대로 반환하지 않는다.
7. Hint는 사용자의 명시적인 요청이 있을 때만 검수된 hint ladder와 state를 기반으로
   서버에서 선택한다. 자동 feedback 경로와 hint 요청 경로를 구분한다.
8. 어려운 사례만 stronger evaluator로 escalation할 수 있도록 경계를 둔다. 선택한
   provider에 따른 timeout, 제한된 retry, 비용/호출 한도와 실패 처리는 구현 시 정한다.
   evaluator 실패를 정답 처리로 간주하지 않는다.

## Source discovery와 publish

```text
Source discovery
  -> relevance screening
  -> question candidate
  -> problem draft
  -> human review
  -> publish
```

source는 기존 interview question일 필요가 없다. papers, technical blogs, YouTube,
interview reports, public educational material, approved external sources를
question-generating source로 활용할 수 있다. 예를 들어 논문의 design decision을
역으로 구성하여 선택의 근거와 trade-off를 묻는 scenario question을 만들 수 있다.

향후 source의 URL, 출처와 활용 근거를 추적하고 허용된 접근 방식으로 수집한다.
Instagram 등 scraping 제약이 있는 플랫폼의 무단 대량 crawling을 전제로 설계하지
않는다. 자동 생성물은 draft로 남기고 human approval 이후에만 사용자에게 공개한다.
M2에도 source/candidate fixture와 검토 UI만 있으며 실제 source 호출, scheduler,
crawler, candidate 생성, authoring job을 구현하지 않는다.

## M2 Backend와 directory

UI → server-only data service → Supabase 흐름을 사용한다. 일반 runtime은 publishable key와
인증된 사용자의 cookie session만 사용한다. service-role/secret key는 요구하지 않는다.

| 경로 | 책임 |
| --- | --- |
| `src/lib/supabase/` | browser/server client와 환경 설정 |
| `src/proxy.ts` | getClaims로 세션 refresh, cookie와 cache header 전달 |
| `src/lib/auth/` | getCurrentUser/Profile, requireUser/Admin, 입력/redirect 검사 |
| `src/app/actions/` | signup/login/logout, attempt/message/hint/finish server action |
| `src/app/auth/` | PKCE callback / 선택적 email token-hash confirmation |
| `src/lib/data/` | DB category, 공개/관리자 problem, 본인 attempt 조회 |
| `src/types/database.ts` | migration에 대응하는 수동 DB 계약; 연결 후 생성 타입으로 교체 가능 |
| `supabase/migrations/` | table, constraint, trigger, grant, RLS, 제한된 RPC |
| `supabase/seed-data.json`, `supabase/seed.sql` | 현재 UI를 보존한 개발 seed와 생성 SQL; runtime import 금지 |
| `src/mocks/server/pipeline.ts` | Admin sources/candidates/evals의 명시적인 demo |
| `src/mocks/interview.ts` | M1 domain test fixture; M2 채팅 runtime에서 미사용 |
| `supabase/tests/rls.sql` | 실제 프로젝트에 연결한 후 실행하는 rollback 기반 권한 검사 |

Next.js 16의 `proxy.ts`와 async `cookies()`를 사용한다. session은 요청별 client를 생성하고
Proxy는 refresh만 담당한다. 서버 identity는 Auth 서버의 `getUser()`로 확인한다.
`getSession().user`나 클라이언트 상태는 authorization 근거가 아니다. session 응답은
private/no-store이며 사용자별 조회를 전역 cache에 넣지 않는다. React cache는 요청 내 중복 조회를 줄인다.

인증은 email/password다. confirmation이 필요하면 안내를 표시하고 PKCE callback에서 세션을
교환한다. token_hash 방식의 선택적 confirmation route도 제공한다. redirect는 local allowlist로
제한하고 Auth 내부 오류/키/토큰은 제품 문구나 로그에 출력하지 않는다.

환경이 없으면 공개 페이지는 unavailable 상태, auth 폼은 비활성 상태를 보여 준다.
임의 프로젝트/credential이나 mock DB fallback은 만들지 않는다. 현재 CSS 파일은 변경하지 않는다.

## Database와 RLS

사용자가 활성화한 GitHub integration의 main push로 연결된 Supabase DB에 migration을 적용한다.
runner가 transaction/history를 관리하며 적용된 migration은 수정하지 않는다. 기본 production sync에서
seed.sql은 제외되므로 M2 초기 catalog를 별도 immutable data migration으로 기록했다.
기존 row는 덮어쓰지 않는다. 앱 runtime에 DB 관리자 credential을 추가하지 않고 기존 publishable key와
사용자 session 경계를 유지한다. 이는 웹서비스 hosting이나 M3 authoring/publishing 구현이 아니다.

값이 변경될 가능성이 있는 status/type/role은 native enum 대신 text + CHECK를 사용한다.
CHECK를 교체하는 migration으로 확장하고 TypeScript union과 맞춘다. category는 enum이 아니다.
JSONB는 visualization, private rubric/ladder/examples, 향후 reasoning state처럼 중첩 계약에만 쓴다.

| Table | 구조/관계 | 읽기 | 변경 |
| --- | --- | --- | --- |
| profiles | auth.users 1:1, default user | 본인 최소 profile | role 변경은 trusted SQL만 |
| categories | text ID, parent_id 자기 참조, 순환 방지 | public | admin |
| problems | identity/slug/status/current_version_id | published public; 본인 기존 attempt의 identity; admin | admin |
| problem_versions | problem별 version_number, 공개 콘텐츠 | published current version; 본인 기존 attempt의 고정 version; admin | admin, attempt가 참조하면 변경/삭제 금지 |
| problem_categories | many-to-many, primary 부분 unique index | published 또는 본인 attempt의 문제; admin | admin |
| problem_evaluation_packages | version 1:1, private JSONB | admin만 | admin, attempt가 참조하면 변경/이동/추가 금지 |
| attempts | owner + version FK, 기본 reasoning_state | 본인, reasoning_state column 제외 | 본인 확인 RPC만 |
| attempt_messages | attempt FK, sequence_number 순서 | 본인 attempt | 본인 확인 RPC만 |
| hint_events | attempt FK, hint_id 중복 방지 | 본인 attempt | 본인 확인 RPC만 |

모든 table에 RLS가 있고 grants도 명시한다. profile role 수정 권한은 app admin에게도 주지 않는다.
admin에게 다른 사용자의 attempt 읽기 권한을 암묵적으로 부여하지 않는다. profiles 생성 trigger는
사용자가 편집 가능한 metadata를 무시하고 role=user로 생성한다. 최초 admin은 signup 뒤 trusted SQL로 지정한다.

`app_private.is_admin()`은 고정 search_path의 작은 SECURITY DEFINER 함수로 현재 auth.uid의 DB role만
확인한다. app_private schema는 Data API에 노출하지 않는다. 일반 앱에 elevated key를 넣지 않는다.

attempt table들의 직접 INSERT/UPDATE/DELETE 권한은 없다. 대신 아래 SECURITY DEFINER RPC만
명시적으로 authenticated 역할에 허용하며 PUBLIC/anon 실행 권한을 회수한다. 각 함수는 auth.uid,
소유권/공개 상태, 진행 상태, 입력 제한을 다시 검사한다. 객체명을 schema-qualified로 쓰고 search_path는 비운다.
이렇게 하면 브라우저가 직접 Data API를 호출해도 role/interviewer 메시지/힌트/평가 state를 위조할 수 없다.

### Version과 category 무결성

- problems.current_version_id는 composite FK로 자기 problem의 version만 참조한다.
- attempts에는 효율적인 resume를 위한 problem_id도 두되 composite FK로 version/problem 일치를 강제한다.
- 시작 시 current published version에 고정한다. 이후 current_version_id 변경은 기존 attempt를 이동시키지 않는다.
- version/package를 잠그는 trigger와 시작 RPC가 경합 시에도 기존 attempt의 내용을 바꾸지 못하게 한다.
- 한 문제의 primary category는 DB 부분 unique index로 최대 하나이며 data projection에서 정확히 하나를
  확인한다. draft 생성/편집 시 최소 한 개를 맞추는 전체 workflow는 M3에서 관리한다.
- category parent 관계는 깊이가 고정되지 않으며 self-reference/cycle을 검사한다. 필터는 descendant 및
  secondary category를 포함하고 같은 문제를 branch 내 중복 집계하지 않는다.

## Attempt persistence와 review

1. 공개 문제 열람에는 인증이 필요 없다. Start interview 이후에는 requireUser와 RLS가 필요하다.
2. start_interview는 DB의 사용자/문제를 잠그고 기존 in_progress attempt를 반환하거나 current version으로 생성한다.
   사용자·문제당 활성 attempt 하나의 unique index가 중복 생성을 막는다. 완료 후 여러 회차를 만들 수 있다.
3. 문제를 다시 열면 본인의 활성 attempt와 고정된 version 내용으로 복원한다. 공개 catalog에는 current version을 쓴다.
4. append_interview_turn은 본인 attempt를 잠그고 사용자 메시지 → 고정 mock feedback을 한 transaction에 저장한다.
   request_id로 네트워크 실패 후 재시도가 중복 저장되지 않게 한다. 클라이언트는 성공 후에만 입력을 지운다.
5. request_interview_hint는 명시적인 클릭 후 첫 힌트 하나와 system_hint 메시지를 원자적으로 저장한다.
   재요청은 같은 결과이며 전체 ladder는 반환하지 않는다. adaptive hint selection은 없다.
6. finish_interview는 completed_at을 기록하고 이후 새 메시지를 거절한다. 성공 후 /review?attempt=...로 이동한다.
7. review는 본인의 completed attempt만 허용한다. /review에는 최근 완료 20개를 표시한다. 완료는 사용자 선언이지
   rubric 충족 판정이 아니므로 reference answer/evaluation debrief는 아직 공개하지 않는다.

AttemptSession은 메시지/사용한 힌트/demo progress만 포함한 projection이다. reasoning_state는 browser에
전달하지 않는다. 현재 progress는 서버가 메시지 수로 0 → 60 → 70 → 75를 표시하는 시연 값이다.
M2의 fixed feedback 문구는 원자적 RPC 내부에 있으며 provider/model/LLM 호출은 없다.

향후 EvaluationResult의 node별 evidence/contradiction을 검증한 서버가 ReasoningState를 갱신한 뒤
progress를 계산한다. 판정은 confirmed → partial처럼 되돌아갈 수 있고 rubric prerequisite는 그래프다.
provider-agnostic interface와 offline authoring/online evaluation 분리는 유지한다. 실제 provider,
stronger evaluator escalation, adaptive hints, benchmark는 후속 승인 범위다.

## Admin와 M3 경계

Admin category/problem/private package 조회는 DB-backed다. dashboard의 문제 지표도 DB에서 읽는다.
source/candidate/eval 지표 및 local 검토 동작은 demo다. 현재 draft editor는 명시적인 local preview이며
DB 저장/새 version/publish를 수행하지 않는다. M3에서 human review를 포함한 content lifecycle을 만든다.
현재 seed의 synthetic example.com source URL을 실제 수집한 자료라고 표시하지 않는다.

discovery/authoring용 별도 lightweight TypeScript worker는 향후 구성이며 아직 도입하지 않는다.
FastAPI, Redis, Celery, vector DB, microservices, Kubernetes도 실제 필요성이 확인될 때 검토한다.

## 검증 범위

사용자 승인된 GitHub integration으로 schema/catalog migration을 적용했고 실제 익명 Data API와
공개 UI/비공개 접근 차단을 확인했다. CLI는 설치하지 않았다. 로컬 PGlite에서는 최소 Auth stub으로
migration과 `supabase/tests/rls.sql`을 실행했다. 이후 사용자가 가입 메일 수신과 로그인된 인터뷰의
메시지/힌트 저장 및 새로고침 복원을 확인했다. 일반 계정의 `/admin` 차단 및 첫 관리자 지정 안내 후
Admin/Categories/Problems 화면 열람도 사용자 보고로 확인했다. 자동화된 계정 검증과 구분한다.
추가로 관리자의 드론 문제 reference answer/rubric 열람, Finish 후 대화·힌트 review,
logout/재로그인 후 완료 기록 유지도 사용자가 확인했다.
hosted SQL Editor의 RLS 검사도 오류 없이 finish_interview/UUID 결과가 나왔다는 사용자 보고로 통과 기록했다.
이는 DB role/claim을 전환하는 synthetic 사용자 검사이며 실제 Auth 토큰을 사용하는 HTTP 검사와 구분한다.
Codex의 후속 공개 Data API 조회에서는 category 9개/problem 3개와 공개 테스트 행 부재를 확인했다.
이후 사용자가 M2_VERIFICATION 1~3번에 이상이 없다고 보고했다. 실제 Auth 세션의 Data API SELECT 격리,
private package 접근 차단, 상호 review 접근 차단과 일반 계정의 Admin 6개 route 거절은 사용자 확인으로 기록한다.
Network 요청 목록 스크린샷은 응답 본문을 보여 주지 않으므로 로그인된 payload 검사는 여전히 미확인이다.
session 만료/refresh와 동시성도 별도 안정성 검증으로 남아 있다.
로컬 lint/typecheck/test/build와 bundle/import 경계 검사는 실제 실행 결과를 STATUS에 기록한다.
로그인된 동적 인터뷰 HTML/RSC/Server Action/Review 응답 본문은 별도 검증 항목이다.
`pnpm verify:access`는 두 실제 Auth 세션의 Data API SELECT 경계를 검사하는 로컬 CLI다.
기존 SDK와 publishable key만 사용하며 인증 정보는 메모리에 두고 명령의 세션만 local sign-out한다.
본인 데이터와 admin의 실제 package 조회를 먼저 확인하여 만료 세션/빈 자료를 통과로 오인하지 않는다.
앱 route와 HTML/RSC/Server Action 응답은 [M2_VERIFICATION.md](M2_VERIFICATION.md)의 별도 브라우저 절차로 확인한다.

공식 참고: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs),
[RLS와 grants](https://supabase.com/docs/guides/database/postgres/row-level-security),
[API keys](https://supabase.com/docs/guides/getting-started/api-keys).
