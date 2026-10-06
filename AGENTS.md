# Repository 작업 규칙

이 규칙은 `tech-interview-ai` repository 전체에 적용한다. 작업 전
[제품 명세](docs/PRODUCT_SPEC.md), [설계 방향](docs/ARCHITECTURE.md),
[현재 상태](docs/STATUS.md)를 읽고 사용자가 승인한 범위를 확인한다.

## 범위와 작업 안전

- 이 repository 밖의 프로젝트, 개인 사이트, 상위 repository를 수정하지 않는다.
- 변경 전 현재 파일, Git 상태, 사용 중인 포트와 프로세스를 먼저 확인한다.
- 사용자가 명시한 milestone 범위만 구현한다. 완료 후 멈추고 임의로 다음 milestone으로 넘어가지 않는다.
- 현재 승인 범위는 M2의 Supabase DB/Auth, persistence, User/Admin authorization이다. 현재 repository UI를 source of truth로 유지하고 기존 styling/layout을 복원하거나 재설계하지 않는다. 완료 후 멈추며 M3 content lifecycle/authoring/publish를 시작하지 않는다.
- 기존 코드를 삭제하거나 대규모 refactor하기 전에 변경 이유와 영향을 확인한다. 사용자 변경을 덮어쓰거나 관계없는 정리를 하지 않는다.
- global package를 설치하거나 기존 Node.js/package manager를 불필요하게 업그레이드하지 않는다.
- 기존 프로세스를 임의로 종료하지 않는다. 검증을 위해 직접 시작한 프로세스만 종료하고 종료 여부를 확인한다.
- 기본 개발 서버는 `127.0.0.1:3001`이다. 포트가 사용 중이면 상황을 보고하고 대체 포트를 제안한다.

- DB 변경은 migration/seed로 기록한다. 일반 runtime은 publishable key와 사용자 session만 사용한다. role 승격은 trusted SQL로만 수행하며 사용자 metadata를 admin 근거로 삼지 않는다.
- Supabase credential이 없으면 실제 연결을 검증했다고 주장하지 않는다.

## Secrets와 외부 서비스

- 실제 API key, secret, password를 source code, 문서, fixture, commit, 로그에 넣지 않는다.
- 환경 변수 파일 중 repository에 저장하는 파일은 값이 비어 있는 `.env.example`뿐이다. 실제 환경 파일은 Git에서 제외한다.
- 비밀 값에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- 사용자가 명시적으로 요청하기 전까지 외부 API 또는 유료 API를 호출하지 않는다. 설치가 승인된 개발 의존성 다운로드와 문서 확인을 제품의 외부 서비스 연동 승인으로 해석하지 않는다.
- LLM provider를 특정 회사에 강하게 결합하지 않는다. provider와 model 선택은 서버 설정/adapter로 분리하고 business logic에 model name을 직접 넣지 않는다.
- M0에는 LLM/Supabase SDK 설치, API 연동, DB schema, 인증, admin 기능, evaluator, hint engine, crawler, 배포 설정을 추가하지 않는다.

## 데이터와 권한 경계

- 사용자에게 공개되는 데이터와 서버 전용 정답/평가 데이터를 분리한다.
- rubric, reasoning graph, misconception, hint ladder, 평가 예제, 원본 reference answer를 client bundle, public asset, RSC props 또는 일반 사용자 API 응답으로 보내지 않는다.
- 실제 backend에서는 종료 후 reference answer 공개를 세션 종료와 접근 권한을 서버에서 확인한 별도 debrief 응답으로 제한한다. M2 review는 완료된 본인 attempt의 대화/힌트만 제공하고 reference answer 공개를 후속 milestone까지 제한한다. 전체 서버 평가 package는 사용자 화면에 공개하지 않는다.
- 사용자 영역과 admin 영역의 권한 경계를 유지한다. URL 분리나 UI 숨김만으로 권한을 보장한다고 가정하지 않는다.
- 향후 admin의 데이터 접근과 변경은 각각 서버에서 권한을 검사한다. 사용자 세션에도 소유권 검사를 적용한다.
- 자동 생성한 문제는 human approval 없이 publish하지 않는다.
- 힌트는 사용자가 명시적으로 Hint 버튼을 눌렀을 때만 제공한다. 일반 feedback에 힌트나 정답을 섞지 않는다.
- category는 DB 기반 계층 구조로 확장한다. 코드 enum으로 category를 고정하거나 Question Type/Competency와 섞지 않는다.

## 제품 언어와 국제화

- 기본 제품 언어는 English다. 개발 지시나 repository 문서가 한국어여도 제품에 표시되는 기본 언어는 영어로 유지한다.
- 특별한 이유가 명시되지 않는 한 User/Admin UI, navigation/button label, empty state, validation message, mock interview question/feedback/hint/review/debrief, mock source/candidate/problem content를 영어로 작성한다.
- MVP는 영어만 지원한다. Korean은 향후 optional language이며 technical terminology는 억지로 번역하기보다 정확성을 우선한다.
- 사용자에게 보이는 문구를 business logic의 identifier로 사용하지 않는다. `needs_review`, `published`, `physical-ai`, `objective_design` 같은 안정적인 machine-readable key와 표시명을 분리한다.
- category ID와 영어 표시명을 분리한다. 표시명 변경이나 번역으로 ID를 변경하지 않는다. problem, problem version, category, rubric node, source, attempt, competency ID와 evaluation status는 가능한 한 언어와 독립적으로 유지한다.
- 반복되는 UI 문구는 필요할 때 간단한 constants/module로 공유하되 business logic이 표시 문자열에 의존하지 않도록 한다. 한 번 쓰는 문구까지 위한 과도한 추상화는 추가하지 않는다.
- M1에서도 한국어 번역, locale switcher, 자동 번역, browser locale 감지, bilingual UI, translation API, locale별 routing/prefix, 전체 i18n framework를 구현하지 않는다.
- `/problems`, `/admin/problems`처럼 locale prefix 없는 route 방향을 유지한다. M1에서 번역용 `labels` 객체, locale별 `ProblemContent`, localized DB schema를 구현하지 않는다.
- 향후 localized content는 안정적인 domain ID와 분리하고 검수된 번역을 우선한다. reference answer와 hint의 공개/서버 전용 경계는 번역 후에도 유지한다.
- M1에서 영어 mock content를 작성하고 실제 localization은 후속 milestone으로 남긴다.

## 검증과 인계

- 설치된 pnpm과 `pnpm-lock.yaml`을 사용한다. 재설치는 `pnpm install --frozen-lockfile`을 우선한다.
- 구현 후 가능한 범위에서 `pnpm lint`, `pnpm typecheck`, 관련 test, `pnpm build`를 실제 실행한다.
- 현재 `pnpm test`는 Node 내장 runner를 사용하며 추가 framework가 없다. `pnpm build` 뒤 `pnpm check:boundaries`로 browser JS와 public import 경계의 private 데이터 부재도 확인한다. 실행하지 않은 테스트를 완료했다고 보고하지 않는다.
- 실행하지 못한 검증은 실행했다고 주장하지 않는다. 실패 원인과 미검증 범위를 구분하여 보고한다.
- 변경 후, 특히 milestone 완료 시 `docs/STATUS.md`를 업데이트한다. 완료 항목, 미구현 항목, 실제 검증 결과, 다음 milestone을 기록한다.
- 사용자 승인 없이 milestone 상태를 다음 단계로 전환하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
