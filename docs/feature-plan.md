# 기능 명세: 방문자 메시지 기능

> 작성일: 2026-11-08  
> 상태: 명세 확정 (미구현)

---

## 1. 개요

홈페이지에 방문한 사람이 별명과 한 줄 응원 메시지를 남길 수 있다.  
남긴 메시지는 Supabase에 영구 저장되며, 누구나 최신순으로 최근 100건을 조회할 수 있다.  
재배포 후에도 데이터는 유지되고, 다른 기기(친구 휴대폰 등)에서도 같은 목록이 보이면 완성이다.

---

## 2. 전체 구조

```
브라우저 (index.html)
    ↓ fetch("/api/messages")
Netlify Functions (netlify/functions/messages.js)
    ↓ supabase-js (service_role key — Netlify 환경 변수)
Supabase (messages 테이블, RLS ON, anon 정책 없음)
```

- 브라우저에는 Supabase 키를 포함하지 않는다.
- 브라우저에서 Supabase 테이블에 직접 접근하는 것을 막는다.
- 비밀 키(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)는 Netlify 환경 변수에만 두고, 직접 입력한다.

---

## 3. 배포 구성

### 파일 구조

```
hyunji142.github.io/
├── index.html              ← 공개 배포 대상
├── netlify.toml            ← 공개 배포 대상
├── netlify/
│   └── functions/
│       └── messages.js     ← 공개 배포 대상 (서버에서 실행, 키는 환경 변수로 분리)
├── docs/                   ← 공개 출력 제외 (설계 문서)
└── .kiro/                  ← 공개 출력 제외 (IDE 설정, 개인 기록)
```

### 공개 파일 범위

공개 배포(Netlify)에는 아래 파일만 포함한다.

- `index.html`, 이미지 등 공개 자산
- `netlify.toml`
- `netlify/functions/messages.js`

아래 항목은 공개 출력에서 제외한다.

- `.kiro/` — IDE 설정 및 개인 기록
- `docs/` — 설계 문서 및 기획 기록
- 서버 비밀 정보 — 절대 파일에 직접 기재하지 않고 Netlify 환경 변수로만 관리

### netlify.toml 핵심 설정

```toml
[build]
  functions = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

### Netlify 환경 변수 (직접 입력)

| 변수명 | 설명 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 (절대 파일에 기재 금지) |

### GitHub Pages 설정

기존 GitHub Pages 설정은 그대로 유지한다 (삭제하지 않음).  
단, **저장 기능(POST /api/messages)은 Netlify 주소에서만 동작**한다.  
GitHub Pages 주소(`https://hyunji142.github.io/`)에서는 Netlify Functions가 존재하지 않으므로 메시지 등록 기능이 동작하지 않는다.

---

## 4. Supabase 테이블 설계

테이블명: `messages`

| 컬럼 | 타입 | 설정 |
|---|---|---|
| id | uuid | PK, 자동 생성 (`gen_random_uuid()`) |
| nickname | text | NOT NULL, CHECK `char_length(nickname) BETWEEN 2 AND 12` |
| message | text | NOT NULL, CHECK `char_length(message) BETWEEN 1 AND 100` |
| created_at | timestamptz | NOT NULL, DEFAULT `now()` |

- RLS: **ON**
- anon 정책: **없음** — 브라우저 직접 접근 차단
- service_role은 RLS를 우회하며, Netlify Function 내에서만 사용

---

## 5. Netlify Function 명세

### 파일 위치

`netlify/functions/messages.js`

### 엔드포인트

`/api/messages` (netlify.toml redirect 경유)

---

### POST — 메시지 등록

**요청**

```json
{ "nickname": "별명", "message": "응원 메시지" }
```

**서버 유효성 검사**

| 조건 | 실패 시 응답 |
|---|---|
| nickname 2자 미만 또는 12자 초과 | 400 + `{ "error": "별명은 2~12자여야 합니다." }` |
| message 1자 미만 또는 100자 초과 | 400 + `{ "error": "메시지는 1~100자여야 합니다." }` |

**성공 응답**

```
HTTP 201
{ "id": "...", "nickname": "...", "message": "...", "created_at": "..." }
```

**실패 응답**

| 상황 | 코드 |
|---|---|
| 유효성 위반 | 400 |
| DB 오류 | 500 |
| GET/POST 외 메서드 | 405 |

---

### GET — 최신순 조회

**요청**: 쿼리 파라미터 없음

**조회 조건**: `ORDER BY created_at DESC LIMIT 100`

**성공 응답**

```
HTTP 200
[{ "id": "...", "nickname": "...", "message": "...", "created_at": "..." }, ...]
```

**조회 건수**: 최근 100건을 반환한다. 100건을 초과하는 오래된 글은 화면에 표시되지 않지만 DB에는 보존된다.

**실패 응답**: 500 + `{ "error": "..." }`

---

### CORS

Netlify 도메인에서만 허용한다. `Access-Control-Allow-Origin` 헤더를 Netlify 배포 도메인으로 제한한다.

---

## 6. 화면 명세

### 입력 영역

- 별명 `<input type="text">` — placeholder: "별명 (2~12자)", maxlength: 12
- 메시지 `<textarea>` — placeholder: "한 줄 응원 메시지 (1~100자)", maxlength: 100
- 글자 수 카운터: 메시지 입력 아래 실시간 `n / 100` 표시
- "남기기" 버튼

### 브라우저 유효성 검사

- 별명 2자 미만이면 버튼 비활성화 + 안내 문구 표시
- 메시지 1자 미만이면 버튼 비활성화
- 서버 요청 전에 동일 조건 재검사 (서버 검사의 중복이 아닌 사전 차단)

### 전송 흐름

1. 브라우저 검사 통과 → POST `/api/messages`
2. 버튼 "전송 중..." 표시 및 비활성화 (중복 전송 방지)
3. **201 응답** → 입력란 초기화 → 목록 맨 위에 새 카드 삽입
4. **400** → 서버 반환 메시지를 입력란 아래 표시
5. **500 또는 네트워크 오류** → "저장에 실패했습니다. 다시 시도해 주세요." 표시
6. 실패 시 목록에 카드를 추가하지 않는다 (서버 저장 성공 후에만 추가)

### 목록 영역

- 페이지 로드 시 GET `/api/messages` 자동 호출 → 최신순 카드 렌더링
- 목록 상단에 "최근 100건" 안내 문구 표시
- 각 카드: 별명 / 메시지 내용 / 저장 시각
- 모든 텍스트는 `textContent`로 삽입 (`innerHTML` 사용 금지 — HTML 미실행 보장)
- 조회 실패 시 "메시지를 불러오지 못했습니다." 표시

---

## 7. 완성 기준 및 검사 방법

| 항목 | 검사 방법 |
|---|---|
| 메시지 저장 | 별명·메시지 입력 후 전송 → 목록 맨 위에 카드 나타남 |
| 다른 기기에서 동일 데이터 | 친구 휴대폰 브라우저로 Netlify URL 접속 → 같은 목록 표시 |
| 재배포 후 데이터 유지 | Netlify 재배포 후 접속 → 기존 글 그대로 남아있음 |
| 브라우저 유효성 | 별명 1자로 전송 시도 → 버튼 비활성화 또는 안내 문구 표시 |
| 서버 유효성 | DevTools에서 `{ "nickname": "a", "message": "test" }` 직접 POST → 400 응답 |
| HTML 미실행 | 메시지에 `<script>alert(1)</script>` 입력 → 태그가 문자로 그대로 표시 |
| 실패 시 목록 미추가 | DevTools에서 네트워크 오프라인 후 전송 → 목록 변화 없음 |
| 수정·삭제 API 없음 | PUT `/api/messages` 요청 → 405 응답 확인 |
| GitHub Pages에서 저장 불가 | `https://hyunji142.github.io/`에서 전송 → `/api/messages` 404 또는 연결 실패 |
| 최근 100건 안내 | 목록 상단에 "최근 100건" 문구 표시 확인 |
| 비밀 키 미노출 | DevTools → Network → 응답 헤더·본문 확인 → SUPABASE_SERVICE_ROLE_KEY 없음 |
