# Handoff: 게시판 개편 (6칸 게시판 · 글쓰기 · 투표 · 태그 · 댓글 · 프로필 창 · 관리자)

대상 저장소: `taehyeon-k/restaurant-log` (main)
시안: `DINARY 게시판 개편.dc.html`. **이 파일을 `handoff/board-v2/`에 함께 넣어 주세요.** 화면 번호(01~08)는 이 시안 기준입니다.
범위: `expo-app/app/community/board/*`, `expo-app/src/features/community/*`, DB 마이그레이션. 웹(`src/`)은 이번 범위에서 빠집니다.

---

## 0. Claude Code 에게

- 순서: ① 마이그레이션 → ② `api.ts` 타입·쿼리 → ③ 게시판 목록(01~05) → ④ 글쓰기(06) → ⑤ 글 상세·댓글(07) → ⑥ ⋯ 메뉴·프로필 창(08) → ⑦ 관리자.
- 끝나면 `expo-app`에서 `npx tsc --noEmit`, `npx expo export --platform ios`를 돌려 통과를 확인하고 바꾼 파일 목록을 알려 주세요.
- 새 네이티브 패키지는 넣지 마세요. 색·글꼴은 `src/theme`의 `C`, `F`와 `features/community/ui.tsx`의 `K`를 씁니다.
- 마이그레이션은 파일만 만들고 **실행하지 마세요.** 제가 Supabase SQL Editor에서 돌립니다.
- 친구 소식의 `record_comments`(한 줄 120자)는 건드리지 않습니다. 게시판 댓글은 새 테이블입니다.

## 1. 바뀌는 원칙 (지금 코드 주석과 다름)

| | 지금 | 바뀐 뒤 |
|---|---|---|
| 글 형식 | `record_share` · `theme_answer` · `ask` 셋, 빈 글쓰기 칸 없음 | `free` · `theme` · `food` · `cafe` · `course` 다섯, **제목·본문 자유 입력** |
| 기록 | 인증 기록만 붙일 수 있음 | **내 기록이면 붙일 수 있음**(인증 안 된 것도). 인증이면 「✓ 인증」 표시만 |
| 올리기 문턱 | 인증 기록 5건 | **그대로 유지** (`my_verified_count() >= 5`) |
| 「가봤어요」 | 그 가게 인증이 있을 때만 | 누구나 누를 수 있음 |
| 댓글 | 없음(어디 가요? 답만) | 게시판 댓글 신설. 답글 한 단계 |
| 태그 | `ask_tags`(어디 가요?만, 3개) | 모든 글에 `tags` 5개까지 |
| 관리 | 없음 | 관리자 계정: 공지 · 숨김 · 신고함 · 정지 · 주제 관리 |
| 랭킹 | 인증된 방문만 | **그대로** (손대지 않음) |

`index.tsx` 첫 주석 「인증 기록으로만 씁니다 · 빈 글쓰기 칸은 없습니다」, TitleBlock `sub`도 새 원칙에 맞게 고쳐 주세요. sub는 「DINARY 사용자 모두가 봅니다」만 남깁니다.

---

## 2. DB — `supabase/migrations/20261018000000_board_v2.sql`

### 2-1. 관리자 역할

```sql
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('user', 'admin'));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
```
- 본인이 `role`을 바꾸지 못하게, 기존 `guard_profile_characters()` 트리거와 같은 방식으로 `role` 변경을 막는 트리거를 추가합니다(관리자 지정은 SQL Editor에서만).

### 2-2. 글 테이블 확장 (`board_posts`)

```sql
alter table public.board_posts drop constraint if exists board_posts_type_check;
alter table public.board_posts drop constraint if exists board_posts_check;
alter table public.board_posts drop constraint if exists board_posts_check1;
-- (위 두 check 이름은 실제 이름을 \d board_posts 로 확인해서 지워 주세요)

alter table public.board_posts add column if not exists title varchar(60);
alter table public.board_posts add column if not exists body  varchar(2000);
alter table public.board_posts add column if not exists tags  text[] not null default '{}';
alter table public.board_posts add column if not exists pinned boolean not null default false;   -- 공지
alter table public.board_posts add column if not exists hidden_at timestamptz;                    -- 관리자 숨김
alter table public.board_posts add column if not exists hidden_by uuid references auth.users(id);

-- 기존 글 옮기기
update public.board_posts set type = 'theme' where type = 'theme_answer';
update public.board_posts set type = 'free', tags = ask_tags, title = ask_area where type = 'ask';
update public.board_posts p set type = case when r.category in ('카페', '디저트') then 'cafe' else 'food' end
  from public.restaurants r where p.type = 'record_share' and r.id = p.record_id;
update public.board_posts set body = note where body is null and note is not null;

alter table public.board_posts add constraint board_posts_type_check
  check (type in ('free', 'theme', 'food', 'cafe', 'course'));
alter table public.board_posts add constraint board_posts_tags_max check (coalesce(array_length(tags, 1), 0) <= 5);
create index if not exists board_posts_tags_idx on public.board_posts using gin (tags);
create index if not exists board_posts_type_idx on public.board_posts (type, created_at desc);
```
- 카페 판정 카테고리는 `src/lib/types`의 `ALL_CATEGORIES`에서 카페·디저트에 해당하는 값으로 맞춰 주세요.
- `ask_area`, `ask_tags`, `note` 컬럼은 남겨 두고 새 코드에서는 쓰지 않습니다.

### 2-3. 코스 (`board_post_records`)

```sql
create table if not exists public.board_post_records (
  post_id   bigint not null references public.board_posts(id) on delete cascade,
  position  int    not null check (position between 1 and 5),
  record_id bigint not null references public.restaurants(id) on delete cascade,
  memo      varchar(60),
  primary key (post_id, position)
);
alter table public.board_post_records enable row level security;
create policy "post records read" on public.board_post_records for select to authenticated using (true);
```

### 2-4. 투표 (자유 게시판만)

```sql
create table if not exists public.board_polls (
  post_id   bigint primary key references public.board_posts(id) on delete cascade,
  closes_at timestamptz not null
);
create table if not exists public.board_poll_options (
  id       bigserial primary key,
  post_id  bigint not null references public.board_polls(post_id) on delete cascade,
  position int not null check (position between 1 and 5),
  label    varchar(40) not null,
  unique (post_id, position)
);
create table if not exists public.board_poll_votes (
  post_id   bigint not null references public.board_polls(post_id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  option_id bigint not null references public.board_poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)          -- 한 사람 한 표
);
```
- RLS: options는 누구나 읽기. votes는 본인 행만 읽기, 쓰기는 `vote_poll(p_post_id, p_option_id)` 함수로만(마감 전, 옵션이 그 글의 것인지 확인).
- **결과는 투표한 사람(또는 마감 뒤)에게만** 보입니다: `poll_results(p_post_id)` → `(option_id, label, count, mine)`. 투표 전이면 count를 null로 돌려줍니다.
- 투표를 바꾸는 것은 허용합니다(upsert).

### 2-5. 댓글 (`board_comments`)

```sql
create table if not exists public.board_comments (
  id         bigserial primary key,
  post_id    bigint not null references public.board_posts(id) on delete cascade,
  parent_id  bigint references public.board_comments(id) on delete cascade,  -- 답글 한 단계
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       varchar(500) not null check (length(trim(body)) > 0),
  record_id  bigint references public.restaurants(id) on delete set null,     -- 붙인 내 기록(선택)
  hidden_at  timestamptz,
  hidden_by  uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists board_comments_post_idx on public.board_comments (post_id, created_at);
```
- 쓰기는 `add_board_comment(p_post_id, p_body, p_parent_id, p_record_id)` 함수로만. 확인할 것: 로그인, 정지 아님(2-7), `has_contact(body)` 아님, parent가 있으면 parent의 `parent_id`가 null(한 단계), record는 본인 것.
- **댓글에는 5건 문턱을 두지 않습니다.**
- 읽기: `not is_blocked(author_id)`. 본인 삭제는 직접 delete. 관리자가 숨긴 댓글은 행을 남기고 앱이 「운영 정책에 따라 삭제된 댓글입니다」로 그립니다.
- `board_answers`(어디 가요? 답)는 새 글을 받지 않습니다. 기존 답은 `board_comments`로 옮겨 주세요(body는 `coalesce(reason, '')`가 비면 가게 이름, record_id 그대로).

### 2-6. 반응

```sql
alter table public.board_reactions drop constraint if exists board_reactions_kind_check;
alter table public.board_reactions add constraint board_reactions_kind_check check (kind in ('want', 'been', 'cheer'));
drop policy if exists "reactions write" on public.board_reactions;
create policy "reactions write" on public.board_reactions for insert with check (auth.uid() = user_id);
```
- 맛집·카페: `want`(가보고 싶어요, 위시에도 담김) · `been`(가봤어요). 코스: `want`만, 누르면 코스 가게 전부 위시에 담깁니다(「코스 통째로 담기」). 주제: `cheer`(공감)만. 자유: 반응 없음(투표·댓글).

### 2-7. 신고 · 정지 · 공지 · 기록

```sql
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('post', 'answer', 'comment', 'board_comment', 'user', 'tour'));
alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolved_by uuid references auth.users(id);
create policy "reports admin read"   on public.reports for select using (public.is_admin());
create policy "reports admin update" on public.reports for update using (public.is_admin());

create table if not exists public.user_sanctions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  until      timestamptz,          -- null = 영구
  reason     text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create or replace function public.is_sanctioned(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_sanctions where user_id = p_user and (until is null or until > now()));
$$;

create table if not exists public.app_notices (       -- 앱 전체 공지(배너 + 알림)
  id bigserial primary key, title varchar(60) not null, body varchar(500),
  starts_at timestamptz not null default now(), ends_at timestamptz,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

create table if not exists public.moderation_log (
  id bigserial primary key, admin_id uuid not null references auth.users(id),
  action text not null,            -- hide_post · unhide_post · hide_comment · sanction · unsanction · notice · theme
  target_type text, target_id text, note text,
  created_at timestamptz not null default now()
);
```
- RLS: `user_sanctions`, `moderation_log`는 관리자만 읽기. `app_notices`는 로그인 사용자 읽기, 관리자만 쓰기. `board_themes`에 관리자 insert/update 정책 추가.
- 관리자 동작은 모두 security definer 함수로 하고, 함수 첫 줄에서 `is_admin()`을 확인한 뒤 `moderation_log`에 한 줄 남깁니다: `admin_hide_post(id, hide bool)`, `admin_hide_comment(id, hide bool)`, `admin_sanction(user, until, reason)`, `admin_unsanction(user)`, `admin_pin_post(id, pin bool)`.
- 정지는 기록장에 영향을 주지 않고, 글·댓글 쓰기만 막습니다.

### 2-8. 글 올리기 함수 다시 정의

`create_board_post`를 지우고 새 시그니처로 만듭니다.

```
create_board_post(
  p_type text, p_title text, p_body text default null, p_tags text[] default '{}',
  p_record_id bigint default null,          -- food · cafe 필수, free · theme 선택
  p_course jsonb default null,              -- course: [{record_id, memo}] 2~5개
  p_theme_id bigint default null,           -- theme 필수(열린 주제)
  p_poll jsonb default null,                -- free 만: {options: [..2~5], days: 1~7}
  p_area text default null
) returns bigint
```
확인할 것:
- 로그인, `is_sanctioned` 아님, `my_verified_count() >= 5`, 하루 3개(지금 그대로), `has_contact(title/body)` 아님
- 제목 1~60자. 본문 2000자. 태그 5개, 각 태그는 `#` 없이 1~20자, 소문자·공백 제거로 정규화
- food·cafe: `p_record_id`가 **본인 기록**(pending 아님). 인증 여부는 확인하지 않습니다. cafe는 카테고리가 카페·디저트
- course: 2~5개, 모두 본인 기록, 같은 기록 중복 금지 → `board_post_records`에 position 1부터
- theme: 지금 열린 `board_themes`
- poll: type이 free일 때만 → `board_polls`·`board_poll_options`
- 관리자는 `pinned=true`로 올릴 수 있는 `p_pinned` 인자를 따로 받아도 됩니다(아니면 `admin_pin_post`로)

### 2-9. 목록 뷰 `board_feed` 다시 정의

지금 칸에 더해 `title, body, tags, pinned, hidden_at`, 작성자 `role`(관리자 글 표시용), `r.verified`(✓ 인증), `comment_count`(숨김 제외), `cheer_count`, 코스면 `course_count`·`course_verified`(인증된 곳 수)·`course_names text[]`(순서대로), 투표면 `poll_total`·`poll_closes_at`·`my_vote`를 넣습니다.
- `hidden_at is not null`인 글은 목록에서 빼고, 상세에서는 「운영 정책에 따라 삭제된 글입니다」로 그립니다.
- 정렬: `pinned desc, created_at desc`

### 2-10. 프로필 창용 함수

```
public_profile_card(p_user uuid) returns json
  -- {id, nickname, avatar_url, character_id, title_label_id, role,
  --  record_count, verified_count, post_count, friend_state}
  -- friend_state: 'self' | 'friend' | 'sent' | 'received' | 'none'
```
- `record_count`·`verified_count`는 pending·연인 복사본 제외(`20261016000100_community_skip_copies.sql`의 기준과 같게).
- 차단한 사람이면 null.
- 「가진 칭호」 목록: 지금 칭호(라벨)를 앱에서 계산한다면 남의 것은 서버에서 알 수 없습니다. 그 경우 이번에는 **대표 칭호 하나만** 보여 주고 목록 칸은 숨긴 뒤 `TODO(칭호 목록)`을 남겨 주세요.

---

## 3. 화면

공통 디자인은 지금 `ui.tsx`의 `CommunityHeader`, `TitleBlock`, `FilterChips`, `Avatar`를 그대로 씁니다. 시안의 hex는 `C`/`K` 토큰 값과 같습니다.

### 01~05 게시판 목록 — `app/community/board/index.tsx`

- `FilterChips` 옵션: `전체 · 자유 · 주제 · 맛집 · 카페 · 코스` (`all · free · theme · food · cafe · course`). 마지막에 고른 칸 기억(지금 커뮤니티 탭 기억과 같은 방식).
- 「OO구만」 칩은 맛집·카페·코스에서만. 맛집·카페에는 「✓ 인증만」 칩 추가(켜면 `verified`만).
- 자유에는 칩 줄 아래에 요즘 많이 쓰인 태그 3개(점선 칩)를 띄웁니다(최근 7일 `tags` 빈도). 누르면 그 태그로 거릅니다.
- **공지**(`pinned`) — 목록 맨 위 한 줄: 벽돌색 「공지」 알약 + 제목(한 줄 말줄임) + Mono 「DINARY 운영」. `#efebe2` 바탕, radius 12.
- 전체에서는 글마다 작성자 줄 맨 앞에 게시판 알약(`맛집`, `자유 · 투표`, `코스` …).
- **본문은 목록에서 2줄까지**, 넘치면 `…` (`numberOfLines={2}`).
- 주제 칸 상단: 이번 주 주제 카드를 검정(`C.ink`) 바탕으로 크게, 버튼은 「답하기」. 아래쪽에 「지난 주제 · OO · 답 N ›」 줄.
- 코스 카드: 제목 + Mono 요약(시안의 「도보 12분 · 저녁 · 2인 약 6만 원」은 **이번에 넣지 않습니다**. 자리만 비워 두세요) + 동선 지도 + 번호 원(벽돌, 22px) 세로 줄 + 가게마다 메모 + 「✓ 인증 n/m」.
- 「+ 글쓰기」 버튼(지금 「+ 올리기」 자리, 이름 바꿈)은 **모든 칸에서** 보입니다. 누르면 `/community/board/new?type=`에 지금 칸을 넘깁니다(전체 → `free`). 5건 전에는 지금처럼 안내 띠.

#### 목록의 빠른 투표 (01 시안)
- 투표 글은 목록에서 제목 + 본문 2줄 + 태그 줄, 그 아래 줄에 「N명 투표 · 댓글 N」과 오른쪽 끝 **「투표 열기」** 알약(벽돌 테두리).
- 누르면 그 자리에서 선택지가 펼쳐집니다(글로 들어가지 않음). 하나 누르면 바로 투표 → 막대·%가 보이고 내 선택은 `✓`와 벽돌 테두리. 아래 「접기」.
- 이미 투표했으면 버튼 이름이 「결과 보기」.

### 06 글쓰기 — `app/community/board/new.tsx` (다시 짜기)

- 머리: 「취소 · 글쓰기 · 올리기」.
- 게시판 고르기 세그먼트: `자유 · 주제 · 맛집 · 카페 · 코스`. `type` 파라미터로 처음 값을 정합니다.
- 맛집·카페: 위에 고른 기록 카드(사진 56 · 가게 · 별점 · 「✓ 인증 MM.DD」 또는 표시 없음 · 「바꾸기」). 기록을 먼저 고르기 전에는 「내 기록에서 고르기」 시트를 엽니다. 목록은 최근 인증 기록이 위로 오고, 인증 안 된 기록도 아래에 보입니다.
- 코스: 기록 2~5개를 순서대로 고르고 끌어서 순서를 바꿉니다. 가게마다 메모 60자.
- 제목(세리프 18) / 본문(세리프 13.5, 여러 줄).
- 태그 줄: 칩 + 「#태그 추가」 + `n / 5`. 입력하면 많이 쓰인 태그 자동완성.
- 아래 도구줄: `내 기록 · 사진 · #태그 · 투표`. 투표는 자유에서만 켜지고 다른 칸에서는 흐리게 「투표 · 자유만」. 투표: 선택지 2~5개, 기간 1·3·7일.
- 사진(기록 없이 붙이는 사진)은 이번 범위 밖입니다. 버튼만 두고 `TODO`로 남겨 주세요.
- 오류 메시지: `need_5_verified`, `daily_limit`, `no_contact`, `sanctioned`, `theme_closed`를 한국어로.

### 07 글 상세 · 댓글 — `app/community/board/[id].tsx`

- 머리: `‹` · Mono 게시판 이름 · `⋯`.
- 본문 전체, 태그, (투표 글이면) 투표 카드, (기록 글이면) 기록 카드·반응.
- 「댓글 N」 + Mono 「시간순」. 정렬은 시간순만.
- 댓글: 아바타 26 · 닉네임 · 시간 · 본문 12.5. 기록을 붙였으면 아래에 작은 카드(사진 32 · 가게 · `✓ 인증`). 「답글」을 누르면 그 댓글 밑에 들여 써서(35px) 답글 하나 단계.
- 글쓴이가 단 댓글에는 「글쓴이」 테두리 꼬리표.
- 숨긴 댓글: 회색 「운영 정책에 따라 삭제된 댓글입니다.」 (작성자 이름 대신 그대로 두되 본문만 바꿈. 시안은 「DINARY 운영」으로 그렸지만 원래 작성자 줄을 두는 쪽으로).
- 입력줄: 왼쪽 원형 「+」(내 기록 붙이기) + 「댓글 달기」 입력. 500자.

### ⋯ 메뉴 (모든 글 · 댓글의 작성자 줄 오른쪽 끝)

- 일반: 「신고하기」(사유 고르기: 광고 · 욕설 · 거짓 정보 · 기타 → `reports`), 「차단하기」(확인 후 `user_blocks` insert, 목록에서 바로 빠짐. 지금 `PostSheet`의 차단 흐름이 있으면 그대로 씀).
- 내 글·댓글: 「수정」(글만) · 「삭제」.
- 관리자: 위에 더해 「숨기기 / 숨김 풀기」, 「작성자 정지」(7일 · 30일 · 영구), 글이면 「공지로 고정 / 해제」.
- 시안 기준: 132px 흰 팝업, radius 12, 항목 높이 38, 「차단하기」는 벽돌색. RN에서는 기존 `BottomSheetModal`로 해도 됩니다.

### 08 프로필 창 (닉네임을 누르면)

- 글·댓글·주제 답·코스의 닉네임을 누르면 `BottomSheetModal`로 엽니다. 아바타도 같이 누를 수 있게.
- 위: 대표 캐릭터(원 88, `#f7ece5` 바탕, `#e0c3b1` 테두리, 지금 `Character` 컴포넌트) · 닉네임(세리프 21 bold) · 대표 칭호 알약(벽돌 10% 바탕) · Mono 「캐릭터 이름 · 등급」.
- 숫자 세 칸(테두리 카드): 기록 · **인증(벽돌)** · 게시글.
- 「가진 칭호」 칩 목록(2-10 참고).
- 큰 버튼 하나(높이 48): `none` → 검정 「+ 친구 추가」(`friendships` insert pending) / `sent` → 「친구 요청 보냄 · 취소」(벽돌 글자, 누르면 delete) / `received` → 「친구 요청 받기」 / `friend` → 「친구 · 기록 보기」(친구 소식에서 그 친구만 거른 화면으로) / `self` → 버튼 없음.
- 관리자가 보면 아래에 작은 회색 「운영: 정지 · 글 보기」 줄.

---

## 4. 관리자 화면 (앱 안, 가볍게)

- 관리자 글·공지의 작성자 표시는 「DINARY 운영」 + 검정 원 아바타(`D`).
- 내계정(BookDrawer 계정 화면)에 `is_admin`일 때만 「운영」 메뉴: **공지 쓰기**(게시판 고정 공지 / 앱 전체 공지 `app_notices` 중 고르기) · **신고함**(안 본 것 위, 대상 미리보기 + 숨기기 · 정지 · 무시) · **이번 주 주제**(제목 · 설명 · 기간 입력).
- 앱 전체 공지: 앱을 열 때 기간 안의 최신 공지 하나를 상단 배너로, 닫으면 그 id를 로컬에 기억. 푸시 알림 발송은 이번 범위 밖(`TODO`).

## 5. 확인할 것

1. 인증 기록 4건 계정: 「+ 글쓰기」 대신 안내 띠, 댓글은 쓸 수 있음
2. 인증 안 된 기록으로 맛집 글 → 올라가고 「✓ 인증」이 없음
3. 코스 1개·6개 → 거절, 남의 기록 id → 거절
4. 투표 전 `poll_results` count가 null, 투표 후 보임, 다시 눌러 바꾸기
5. 답글에 답글 → 거절
6. 일반 계정으로 `admin_hide_post` 호출 → `not_admin`, `profiles.role` 직접 update → 막힘
7. 정지된 계정: 글·댓글 실패, 기록 남기기는 됨
8. 차단한 사람의 글·댓글·프로필이 안 보임
9. 기존 `record_share`·`ask` 글이 맛집/카페·자유로 옮겨져 보이는지, 기존 답이 댓글로 보이는지
10. `npx tsc --noEmit` 통과
