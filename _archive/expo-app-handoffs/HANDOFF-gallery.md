# Handoff: 공유 갤러리 (커뮤니티 「탐색」 → 「갤러리」)

대상 저장소: `taehyeon-k/restaurant-log` (main)
시안: `DINARY 공유 갤러리.dc.html` (화면 01~04). **이 파일을 `handoff/gallery/`에 함께 넣어 주세요.**
범위: `expo-app/` 커뮤니티 + DB 마이그레이션. 웹(`src/`)은 이번 범위에서 빠집니다.
같이 볼 지시서: `HANDOFF-board-v2.md`(⋯ 메뉴 · 신고/차단 · 프로필 창 · 관리자 숨김 · 댓글 규칙을 그대로 씁니다). 그 지시서를 먼저 반영한 뒤 진행해 주세요.

---

## 0. Claude Code 에게

- 순서: ① 마이그레이션 → ② 탭바 · 라우트 → ③ 갤러리 격자(01) → ④ 사진 보기(02) → ⑤ 올리기(03) → ⑥ 검색(04).
- 끝나면 `expo-app`에서 `npx tsc --noEmit`, `npx expo export --platform ios`를 돌려 통과를 확인하고 바꾼 파일 목록을 알려 주세요.
- 새 네이티브 패키지는 넣지 마세요. 색·글꼴은 `C`, `F`, `K`를 씁니다.
- 마이그레이션은 파일만 만들고 **실행하지 마세요.**

## 1. 무엇이 바뀌나

- 하단 추천 탭이 생기면서 커뮤니티 안 「탐색」(`app/community/recs.tsx`)은 쓰지 않습니다. 그 자리를 **공유 갤러리**로 바꿉니다.
- 갤러리는 각자 찍은 음식 사진을 한 장씩 올려 보는 곳입니다. 사진에는 가게 이름과 메뉴가 붙고, 반응은 **좋아요와 댓글**입니다.
- 올릴 수 있는 사진은 **내 기록에 있는 사진뿐**입니다(가게·메뉴를 붙이기 위해). 인증 기록이 아니어도 되고, 인증 기록이면 ✓가 붙습니다.
- 사진을 올려도 그 기록의 `visibility`는 바뀌지 않습니다. **그 사진 한 장만** 갤러리에 나갑니다.

---

## 2. 탭바 · 라우트

- `src/components/CommunityTabBar.tsx`: `{ name: "recs", label: "탐색", icon: SparkIcon }` → `{ name: "gallery", label: "갤러리", icon: (c) => <GridIcon stroke={c} /> }`
- `GridIcon` 신규(`src/components/icons.tsx`): 24 viewBox, stroke 1.6, strokeLinejoin round, fill none, 둥근 네모 4개
  `<Rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.6"/>` `<Rect x="13" y="3.5" .../>` `<Rect x="3.5" y="13" .../>` `<Rect x="13" y="13" .../>`
- 새 라우트: `app/community/gallery/_layout.tsx`, `index.tsx`(01), `[id].tsx`(02), `new.tsx`(03), `search.tsx`(04)
- `app/community/recs.tsx`와 `features/community/recs.ts`는 지우지 말고 탭에서만 뺍니다(추천 탭이 쓰는 코드가 있으면 그대로). 커뮤니티 「마지막에 본 탭」에 `recs`가 저장돼 있으면 `gallery`로 바꿔 엽니다.
- `SparkIcon`을 다른 곳에서 안 쓰면 그대로 두세요(지우지 않음).

---

## 3. DB — `supabase/migrations/20261018010000_gallery.sql`

### 3-1. 갤러리 사진

```sql
create table if not exists public.gallery_photos (
  id         bigserial primary key,
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id  bigint not null references public.restaurants(id) on delete cascade,
  photo_ref  text not null,            -- 그 기록의 photo_urls 중 하나(같은 값 그대로)
  menu       varchar(40),              -- 고른 메뉴 · 직접 쓴 메뉴 · null(메뉴 없이)
  caption    varchar(120),             -- 한 줄(선택)
  area       text,                     -- "서울 마포구 망원동" 꼴, 올릴 때 기록 주소에서
  hidden_at  timestamptz,              -- 관리자 숨김
  hidden_by  uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (record_id, photo_ref)        -- 같은 사진 두 번 올리기 금지
);
create index if not exists gallery_created_idx on public.gallery_photos (created_at desc);
create index if not exists gallery_menu_idx on public.gallery_photos (lower(menu));
alter table public.gallery_photos enable row level security;
create policy "gallery read"   on public.gallery_photos for select to authenticated
  using (hidden_at is null and not public.is_blocked(author_id));
create policy "gallery remove" on public.gallery_photos for delete using (auth.uid() = author_id);
-- 쓰기는 아래 함수로만
```

### 3-2. 좋아요 · 댓글

```sql
create table if not exists public.gallery_likes (
  photo_id   bigint not null references public.gallery_photos(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create table if not exists public.gallery_comments (
  id         bigserial primary key,
  photo_id   bigint not null references public.gallery_photos(id) on delete cascade,
  parent_id  bigint references public.gallery_comments(id) on delete cascade,   -- 답글 한 단계
  author_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body       varchar(500) not null check (length(trim(body)) > 0),
  hidden_at  timestamptz,
  hidden_by  uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists gallery_comments_photo_idx on public.gallery_comments (photo_id, created_at);
```
- RLS: likes는 로그인 사용자 읽기, 본인 insert/delete. comments는 `not is_blocked(author_id)` 읽기, 본인 delete, 쓰기는 `add_gallery_comment(p_photo_id, p_body, p_parent_id)` 함수로만. 게시판 댓글과 규칙이 같습니다(`has_contact` 금지, `is_sanctioned` 금지, 답글의 답글 금지, **5건 문턱 없음**).
- `reports.target_type`에 `'gallery_photo'`, `'gallery_comment'` 추가. 관리자 함수 `admin_hide_gallery_photo(id, hide)`, `admin_hide_gallery_comment(id, hide)` 추가(`is_admin()` 확인 + `moderation_log`).

### 3-3. 올리기 함수

```
post_gallery_photo(p_record_id bigint, p_photo_ref text, p_menu text default null,
                   p_caption text default null, p_add_menu_to_record boolean default false) returns bigint
```
확인할 것:
- 로그인, `is_sanctioned` 아님, `has_contact(p_caption)` 아님
- 기록이 **본인 것**이고 pending 아님. 인증 여부는 보지 않음
- `p_photo_ref`가 그 기록의 `photo_urls`에 들어 있음(또는 `photo_url`과 같음)
- 올리기 문턱: 게시판과 같이 `my_verified_count() >= 5`. 하루 10장
- 메뉴 1~40자. `p_add_menu_to_record`가 true이고 그 기록 `menus`에 같은 이름이 없으면 `menus`에 `{name, vote: null}`을 하나 더함
- `area`는 기록 `address`에서 「시 구 동」까지

### 3-4. 사진 공개 (스토리지)

`20261016000300_private_photos.sql`의 `can_see_photo(obj)`가 기록 공개 범위로만 판단한다면, **갤러리에 올라간 사진**도 보이게 조건을 더해 주세요.
```sql
-- can_see_photo 안에 or 로 추가
or exists (select 1 from public.gallery_photos g
           where public.photo_ref_is(g.photo_ref, obj) and g.hidden_at is null and not public.is_blocked(g.author_id))
```
갤러리에서 내리면(delete) 다시 기록 공개 범위대로 돌아갑니다.

### 3-5. 목록 뷰 `gallery_feed`

```
id, author_id, nickname, avatar_url, character_id, title_label_id,
photo_ref, menu, caption, area, created_at,
place_name(r.name), category, address, verified(r.verified), verified_at, lat, lng, place(place_of(...)),
like_count, comment_count(숨김 제외), my_like
```
- `hidden_at is null and not is_blocked(author_id)`. 정렬은 앱에서(최신 = `created_at desc`, 이번 주 인기 = 최근 7일 `like_count desc`).
- 「친구」 필터 = `is_friend(auth.uid(), author_id)`. 「OO구만」 = `area`에 구 포함(게시판 `guOf`와 같은 기준).

### 3-6. 검색 함수

```
gallery_search(p_q text, p_scope text default 'all')   -- scope: all · menu · place · area · person
returns json  -- { menu: [...photos], places: [{name, address, category, photo_count, cover_ref}], areas: [...], people: [{id, nickname, avatar_url, character_id, title_label_id, photo_count}] }
```
- 검색어는 공백 제거·소문자로 비교. 메뉴는 `gallery_photos.menu`, 가게는 `restaurants.name`, 동네는 `area`, 사람은 `profiles.nickname`.
- 차단한 사람·숨긴 사진은 빠짐. 각 묶음 최대 30.
- 「요즘 많이 찾는 메뉴」: 최근 7일 `gallery_photos.menu` 빈도 상위 4개를 돌려주는 `gallery_top_menus()`. (검색어 기록을 따로 쌓지는 않습니다.)

---

## 4. 화면

### 01 갤러리 — `app/community/gallery/index.tsx`

- 머리: 지금 커뮤니티와 같은 `CommunityHeader`(「‹ 내 기록」 + 오른쪽 **돋보기 → `/community/gallery/search`**).
- `TitleBlock` eyebrow `COMMUNITY · GALLERY`, 제목 「갤러리」, 오른쪽 「오늘 올라온 사진 N」.
- `FilterChips`: `최신 · 이번 주 인기 · 친구` + (내 동네가 있으면) 점선 「OO구만」.
- 사진만 **3칸 격자**, 칸 사이 3px, 정사각. 인증 기록의 사진은 오른쪽 위에 18px 흰 원 + 벽돌 `✓`.
- **누르기 동작**
  - 처음 누르면 그 칸 위에 반투명 검정(`rgba(28,26,23,.62)`)이 깔리고 아래쪽에 가게 이름(세리프 13 흰색) · 메뉴(10.5) · Mono 「♥ N · 댓글 N」 + 오른쪽 「보기 ›」.
  - **같은 칸을 한 번 더 누르면 사진 보기(02)로** 갑니다. 「보기 ›」도 같은 동작.
  - 다른 칸을 누르면 정보가 그 칸으로 옮겨 갑니다(한 번에 한 칸만). 스크롤하면 닫힙니다.
- 「+ 사진 올리기」 버튼(게시판 「+ 글쓰기」와 같은 자리·모양). 5건 전에는 게시판과 같은 안내 띠.

### 02 사진 보기 · 좋아요 · 댓글 — `app/community/gallery/[id].tsx`

- 머리: `‹` · 아바타 30 · 닉네임(누르면 프로필 창) · 시간 · 오른쪽 `⋯`(신고 · 차단 / 내 사진이면 「갤러리에서 내리기」 / 관리자면 숨기기 · 작성자 정지).
- 사진: 화면 너비 정사각. **두 번 탭하면 좋아요**(하트가 잠깐 떠오름).
- 반응 줄: ♡/♥(벽돌) + 수 · 말풍선 아이콘 + 댓글 수 · 오른쪽 「+ 위시에 담기」(지금 `useAddWish` 그대로).
- 가게 카드(테두리 카드 radius 16): 가게 이름(세리프 16) + 인증이면 오른쪽 「✓ 인증 MM.DD」 · 메뉴(12.5) · 「카테고리 · 동네」(11, faint). 카드를 누르면 그 가게 사진 모아보기(04의 가게 결과와 같은 목록).
- 한 줄(caption)이 있으면 가게 카드 아래에.
- 댓글: 「댓글 N개 모두 보기」 + 최근 2개 미리보기(닉네임 굵게 + 본문). 모두 보기·입력은 게시판 07 댓글 화면과 같은 컴포넌트를 씁니다(기록 붙이기 「+」는 갤러리에서는 숨김).

### 03 사진 올리기 — `app/community/gallery/new.tsx`

- 머리: 「취소 · 사진 올리기 · 올리기」.
- 아래쪽 「내 기록의 사진」: 4칸 격자, 최근 기록순, 기록 하나에 사진이 여러 장이면 모두 보입니다. 이미 갤러리에 올린 사진은 흐리게 + 「올림」. **한 번에 한 장** 고릅니다(벽돌 테두리 + 번호 원).
- 위쪽 미리보기: 고른 사진 120 정사각 + 「가게」 가게 이름(세리프 15) + 인증이면 「✓ 인증 MM.DD」.
- **메뉴 고르기**: 라벨 「메뉴」, 오른쪽 「이 기록의 메뉴 N개」.
  - 그 기록의 `menus[].name`(없으면 `menu`)을 칩으로. 첫 번째가 골라진 상태로 시작.
  - 칩 끝에 점선 「+ 직접 쓰기」(누르면 입력칸, 40자) · 점선 「메뉴 없이」.
  - 직접 쓴 메뉴로 올릴 때 「이 메뉴를 기록에도 남길까요?」 확인 → `p_add_menu_to_record`.
  - 고른 칩: 벽돌 테두리 + 벽돌 10% 바탕 + 벽돌 글자. 일반 칩: `#d8d3c8` 테두리.
- 「한 줄 남기기 (선택)」 입력, 120자.
- 오류: `need_5_verified`, `daily_limit`, `no_contact`, `sanctioned`, `already_posted`.

### 04 검색 — `app/community/gallery/search.tsx`

- 머리: 검색칸(높이 42, 둥근 알약, 돋보기 + 입력 + ✕) + 「취소」. 들어오면 바로 키보드.
- 칩: `전체 · 메뉴 · 가게 · 동네 · 사람`.
- 입력 전: 「요즘 많이 찾는 메뉴」 점선 칩 4개(`gallery_top_menus`). 누르면 그 말로 검색.
- 결과(전체일 때, 비어 있는 묶음은 숨김):
  - **메뉴 · {검색어}**: 3칸 카드(사진 radius 10 + 가게 이름 세리프 12 + Mono 「♥ N · 동네」). 오른쪽 「사진 N · 가게 N ›」 → 메뉴 칩으로 좁힌 전체 격자.
  - **가게**: 줄(사진 40 · 가게 이름 세리프 14 · 「카테고리 · 구 동」 · Mono 「사진 N」). 누르면 그 가게 사진 격자.
  - **동네**: 동네 이름 + 사진 수 줄. 누르면 그 동네 사진 격자.
  - **사람**: 아바타 36 · 닉네임 · 「사진 N · 대표 칭호」. 누르면 **프로필 창**(`HANDOFF-board-v2.md` 08과 같은 컴포넌트).
- 입력은 300ms 디바운스.

---

## 5. 확인할 것

1. 커뮤니티 탭바 두 번째 칸이 「갤러리」 + 격자 아이콘, 예전에 「탐색」을 마지막으로 봤던 계정도 갤러리로 열림
2. 격자: 한 번 탭 → 정보, 같은 칸 다시 탭 → 02, 다른 칸 탭 → 정보 이동
3. 남의 기록 사진 · 그 기록에 없는 `photo_ref`로 `post_gallery_photo` → 거절, 같은 사진 두 번 → `already_posted`
4. `visibility='private'` 기록의 사진을 올리면 그 사진만 남에게 보이고, 같은 기록의 다른 사진·메모는 안 보임. 내리면 다시 안 보임
5. 메뉴 「직접 쓰기」 + 기록에 남기기 → 원래 기록 `menus`에 하나 더해짐(중복이면 안 더함)
6. 좋아요 두 번 탭/하트 토글, 수가 바로 바뀜
7. 차단한 사람의 사진·댓글·검색 결과가 안 보임, 관리자 숨김 사진이 격자·검색에서 빠짐
8. 검색 「두쫀쿠」 → 메뉴 묶음이 위, 사람 누르면 프로필 창
9. `npx tsc --noEmit` 통과
