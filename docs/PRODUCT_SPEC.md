# tech-interview-ai 제품 명세

## 목적과 현재 범위

`tech-interview-ai`는 technical interview를 채팅 방식으로 연습하는 서비스다.
단순한 정의 암기형 질문뿐 아니라 실제 상황에서 근거를 바탕으로 기술적 판단을
내려야 하는 Advanced / Scenario-based 질문을 핵심 콘텐츠로 한다.

이 문서는 목표 제품의 명세다. M0에서 독립 Next.js 프로젝트와 개발 환경을 준비했고,
M1 영어 UI와 M2 Supabase DB/Auth·persistence 위에 M3 수동 콘텐츠 작성/검수/발행을 연결한다.
현재 repository의 사용자 수정 UI를 기준으로 유지하며 실제 evaluator는 아직 없다.
DB 연결에는 사용자가 제공하는 Supabase 프로젝트와 migration/seed 적용이 필요하다.

## 제품 언어

- 서비스의 기본 언어는 **English**이며 MVP에서는 영어만 지원한다.
- Korean은 향후 optional language로 지원할 수 있다. 현재 한국어 localization은 구현하지 않는다.
- 개발 지시가 한국어여도 User/Admin UI, navigation/button label, empty state,
  validation message와 mock interview question, feedback, hint, review/debrief,
  source/candidate/problem content는 특별한 이유가 없는 한 영어로 작성한다.
- technical terminology는 억지로 번역하기보다 기술적 정확성을 우선한다.
- problem/evaluation의 내부 logic와 identifier는 가능한 한 언어와 독립적으로 유지한다.
  category ID와 표시명, machine-readable status와 UI label을 분리한다.
- M1에서는 영어 mock content만 작성한다. 한국어 번역, locale switcher, 자동 번역,
  browser locale 감지, bilingual UI, translation API, locale별 routing은 도입하지 않는다.

언어 방향은 M1의 모든 UI와 mock content에 적용한다. 개발 문서는 한국어를 사용할 수
있지만 제품 문구와 내부 identifier를 혼용하지 않는다.

## 핵심 콘텐츠

- sim-to-real 문제에서 어떤 representation objective가 적합한지 판단한다.
- 특정 ML system failure의 원인을 진단하고 가설과 확인 방법을 제시한다.
- architecture, objective, data, experiment, system 사이의 trade-off를 비교한다.
- 단일 정답 문구와의 일치보다 가정, 근거, 추론 과정, 타당한 대안의 설명을 중시한다.

Core 질문으로 기초 개념도 연습할 수 있지만 Advanced 질문을 중심으로
이해를 실제 의사결정으로 연결하는 경험을 제공한다.

## 목표 사용자 경험

1. category, question type, difficulty로 문제를 선택한다.
2. scenario/question, assumptions, 필요한 visualization을 확인한다.
3. 자신의 reasoning을 자유로운 채팅으로 입력한다.
4. 시스템은 현재 reasoning이 타당한 방향인지 평가하고 progress를 보여 준다.
   진행 중 정답이나 아직 도달하지 않은 해결 단계를 직접 알려 주지 않는다.
5. 사용자가 명시적으로 **Hint** 버튼을 눌렀을 때만 현재 진행 상태에 맞는
   다음 단계의 힌트를 제공한다. 자동 feedback과 hint 요청을 분리한다.
6. 문제 종료 후 debrief와 reference answer를 확인하고 자신의 판단 과정을 돌아본다.

Visualization은 문제 이해에 필요한 도식, 데이터, 그림 등을 위한 개념이다.
M1의 대표 Drone 문제에는 HTML/CSS 기반 history → encoder → latent → controller →
action 도식을 제공한다. 기존 seed 문제는 original mock scenario이며 M3에서 새로 작성한 문제는 manually authored scenario로 표시한다.

## 분류 모델

### Category

category는 코드 enum이 아니라 DB 기반의 확장 가능한 **hierarchical category**로
관리한다. 아래 트리는 초기 콘텐츠 방향의 예시이며 닫힌 목록이 아니다.

```text
AI
├── Physical AI
├── Computer Vision
├── LLM
└── ML Systems
Security (추후 확장 예시)
```

각 category는 안정적인 식별자와 상하위 관계를 갖도록 설계한다. 관리자가 새 분야나
하위 분야를 추가할 때 client 코드에 category enum을 추가할 필요가 없어야 한다.
하나의 문제는 여러 category와 여러 tag에 속할 수 있어야 한다. tag는 계층과
독립적인 검색/분류 수단이며 category의 대체물이 아니다. M2에서는 categories와 problem_categories table로
계층 및 many-to-many 관계를 정의한다.

### Question Type

category와 별개로 문제의 형식을 나타낸다.

| Type | 안정적인 내부 key | 의미 |
| --- | --- | --- |
| Core | `fundamental` | 기본적인 질문: 개념, 원리, 기본 메커니즘에 대한 이해 |
| Advanced | `applied` | 응용력을 요구하는 질문: 드론 문제처럼 구체적인 scenario에서의 진단, 선택, 설계와 판단 |

표시명은 공통 label module에서 관리하며 기존 내부 key와 분리한다. Question Type의
Advanced는 응용형 문제라는 의미로, 별도 Difficulty의 Advanced와 구분한다.
예를 들어 드론 문제는 Question Type이 Advanced이고 Difficulty는 Intermediate다.

### Competency

분야가 아니라 문제를 통해 평가할 능력이다. category 및 Question Type과 독립적으로
관리하며 하나의 문제에 여러 competency를 연결할 수 있다.

- Objective Design
- Failure Diagnosis
- Debugging
- Architecture Choice
- Experiment Design
- Trade-off
- System Design

difficulty도 별도 속성으로 취급한다. M1은 `beginner`, `intermediate`, `advanced`를
내부 값으로 사용하고 영어 표시명을 별도로 관리한다.

## 콘텐츠 품질 원칙

- 문제는 question + answer뿐 아니라 검수된 reasoning rubric, 대안, misconceptions,
  hint ladder, completion criteria, evaluation examples를 포함한 package로 제작한다.
- authoring과 사용자 reasoning 평가를 분리한다.
- 자동 생성한 draft는 human review 및 명시적인 승인 후에만 publish한다.
- evaluator의 자체 confidence만으로 정답을 확정하지 않는다.
- 평가의 품질은 정답 유출 방지, 타당한 대안 수용, 잘못된 추론 구별 능력으로 확인한다.

## M3의 실제 범위와 한계

- 로그인 없이 published/current-version 문제를 탐색하고 scenario/question/visualization을 읽는다.
- 인터뷰 시작/저장, 메시지/힌트 기록과 review history에는 email/password 로그인이 필요하다.
- 첫 계정의 role은 user다. Admin은 trusted SQL로 지정하며 서버 검사와 RLS로 보호한다.
- 현재 UI의 category 9개, 문제 6개 (published: Advanced 2개/Core 1개), private package 3개를
  개발 seed로 보존했다. 실제 runtime의 source of truth는 DB이며 자동 mock fallback은 없다.
- 대표 Drone Dynamics Adaptation은 Advanced / Intermediate다. 기존 문제 문구와 category를 보존한다.
- 같은 사용자의 같은 문제에는 in_progress attempt 하나를 resume한다. Finish 후 새 attempt를
  만들 수 있다. 각 attempt는 시작한 problem version에 고정된다.
- user/interviewer 메시지를 저장하고, 명시적인 요청마다 해당 version의 검수된 hint 하나를 level/list 순서로 공개한다.
  피드백은 deterministic mock이며 progress도 시연 값이다. 실제 평가/적응형 hint selection은 없다.
- review는 본인의 completed attempt에 한해 대화/힌트와 고정 version의 reference answer, 검수된 key ideas/대안을 제공한다.
  개인 reasoning 점수나 AI 진단을 생성하지 않으며, 전체 rubric/미요청 hint/evaluation examples는 공개하지 않는다.
- Admin은 source/candidate/category를 관리하고 public/private problem package를 작성·검수·preview·발행한다.
  발행 후 수정은 새 version으로 진행하며 기존 attempt와 발행본은 보존한다. evaluator QA만 명시적인 demo다.
- Supabase가 미설정이면 service unavailable/비활성 auth 폼을 표시하며 데이터를 저장한 것처럼
  보이지 않는다. 실제 연결 검증 상태는 STATUS와 SUPABASE_SETUP을 참조한다.
- LLM, crawler/discovery, automatic publish, production deployment, Korean localization은 없다.

수동 workflow와 발행 조건은 [CONTENT_WORKFLOW.md](CONTENT_WORKFLOW.md)를 따른다. M4 evaluator/benchmark는 아직 구현하지 않는다.
