# M2 — remaining authenticated verification

이 안내는 실제 Auth 세션의 HTTP 접근 경계와 로그인된 사용자 응답의 비공개 데이터 부재를 검사한다.
2026-10-06 사용자가 1~3번에 이상이 없다고 보고했다. 현재 남은 핵심 검증은 4번의 응답 본문 확인이다.
이미 통과한 SQL role/claim 검사를 반복할 필요는 없다. 아래 절차의 실제 결과는 STATUS에 따로 기록한다.
검증 명령이나 이 안내가 존재한다는 사실을 hosted 검증 성공으로 기록하지 않는다.

## 1. 계정과 브라우저 준비

- A: 현재 사용하는 관리자 계정. 기존 브라우저에 로그인한다.
- B: 다른 이메일의 일반 계정. 별도 브라우저 프로필 또는 시크릿 창에서 가입/이메일 확인 후 로그인한다.
  B의 profiles.role은 user로 유지한다. A와 B는 서로 다른 Auth user ID여야 한다.
- 두 개의 시크릿 창은 같은 cookie 저장소를 공유할 수 있으므로 일반 창 A + 시크릿 창 B를 사용한다.
- 두 창 모두 `http://localhost:3001`을 사용한다.
- 각 계정에서 드론 문제를 시작하고 서로 다른 짧은 영어 메시지를 보낸다. 힌트를 한 번 요청하고 Finish한다.
  예: A는 `Account A verification note`, B는 `Account B verification note`.
- 각각 완료 review의 전체 URL을 보관한다. `/review?attempt=<UUID>` 형태이며 기존 완료 회차도 사용할 수 있다.
- 앞서 RLS SQL에서 나온 UUID는 rollback된 테스트 회차다. 여기서는 본인 브라우저에서 실제로 열리는 review URL을 사용한다.
- 아래 CLI는 각 계정의 **가장 최근 완료 회차**에 메시지와 힌트가 있는지 먼저 확인한다.

기본 Supabase 메일 서비스는 수신 주소/발송량 제한이 있다. B의 메일이 거절되면 반복 요청하기보다
프로젝트의 허용된 테스트 주소 또는 소유자가 관리하는 테스트 계정을 사용한다.
이 검증을 위해 전체 프로젝트의 email confirmation을 끄거나 서비스 키를 앱에 추가하지 않는다.
정책은 [Supabase SMTP 안내](https://supabase.com/docs/guides/auth/auth-smtp)를 참고한다.

## 2. 실제 Data API 접근 검사 — 서버 터미널

SSH/VS Code의 서버 터미널에서 실행한다. 브라우저 Console이나 Supabase SQL Editor 명령이 아니다.

```bash
cd ~/code/tech-interview-ai
pnpm verify:access
```

A 이메일/비밀번호, B 이메일/비밀번호를 순서대로 입력한다. 비밀번호 입력 시 글자가 보이지 않는 것이 정상이다.
`.env.local`의 기존 URL/publishable key를 사용한다. 계정 비밀번호를 .env 파일, 명령줄 인자, 채팅에 넣지 않는다.
CLI는 HTTPS hosted Supabase와 sb_publishable_ key를 지원한다. 기존 프로젝트 설정에 해당한다.

명령은 두 계정으로 새 Auth 세션을 생성하고 Auth 서버에서 identity를 확인한다. 도메인 데이터에는
SELECT만 수행하며 계정 생성, role 변경, 메시지/힌트/RPC 쓰기를 하지 않는다. 비밀번호/토큰/응답 본문을
출력하거나 파일에 저장하지 않는다. 정상 정리 시 CLI가 만든 세션만 `scope: local`로 로그아웃한다.

다섯 개의 PASS와 마지막 `Data API checks passed.` 안내를 확인한다.

| 검사 | 성공 기준 |
| --- | --- |
| A/B identity와 profile | 서로 다른 실제 로그인 계정, A=admin, B=user |
| A의 본인 데이터 | 완료 attempt, 메시지, 힌트가 실제로 조회됨 |
| B의 본인 데이터 | 완료 attempt, 메시지, 힌트가 실제로 조회됨 |
| A → B 및 B → A | 상대 attempt/message/hint 조회가 모두 HTTP 200 + 빈 배열 |
| 비공개 package | A에게 실제 존재하는 package가 보이고 B에게는 HTTP 200 + 빈 배열 |

401/403, 만료 token, 네트워크 오류, 빈 테이블은 격리 검증의 성공으로 취급하지 않는다.
의도적으로 client user_id 필터 없이 상대 기록을 조회하여 DB가 경계를 적용하는지 확인한다.
`NOT PASSED`가 나오면 표시된 일반 오류만 공유한다. 인증 정보나 전체 응답을 공유할 필요는 없다.
실제 mutation endpoint의 거절은 이미 실행한 RLS SQL 검사가 담당한다. 이 CLI는 SELECT 경계만 검사한다.

## 3. 실제 앱 route 검사 — 브라우저

A와 B의 본인 review가 정상 표시되는 상태에서 검사한다.

| 검사 | 기대 결과 |
| --- | --- |
| B 창에서 A의 `/review?attempt=...` 전체 URL 열기 | `This page is not available.`; A의 메시지/힌트 없음 |
| A 창에서 B의 review URL 열기 | 동일하게 접근 거절; admin도 타인 attempt를 읽을 수 없음 |
| B 창에서 `/admin` 및 아래 하위 경로 직접 열기 | 모두 `This page is not available.` |

Admin 경로: `/admin`, `/admin/sources`, `/admin/candidates`, `/admin/problems`, `/admin/categories`, `/admin/evals`.

로그인 화면으로 이동했다면 B 세션이 없는 것이므로 일반 계정 권한 검사 통과로 기록하지 않는다.
Next.js streaming 응답은 접근 거절 화면에도 HTTP 200일 수 있다. 상태 코드만으로 판정하지 말고
접근 거절 내용과 타인/관리자 데이터 부재를 함께 확인한다. 코드 스택이나 일반 오류 화면도 통과가 아니다.

## 4. 로그인된 문제/대화 응답 검사 — 브라우저 Network

Chrome/Edge 기준이다. A 창의 Admin Problems에서 드론 문제를 선택하고, 비교할 비공개 문구를 준비한다.

- Reference answer의 특징적인 한 문장
- Reasoning rubric의 sufficient evidence 설명 일부
- 아직 공개하지 않은 Hint 2 이상의 문구
- Misconception 설명과 Evaluation example의 특징적인 문구

이 문구는 B의 채팅 입력에 붙여넣지 않는다. 사용자가 직접 입력한 문구의 반환과 비공개 데이터 누출을 구분한다.

1. **B 창**에서 개발자 도구의 Network를 열고 Disable cache를 켠다. 이전 요청 목록을 지운다.
2. `/problems/drone-dynamics-adaptation`을 새로고침한다.
3. 이름이 `drone-dynamics-adaptation`인 **Document 요청 → Response**를 연다.
   초기 HTML에는 React Server Component 데이터도 포함될 수 있으므로 보이는 화면뿐 아니라 응답 전체를 확인한다.
4. 문제 목록으로 갔다가 링크를 눌러 드론 문제를 다시 연다. `?_rsc=...` 또는
   `Content-Type: text/x-component`인 요청이 생기면 그 Response도 확인한다.
   router cache로 요청이 생기지 않았다면 이 경로는 별도 미확인으로 기록한다.
5. 새로운 인터뷰를 시작하고 짧은 메시지를 보낸다. Network의 해당 POST 응답도 확인한다.
6. Hint를 한 번 요청한 응답과 새로고침 후 복원 응답을 확인한다.
7. Finish 후 `/review?attempt=...` 응답도 확인한다. M2는 review에서도 정답을 공개하지 않는다.

각 Response에서 위 비공개 문장과 다음 필드들을 검색한다. JSON camelCase와 DB snake_case 둘 다 살핀다.

Network 목록의 **Name 열에 있는 요청 이름**을 클릭하면 오른쪽 또는 아래에 상세 영역이 열린다.
여기서 **Response(응답)** 탭을 선택한다. 긴 문자열/숫자/기호가 섞인 RSC 본문도 정상적인 응답 형식이다.
본문 안을 클릭한 뒤 Ctrl+F(Mac은 Cmd+F)로 검색한다. 목록의 Filter 입력란은 응답 내용 검색이 아니다.
예를 들어 `drone-dynamics-adaptation?_rsc=...`를 클릭하여 문제 페이지의 RSC 응답부터 확인할 수 있다.
제공된 스크린샷처럼 Type이 fetch인 요청만 보이면, **All**을 선택하고 필터를 비운 뒤 문제 페이지를
새로고침해 Type이 document인 초기 HTML 요청도 확인한다. 요청의 HTTP 200/304만으로 검사를 통과시키지 않는다.

```text
referenceAnswer / reference_answer
reasoningRubric / reasoning_rubric
hintLadder / hint_ladder
misconceptions
evaluationExamples / evaluation_examples
```

성공 기준: 실제 정답, 전체 rubric/힌트 목록, misconception/evaluation package가 응답에 없어야 한다.
직접 요청한 Hint 1 한 개와 본인의 기존 대화/힌트가 나오는 것은 정상이다. `Reference answer`라는 제목이나
`Reference answers are not available yet.` 같은 안내만으로 누출이라고 판정하지 않는다.
RSC/JSON은 escape될 수 있으므로 여러 특징적인 문구와 필드를 확인한다. 확인한 문제/버전/요청 범위만 기록한다.

현재 Supabase query는 Next.js 서버에서 수행하므로 브라우저 Network에 Supabase 요청이 보이지 않아도 정상이다.
검사 대상은 localhost의 HTML/RSC/Server Action 응답이다. browser에서 직접 Supabase를 조회하는 경계는 2번 CLI로 검사한다.

참고: [Chrome Network Response 확인](https://developer.chrome.com/docs/devtools/network/reference#response).

## 결과 전달

아래 결과만 알려 주면 된다. 전체 HAR/쿠키/Authorization header/비밀번호는 필요 없다.

```text
Data API CLI: PASS 또는 NOT PASSED + 표시 문구
B → A review 차단: 성공/실패
A → B review 차단: 성공/실패
B의 Admin 6개 경로 차단: 성공/실패
B의 Document/RSC/Start/Message/Hint/Resume/Review 응답: 비공개 데이터 없음/발견/일부 미확인
```

이 결과를 기록하면 앞서 남겨둔 실제 Auth 세션의 조회/route 경계와 해당 인터뷰의 응답 경계를 구분해 확인할 수 있다.
세션 만료 자동 refresh, 동시 요청 부하와 모든 문제/버전 조합 검증은 별도 안정성 검증이다. M3 구현은 진행하지 않는다.
