# Handoff: 링크로 여러 곳 담기 (블로그 · 인스타 게시물 · 위시 그룹)

대상 저장소: `taehyeon-k/restaurant-log` (main)
시안: `DINARY 링크로 여러 곳 담기.dc.html` (화면 1~3). **이 파일을 `handoff/wish-group/`에 함께 넣어 주세요.**
범위: `expo-app/` 위시 + DB 마이그레이션 1개 + Supabase Edge Function 1개. 웹(`src/`)은 빠집니다.
**JS만 바뀌는 작업입니다.** 새 네이티브 패키지 없이 OTA(EAS Update)로 나가야 합니다.

---

## 0. Claude Code 에게

- 순서: ① 마이그레이션 → ② `sourceLink.ts` → ③ Edge Function `link-meta` → ④ `app/wish/link.tsx` 여러 곳 고르기 → ⑤ 그룹 이름 화면 → ⑥ 위시리스트 그룹 줄(`WishSegment.tsx`) → ⑦ 위시 상세 · 기록 전환.
- 끝나면 `expo-app`에서 `npx tsc --noEmit`, `npx expo export --platform ios`가 통과하는지 확인하고 바꾼 파일 목록을 알려 주세요.
- 색 · 글꼴은 `C`, `F`, `SHADOW`, `fieldStyle`, `Eyebrow`를 그대로 씁니다.
- 마이그레이션과 함수는 파일만 만들고 **실행 · 배포하지 마세요.**

## 1. 무엇이 바뀌나

1. 위시 「링크」가 유튜브 · 인스타 말고도 **블로그(네이버 · 티스토리 · 브런치)와 그 밖의 링크**를 받습니다. 인스타 게시물(`/p/`)은 「릴스」가 아니라 「게시물」로 표시합니다.
2. 「어느 가게인가요」 카드에 **원 게시물의 제목과 작성자**를 보여줍니다(유튜브 · 블로그). 인스타는 가져오지 않습니다.
3. 게시물 하나에 가게가 여러 곳이면 **여러 곳을 골라 한 번에** 담습니다.
4. 2곳 이상이면 **그룹 이름**을 정하고, 위시리스트에서 **그 이름으로 묶여** 접히고 펼쳐집니다.

---

## 2. DB — `supabase/migrations/20261019000000_wish_groups.sql`

```sql
create table if not exists public.wish_groups (
  id           uuid primary key default gen_random_uuid(),
  name         varchar(20) not null check (length(trim(name)) > 0),
  source_url   text,
  source_kind  text,
  source_title text,           -- 원 게시물 제목(있으면)
  source_author text,          -- 작성자(있으면)
  created_at   timestamptz not null default now()
);

alter table public.wishes add column if not exists group_id uuid references public.wish_groups(id) on delete set null;
alter table public.wishes add column if not exists group_pos int;                -- 그룹 안 순서(고른 순서, 1부터)
alter table public.wishes add column if not exists source_title text;
alter table public.wishes add column if not exists source_author text;
create index if not exists wishes_group_idx on public.wishes (group_id, group_pos);

alter table public.wishes drop constraint if exists wishes_source_kind_check;
alter table public.wishes add constraint wishes_source_kind_check
  check (source_kind is null or source_kind in ('shorts','youtube','reels','instagram','tiktok','blog','link'));
```
- `wishes`에 `user_id`(또는 소유자 칼럼)와 RLS가 이미 붙어 있다면, `wish_groups`에도 **같은 칼럼 · 같은 정책**을 그대로 복사해 주세요. 없으면 위 모양 그대로 둡니다(20260908000000 주석 참고).
- 그룹이 비면 지웁니다:
```sql
create or replace function public.drop_empty_wish_group() returns trigger language plpgsql as $$
begin
  if old.group_id is not null and not exists (select 1 from public.wishes where group_id = old.group_id) then
    delete from public.wish_groups where id = old.group_id;
  end if;
  return null;
end $$;
drop trigger if exists wishes_drop_empty_group on public.wishes;
create trigger wishes_drop_empty_group after delete or update of group_id on public.wishes
  for each row execute function public.drop_empty_wish_group();
```
- `restaurants.from_wish` jsonb에 `group_name`을 더합니다(위시가 기록이 될 때 `wishMetInfo`에서). 기록 상세의 「OO에서 담음」 옆에 쓸 수 있게만 남깁니다.

## 3. 링크 판별 — `src/lib/sourceLink.ts`

- `SourceKind`에 `"blog"` 추가. `SOURCE_KINDS`, `SOURCE_LABEL.blog = "블로그"`, `SOURCE_HEAD.blog`는 호스트별로(아래 `headOf`).
- `SOURCE_LABEL.instagram = "인스타 게시물"`, `SOURCE_HEAD.instagram = "INSTAGRAM 게시물"`.
- `kindOf`에 추가:
  - `blog.naver.com`, `m.blog.naver.com`, `naver.me` → `blog`
  - `*.tistory.com`, `brunch.co.kr` → `blog`
  - 나머지는 지금처럼 `link`
- `headOf(url, kind)`: blog면 `NAVER 블로그` / `TISTORY` / `BRUNCH`, 그 밖은 `SOURCE_HEAD[kind]`.
- `isVideoKind` → **`isAcceptedKind`로 이름을 바꾸고 모든 종류를 받습니다**(`link` 포함). 위시 폼의 「유튜브나 인스타그램 링크를 넣어주세요」 오류는 「링크를 찾지 못했어요」로 바꾸고, URL이 아예 없을 때만 띄웁니다.
- `sourceGlyph`: 유튜브 계열 `▶`. 블로그 · 인스타 게시물 · 링크는 **문서 아이콘**을 쓰도록 `sourceIcon(kind)`를 따로 두고 `link.tsx` · 출처 띠에서 그걸 씁니다(시안 1번 카드: 흰 선 둥근 네모 + 가로줄 3개, stroke 1.7).
- 「OO에서 보기 ↗」 버튼 문구: `${SOURCE_LABEL[kind]}에서 보기`. 인스타 게시물은 「인스타에서 보기」로 줄입니다.

## 4. 제목 · 작성자 가져오기

| 종류 | 방법 | 표시 |
|---|---|---|
| shorts · youtube | 지금 `fetchYoutubeTitle`(oEmbed, 앱에서 바로) | 제목 / 채널 이름 |
| blog | Edge Function `link-meta` | 제목 / 블로그 닉네임(없으면 블로그 아이디) |
| reels · instagram · tiktok | **가져오지 않음** | 머리글 + 짧은 주소 |
| link | `link-meta`(og:title만) | 제목 / 호스트 |

- 인스타: Meta oEmbed는 작성자 · 캡션을 주지 않고, 그 데이터를 임베드 표시 말고는 쓰지 못하게 되어 있습니다. 페이지 긁기도 하지 않습니다.

### Edge Function — `supabase/functions/link-meta/index.ts`

- `POST { url }` → `{ title, author, finalUrl }`(못 찾으면 각 null). 로그인 사용자만(`Authorization` 확인).
- 허용 호스트만 엽니다: `blog.naver.com`, `m.blog.naver.com`, `naver.me`, `*.tistory.com`, `brunch.co.kr`, 그 밖의 `link`는 https만. 인스타 · 틱톡 · 유튜브 요청은 거절.
- `naver.me`는 리다이렉트를 따라가 `finalUrl`을 돌려줍니다. 네이버 블로그는 `https://m.blog.naver.com/{blogId}/{logNo}`로 바꿔서 엽니다(PC 주소는 iframe이라 메타가 없음).
- 읽는 것: `<meta property="og:title">`, `og:site_name`, `<meta name="author">` 또는 네이버의 `og:article:author` / 닉네임 메타. 본문은 읽지 않습니다. 응답은 앞 200KB까지만 읽고, 타임아웃 4초.
- 네이버 블로그 작성자가 없으면 `blogId`를 author로.
- 같은 URL은 하루 캐시(테이블 `link_meta_cache(url primary key, title, author, fetched_at)`. 위 마이그레이션에 같이 넣어 주세요).

### 앱 — `fetchLinkMeta(url, kind, signal)` (sourceLink.ts)
- youtube 계열 → `fetchYoutubeTitle`. blog · link → `supabase.functions.invoke("link-meta")`. 그 밖은 바로 null.
- 실패하면 null. 화면은 짧은 주소로 대신 보여줍니다.

## 5. 화면

### 1 — 어느 가게인가요 (여러 곳 고르기) · `app/wish/link.tsx`

- **링크 카드**: 왼쪽 36 검정 사각 + `sourceIcon`. 오른쪽 세 줄: Mono 10 머리글(`headOf`) · 제목 13 한 줄 말줄임 · 작성자 11.5 `C.faint` 「{author} · {짧은 주소}」. 메타가 없으면 둘째 줄에 짧은 주소만(지금과 같음). 메타를 받는 동안은 둘째 줄에 짧은 주소를 먼저 보여 주고, 오면 바꿉니다.
- 유튜브 · 블로그는 제목에서 `queryFromTitle`로 뽑은 말을 검색칸에 미리 채웁니다. 인스타 · 링크는 비워서 시작합니다.
- 카드 아래 오른쪽 끝에 Mono 10 「{n} / 10」. 라벨은 두지 않습니다.
- **고른 가게 칩**(높이 34, radius 17, 벽돌 테두리 + 벽돌 10% 바탕 + 벽돌 글자 12.5 Md + 「✕」). 누르면 빠집니다. 고른 게 없으면 그 자리에 `C.faint` 12 「게시물에 나온 가게를 모두 골라 주세요」.
- 「가게 찾기」 Eyebrow + 검색칸(지금 그대로).
- **검색 결과**: 3개 → **5개**로. 줄 오른쪽에 24px 원형 체크(빈 것: 1.5 `#cdc6b8` 테두리 / 고른 것: 벽돌 바탕 + 흰 ✓). 고른 줄 바탕 `#fbf3ee`. **누르면 체크만** 되고 화면은 그대로입니다. 검색어를 바꿔도 고른 것은 유지됩니다.
- 이미 위시에 있는 가게(지금 `matchWish` 기준)는 바탕 `#f3f0e9`, 이름 `#a29a8c`, 메타 끝에 「· 이미 담음」, 누를 수 없음.
- 10곳이 차면 더 눌러도 안 들어가고 토스트 「한 번에 10곳까지 담을 수 있어요」.
- **아래 고정 버튼**(높이 54, radius 20): 0곳 `#bdb6a9` 「가게를 골라 주세요」(비활성) / n곳 검정 「{n}곳 · 선택 완료」.
  - **1곳** → 지금 `pick()` 그대로(폼에서 왔으면 `linkPick`으로 돌려주고 닫기 / 공유에서 왔으면 `/wish/new`). `source_title`, `source_author`도 같이 넘깁니다.
  - **2곳 이상** → `/wish/group`으로(고른 가게 · 링크 · 메타를 store에 담아 넘김).
- 위시 폼(from=form)에서 들어와 2곳 이상 고르면: 폼에 적던 내용은 버리고 그룹 화면으로 갑니다. 폼에 메모가 적혀 있으면 「적던 내용은 담기지 않아요」 확인을 한 번 띄웁니다.

### 2 — 그룹으로 담기 · 신규 `app/wish/group.tsx` (modal)

- 머리: 왼쪽 「‹ 가게 고르기」(뒤로, 고른 것 유지) · 가운데 세리프 18 「그룹으로 담기」.
- **출처 띠**: 지금 위시 폼의 출처 띠와 같은 모양(`#f9efe8` 바탕, `#e0c3b1` 테두리, radius 14). 글자 「{라벨}에서 담음 · {제목 앞 16자…} · {작성자}」(메타가 없으면 「· {짧은 주소}」).
- **그룹 이름**(Eyebrow 「그룹 이름」): 높이 52 입력칸, 세리프 16 bold, 벽돌 1.5 테두리, 오른쪽 Mono 「n / 20」. **필수**. 들어오면 바로 포커스.
- 아래 **추천 이름** 점선 칩 3개(누르면 입력칸에 채움):
  1. 고른 가게들 주소에서 가장 많이 나온 동 + 「 한 바퀴」 또는 「 맛집」(예: 「망원 한 바퀴」)
  2. 최근에 쓴 그룹 이름 하나(있으면)
  3. `{라벨} {MM.DD}`(예: 「블로그 10.19」)
- **담을 곳**(Eyebrow, 오른쪽 Mono 「n곳」): 테두리 카드 안에 고른 순서대로 번호 원(22, 벽돌) · 가게 이름 세리프 14 · 「종류 · 주소」 11. 길게 눌러 끌면 순서를 바꿉니다(`group_pos`).
- **갈 날짜** 줄(높이 46): 오른쪽 「언젠가 ›」, 누르면 날짜 고르기. 정하면 그룹의 모든 가게 `plan_date`가 그 날짜.
- **아래 고정 버튼**: 검정 「{n}곳 담기」. 이름이 비어 있으면 비활성.
- 저장:
  1. `wish_groups` insert(name, source_*)
  2. `wishes` insert n건: 가게마다 name · where_text · category · lat · lng · `plan_date` · `group_id` · `group_pos` · source_url · source_kind · source_title · source_author. note는 비움
  3. 하나라도 실패하면 만든 그룹과 위시를 지우고 오류 토스트
  4. 성공하면 모달을 닫고 지도 시트를 위시리스트로 바꾼 뒤 그 그룹을 펼친 상태로 보여 줍니다. 토스트 「{이름} · {n}곳을 담았어요」

### 3 — 위시리스트 그룹 줄 · `src/features/map/WishSegment.tsx`

- `useWishItems`: `group_id`가 있는 위시는 **그룹 하나로 모아** 한 항목(`t: "group"`)으로 만듭니다.
  - 그룹 안 위시 중 하나라도 `plan_date`가 있으면 그룹은 「예정」에, 정렬 기준은 그 그룹의 가장 이른 날짜. 아니면 「언젠가」.
  - 「예정 · N」 「언젠가 · N」의 N은 **가게 수**로 셉니다(그룹 하나 = 가게 n곳).
  - 그룹에 1곳만 남으면 그룹 줄 대신 보통 위시 줄로 보여 줍니다(그룹은 유지).
- **그룹 줄(접힘)**: 보통 위시 카드와 같은 테두리 · radius 18. 왼쪽 34 정사각(radius 10, `#efebe2` 바탕) 안에 Mono 12 벽돌 숫자(가게 수). 가운데 세리프 15 그룹 이름 + 11 `C.faint` 한 줄 「{라벨} · 가게1 · 가게2 · 가게3」. 오른쪽 `⌄`. 예정이면 오른쪽에 날짜 알약(지금과 같은 점선 벽돌).
- **누르면 그 자리에서 펼침**(`⌃`, 테두리 `#e0c3b1`). 펼친 상태는 화면에 있는 동안만 기억.
  - 위 경계선 아래로 가게 줄: 왼쪽을 61px 들여서 세리프 14 이름 + 11 메타, 오른쪽 「날짜 정하기」 또는 날짜 알약(지금 `WishRow`와 같은 동작). 가게 줄을 누르면 지금처럼 `/wish/[id]`.
  - 맨 아래 버튼 줄(높이 30 알약): 「{라벨}에서 보기 ↗」(출처가 있을 때) · 「이름 바꾸기」(입력 알림, 20자) · 오른쪽 벽돌 테두리 「날짜 정하기」(그룹 전체 `plan_date`를 한 번에, 이미 있으면 그 날짜를 보여 주고 바꾸기).
  - 그룹 줄을 길게 누르면 「그룹 풀기」(위시는 남기고 `group_id`만 비움) · 「그룹째 지우기」(확인 후 위시까지 삭제).
- 지도 핀은 그룹과 상관없이 가게마다 찍힙니다(지금 그대로).
- 「이 지도 범위」로 좁힐 때는 범위 안의 가게만 세고, 그룹 줄은 범위 안 가게가 1곳 이상이면 보입니다(펼치면 범위 안 가게만).

### 위시 상세 `app/wish/[id].tsx`

- 그룹에 속한 위시면 가게 이름 위에 Mono 10 「{그룹 이름} · {pos}/{n}」.
- 「그룹에서 빼기」 메뉴 추가(`group_id`, `group_pos` null).
- 출처 버튼은 그룹이 아니라 그 위시의 `source_url`을 엽니다(같은 값).

### 기록으로 바뀔 때

- 지금처럼 그 위시만 기록이 되고 위시는 지워집니다. 트리거가 남은 가게가 없으면 그룹을 지웁니다.
- `from_wish`에 `group_name` 추가.

## 6. 하지 않는 것

- 인스타 · 틱톡 제목 · 작성자 · 썸네일 가져오기
- 게시물 본문에서 가게 이름을 자동으로 뽑기(검색어 미리 채우기는 제목에서만)
- 그룹끼리 합치기, 남의 그룹 공유

## 7. 확인할 것

1. `instagram.com/p/…` → 「INSTAGRAM 게시물」, `instagram.com/reel/…` → 「INSTAGRAM 릴스」
2. `blog.naver.com/{id}/{no}`, `naver.me/xxxx` → 「NAVER 블로그」 + 제목 · 작성자. 함수가 실패해도 짧은 주소로 계속 진행
3. `example.com/글` → 「LINK」로 받아짐, 막히지 않음
4. 1곳 고르기 → 지금과 같은 위시 폼, 출처 띠에 제목이 같이 저장
5. 3곳 → 그룹 이름 비우면 버튼 비활성 → 「망원 한 바퀴」로 담기 → 위시리스트에 그룹 한 줄, 「언젠가 · 3」
6. 그룹 「날짜 정하기」 → 3곳 모두 같은 날짜, 그룹이 「예정」으로
7. 그룹 안 1곳을 기록 → 2곳만 남음 / 나머지도 기록 → 그룹 사라짐
8. 이미 위시에 있는 가게는 고를 수 없음, 11번째는 안 들어감
9. 공유 시트(cold · warm)로 들어와도 같은 흐름
10. `npx tsc --noEmit` 통과
