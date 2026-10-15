# HANDOFF — 친구 소식 직접 올리기 + 친구 지도

시안: `DINARY 친구 소식 올리기.dc.html`
- **1a** 올리기 흐름(시트 두 단계) ← 이 안으로 만듭니다
- **2a** 친구 지도(소식에 올라온 가게만)

1b(「내 소식」 화면을 따로 두는 안)는 이번 범위가 아닙니다.

## 0. 바뀌는 점

- 지금: 친구 소식 · 친구 지도는 `shared_records` 뷰를 씁니다. 이 뷰는 `restaurants.visibility`가 `friends`/`public`인 기록을 **전부** 보여 줍니다.
- 바뀐 뒤: 친구 탭은 내가 **직접 골라 올린 기록**(`friend_posts`)만 보여 줍니다. 기록 공개 범위(`visibility`)와는 따로 갑니다.
- 정한 규칙
  - 인증 기록만 올릴 수 있습니다.
  - 올린 소식은 직접 내릴 때까지 계속 보입니다(만료 없음).
  - 받는 사람은 친구 전체 또는 친한 친구 둘 중 하나입니다.
  - 누가 봤는지는 남기지 않습니다(조회 기록 테이블 없음).
  - 친구가 보는 방식은 지금처럼 카드 목록입니다.

## 1. DB — `supabase/migrations/20261016000200_friend_posts.sql`

```sql
-- 친한 친구 — 내가 고른 친구 목록(상대에게 알리지 않음)
create table if not exists public.close_friends (
  user_id    uuid not null references auth.users(id) on delete cascade,
  friend_id  uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.close_friends enable row level security;
drop policy if exists "own close friends" on public.close_friends;
create policy "own close friends" on public.close_friends for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id and public.is_friend(user_id, friend_id));

-- 친구 소식 — 기록 하나당 하나
create table if not exists public.friend_posts (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  record_id   bigint not null references public.restaurants(id) on delete cascade,
  photo_index int[] not null default '{}',        -- 기록 photo_urls 의 순번, 누른 순서. 첫 칸이 대표
  note        varchar(40),
  audience    text not null default 'friends' check (audience in ('friends', 'close')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, record_id)
);
create index if not exists friend_posts_created_idx on public.friend_posts (created_at desc);
alter table public.friend_posts enable row level security;

-- 내가 볼 수 있는 소식인지: 내 것 / 친구 전체 + 친구 / 친한 친구 + 상대가 나를 친한 친구로 고름
create or replace function public.can_see_post(p_user uuid, p_audience text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
      or (not public.is_blocked(p_user) and public.is_friend(auth.uid(), p_user) and (
            p_audience = 'friends'
         or exists (select 1 from public.close_friends c where c.user_id = p_user and c.friend_id = auth.uid())));
$$;

drop policy if exists "posts read" on public.friend_posts;
drop policy if exists "posts remove" on public.friend_posts;
create policy "posts read"   on public.friend_posts for select using (public.can_see_post(user_id, audience));
create policy "posts remove" on public.friend_posts for delete using (auth.uid() = user_id);
-- 올리기 · 고치기는 아래 함수로만(인증 기록 확인).

create or replace function public.upsert_friend_post(
  p_record_id bigint, p_photo_index int[], p_note text, p_audience text
) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid(); note text := nullif(trim(coalesce(p_note, '')), ''); new_id bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_audience not in ('friends', 'close') then raise exception 'bad_audience'; end if;
  if coalesce(length(note), 0) > 40 then raise exception 'note_too_long'; end if;
  if public.has_contact(note) then raise exception 'no_contact'; end if;
  if not exists (select 1 from public.restaurants
                 where id = p_record_id and user_id = uid and verified and coalesce(pending, false) = false) then
    raise exception 'record_not_verified';
  end if;
  insert into public.friend_posts (user_id, record_id, photo_index, note, audience)
  values (uid, p_record_id, coalesce(p_photo_index, '{}'), note, p_audience)
  on conflict (user_id, record_id) do update
    set photo_index = excluded.photo_index, note = excluded.note, audience = excluded.audience, updated_at = now()
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.upsert_friend_post(bigint, int[], text, text) from public, anon;
grant execute on function public.upsert_friend_post(bigint, int[], text, text) to authenticated;

-- 친구 탭이 읽는 뷰 — 소식 + 기록에서 보여도 되는 칸
create or replace view public.friend_feed as
  select p.id, p.user_id, p.record_id, p.photo_index, p.note, p.audience, p.created_at, p.updated_at,
         r.name, r.category, r.region, r.address, r.rating, r.verified_at,
         r.photo_urls, r.cover_index, r.photo_url, r.lat, r.lng,
         public.place_of(r.place_key, r.name, r.address) as place
  from public.friend_posts p
  join public.restaurants r on r.id = p.record_id
  where public.can_see_post(p.user_id, p.audience);
revoke all on public.friend_feed from anon;
grant select on public.friend_feed to authenticated;
```

함께 고칠 것
- **공감 · 댓글:** `record_cheers` · `record_comments`는 `record_id` 기준 그대로 둡니다. 다만 `can_see_record()`에 「내가 볼 수 있는 friend_posts가 그 기록에 있음」 조건을 `or`로 더하세요. 그래야 `visibility = private`인 기록도 소식에 올라가면 공감 · 댓글이 됩니다.
- **탭바 점:** `community_unseen()`이 세는 대상을 `restaurants` 대신 `friend_feed`(내 것 제외, `created_at > last_seen`)로 바꿉니다.
- **그대로 두는 것:** `shared_records`는 추천(`recs.ts`)이 계속 쓰므로 지우지 않습니다.

## 2. api — `src/features/community/api.ts`

- `useFriendFeed()`: `friend_feed`를 `created_at desc`로 400건까지 가져옵니다. 타입은 `FriendPost`입니다.
- `upsertFriendPost(qc, { recordId, photoIndex, note, audience })`: `rpc('upsert_friend_post')`를 부르고 `friend_feed`를 무효화합니다.
- `removeFriendPost(qc, id)`: `friend_posts`에서 delete 합니다.
- `useCloseFriends()` / `setCloseFriends(qc, ids)`: `close_friends`를 읽고 통째로 바꿉니다.
- 사진 순서는 `photo_index.map(i => photo_urls[i])`로 정합니다. 비어 있으면 `coverPhoto(r)` 한 장을 씁니다.

## 3. 친구 탭 — `app/community/friends.tsx`

### 3-1 얼굴 줄 (시안 1a · A1)
- **맨 앞은 내 자리입니다.** 크기는 48입니다.
  - 올린 소식이 없을 때: 고리는 `1.5px dashed C.brick`이고, 오른쪽 아래에 19px 벽돌 원 「+」(테두리 2px `C.paper`)를 둡니다. 이름은 「내 소식」(`F.sansMd` · `C.brick`)입니다.
  - 올린 소식이 있을 때: 고리는 `2px C.ink`, 이름은 「내 소식 N」(`C.ink`)입니다. 「+」는 그대로 둡니다.
  - 동작: 얼굴을 누르면 피드가 내 소식만 걸러집니다(친구 얼굴과 같은 `only` 동작). 「+」를 누르면 올리기 시트(3-3)가 열립니다. 올린 소식이 없을 때는 얼굴을 눌러도 시트가 열립니다.
- 친구들은 지금처럼 그 뒤에 섭니다. 새 기록 판단은 `friend_feed.created_at > communitySeenSince` 기준입니다.

### 3-2 소식 카드 (`FeedCard`)
- **데이터:** `useSharedRecords` 대신 `useFriendFeed`를 씁니다. 모두 인증 기록이므로 인증 없는 기록을 한 줄로 접던 갈래는 지웁니다.
- **사진:** 높이 170, 고른 사진을 옆으로 넘깁니다. 2장 이상이면 아래 가운데에 6px 점을 찍습니다(현재 `C.card`, 나머지 55%).
- **한 줄:** `note`가 있으면 `review` 대신 note를 보여 줍니다. 서체는 `F.serif` 12.5입니다. 기록의 `review`는 소식에 나오지 않습니다.
- **꼬리표:** 받는 쪽이 보는 `audience = 'close'` 카드에는 「✓ 인증」 왼쪽에 「친한 친구」 칩을 붙입니다(`C.brickSoft` 바탕 · `K.brickInk` · mono 10).
- **내 카드:**
  - 테두리는 `1px C.ink`이고, 오른쪽 위에 「친한 친구 2」 또는 「친구 전체」 칩과 ··· 버튼(28px `K.seg` 원)을 둡니다.
  - ··· 메뉴: 「사진 · 한 줄 고치기」, 「받는 사람 바꾸기」(둘 다 시트 2단계로 엽니다), 「소식에서 내리기」(벽돌색, 확인 없이 내리고 토스트 「소식에서 내렸어요 · 되돌리기」).
  - 내 카드에는 공감 · 댓글 수만 보이고 「위시에 담기」는 없습니다.

### 3-3 올리기 시트 — 새 파일 `src/features/community/PostSheet.tsx` (시안 A2 · A3)
- 모달 시트입니다. 높이 690, 위 모서리 28, 막은 `rgba(28,26,23,.42)`입니다.
- **1단계 「어떤 기록을 올릴까요?」**
  - 내 기록 중 `verified && !pending`인 것을 최신순으로, 3열 정사각 대표 사진 + 가게 이름(serif 12.5) + 인증 날짜(mono 9.5)로 보여 줍니다.
  - 고르면 `2px C.brick` 테두리와 오른쪽 위 ✓ 원(20)이 붙습니다.
  - 이미 올린 기록에는 왼쪽 아래 「올림」(먹색 70%)이 붙습니다. 이 기록을 고르면 2단계가 기존 값으로 채워집니다(고치기).
  - 「다음」 버튼은 고르기 전에는 꺼 둡니다.
- **2단계 꾸미기**
  - **사진:** 62px 썸네일 줄입니다. 누른 순서대로 1, 2… 번호가 붙고 다시 누르면 빠집니다. 최소 1장, 기본값은 대표 사진 1장입니다.
  - **한 줄:** 40자까지, 오른쪽에 「17/40」을 둡니다. 비워도 됩니다.
  - **받는 사람:** `Segmented`로 「친구 전체 · N」 / 「친한 친구 · N」을 고릅니다.
    - 친한 친구를 고르면 아래에 겹친 얼굴 + 이름과 「친한친구 수정하기 ›」가 나옵니다.
    - 「친한친구 수정하기 ›」를 누르면 친구 목록 체크 시트(`CloseFriendsSheet`)가 열립니다.
    - 친한 친구가 0명이면 「친한 친구 · 0」을 눌렀을 때 바로 체크 시트를 엽니다.
  - **버튼:** 「소식에 올리기」(고치기면 「고치기」)입니다. 아래에 「직접 내릴 때까지 보입니다 · 누가 봤는지는 남지 않습니다」(11 · `K.inactive`)를 둡니다.
  - 올리면 햅틱 Success, 시트를 닫고 피드 맨 위로 스크롤합니다.
- **문턱:** 인증 기록이 0건이면 1단계 대신 「인증 기록이 생기면 올릴 수 있습니다」와 카메라 버튼을 보여 줍니다.

### 3-4 친구 지도 (`FriendMap`, 시안 2a)
- **데이터:** `friend_feed`에서 내 것을 빼고, 좌표가 있는 것을 `place`로 묶습니다. 묶음마다 올린 사람과 시각을 최근 순으로 담습니다.
- 지도는 `marginTop: 14`(전환 버튼 아래 14px)에서 시작합니다.
- **핀:** `NaverMapMarkerOverlay` 안에 얼굴을 넣습니다.
  - 한 명: 34px 얼굴, `2.5px C.brick` 테두리 + 바깥 2px `C.card` 링 + 그림자.
  - 여럿: 최근 두 명의 얼굴을 14px 어긋나게 겹치고, 오른쪽 위에 먹색 숫자 원(18)을 둡니다.
  - 핀 아래 꼬리표: 「지민 · 40분 전」 / 「하늘 외 2 · 어제」. `C.card` 바탕 · 10px · 반경 8이고, 가장 최근에 올린 사람을 씁니다. 시간 표기는 `timeAgo`를 그대로 씁니다.
  - 가장 최근 소식이 30일 넘었으면 핀 전체를 `opacity .6`, 얼굴 30px로 줄입니다.
  - 이미 내 위시에 있는 가게(`useWishes`, 이름+좌표로 매칭)는 얼굴 오른쪽 아래에 16px 책갈피 배지를 붙입니다.
  - `zIndex`는 올린 사람 수입니다.
- **위쪽 칩(지도 위 12px):** 「전체」 · 「이번 주」(7일 안에 올라온 것) · 「위시에 없는 곳」. 켜진 칩은 먹색입니다.
- **핀 카드(아래, 탭바 위 14px):**
  - 맨 위: 가게 이름(serif 18) + 「면 · 성수동 · 1.2km」(거리는 위치 권한이 있을 때만)와 「친구 N명이 소식에 올림」(벽돌 11.5).
  - 올린 사람 줄은 최근 순으로 두 명까지 펼칩니다: 얼굴 28, 이름(500 12), 올린 때(mono 10 `K.inactive`), 「✓ 인증 날짜」(mono 10 벽돌), 한 줄(serif 12.5), 오른쪽에 대표 사진 44.
  - 나머지는 「+ 이름 · 날짜」 한 줄로 줄입니다.
  - 버튼: 「소식에서 보기」(테두리 버튼) / 「위시에 담기」(먹색, 책갈피 아이콘).
    - 위시에 담기는 `addWishFrom(..., source: \`${최근 올린 사람}의 소식\`)`을 부르고, 결과에 따라 「✓ 위시에 담음」 / 「이미 담아둔 곳」으로 바꿉니다.
    - 소식에서 보기는 `view = 'feed'`, `only = 그 사람`으로 바꾸고 해당 카드로 스크롤합니다.
- 비었을 때 문구: 「친구가 소식에 올린 가게가 아직 없습니다.」

## 4. 확인

1. 인증 없는 기록은 1단계 목록에 나오지 않고, rpc를 직접 불러도 `record_not_verified`가 납니다.
2. 친한 친구로 올린 소식은 내가 친한 친구로 고른 사람에게만 보입니다. 친구 전체 쪽 계정에서 피드 · 지도 모두에 안 보여야 합니다.
3. 소식에서 내리면 친구 피드와 지도에서 모두 사라지고, 내 기록(`restaurants`)은 그대로입니다.
4. `visibility = private` 기록도 소식에 올리면 친구가 공감 · 댓글을 달 수 있습니다.
5. 같은 기록을 다시 고르면 새 소식이 생기지 않고 고치기가 됩니다(`unique (user_id, record_id)`).
6. 친구를 끊으면 `close_friends`에 남아 있어도 `is_friend` 조건 때문에 보이지 않습니다.
7. 탭바 새 소식 점이 `friend_feed` 기준으로 켜지고 꺼집니다.
