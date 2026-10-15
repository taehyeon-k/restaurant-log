# Claude Code 지시서 — 연인 기록 「내 기록에도 남기기」

저장소 `taehyeon-k/restaurant-log`. 작업 범위는 `expo-app/`과 `supabase/migrations/`입니다.

## 할 일

연인 기록장에서 **내가 찍은 기록**을 개인 기록장에 복사본으로 한 번 남기는 기능을 만듭니다.

- 옮기는 것: 기록 행 전체(사진, 메뉴, 내 별점·메모, 가게 정보, `verified`, `verified_at`)
- 옮기지 않는 것: 상대의 `record_notes`, `anniversary_picks`, `pending`, `visibility`
- 같은 원본은 한 기록장에 한 번만 남깁니다. 개인 쪽 복사본을 지우면 다시 남길 수 있습니다.
- 연결이 끊긴(읽기 전용) 연인 기록장에서도 남길 수 있습니다.
- 복사 뒤에는 서로 독립입니다. 한쪽을 고쳐도 다른 쪽은 바뀌지 않습니다.

## 1. 마이그레이션 두 개

### 1-1. `supabase/migrations/20261016000000_copy_couple_record.sql`

기존 `set_restaurants_verified_at` 트리거는 insert 때 `verified_at`을 `now()`로 덮어씁니다. 그대로 복사하면 원본의 인증 시각이 사라지므로, 아래 내용으로 파일을 만드세요.

```sql
alter table public.restaurants
  add column if not exists source_record_id bigint references public.restaurants(id) on delete set null,
  add column if not exists copied_at timestamptz;

create unique index if not exists restaurants_source_once_idx
  on public.restaurants (book_id, source_record_id) where source_record_id is not null;

create or replace function public.set_restaurants_verified_at()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  if tg_op = 'UPDATE' then
    new.source_record_id := old.source_record_id;
    new.copied_at := old.copied_at;
  end if;

  if tg_op = 'INSERT' and new.source_record_id is not null then
    select user_id, verified, verified_at into s from public.restaurants where id = new.source_record_id;
    if s.user_id is null or s.user_id <> new.user_id then raise exception 'not_my_record'; end if;
    new.verified := s.verified;
    new.verified_at := s.verified_at;
    new.copied_at := now();
    return new;
  end if;

  if new.verified is true then
    if tg_op = 'UPDATE' and old.verified is true and old.verified_at is not null then
      new.verified_at := old.verified_at;
    else
      new.verified_at := now();
    end if;
  else
    new.verified_at := null;
  end if;
  return new;
end $$;

create or replace function public.copy_record_to_personal(p_record bigint) returns bigint
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  src public.restaurants;
  pbook uuid;
  cols text;
  new_id bigint;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  select * into src from public.restaurants where id = p_record;
  if src.id is null or not public.is_book_member(src.book_id) then raise exception 'not_found'; end if;
  if src.user_id <> uid then raise exception 'not_my_record'; end if;
  if coalesce(src.pending, false) then raise exception 'pending_record'; end if;
  if not exists (select 1 from public.books where id = src.book_id and kind = 'couple') then raise exception 'not_couple_record'; end if;

  pbook := public.personal_book_id(uid);

  select id into new_id from public.restaurants where book_id = pbook and source_record_id = p_record;
  if new_id is not null then return new_id; end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'restaurants'
    and is_generated = 'NEVER'
    and column_name not in ('id', 'book_id', 'source_record_id', 'copied_at', 'created_at', 'updated_at', 'verified_at', 'pending', 'visibility');

  execute format(
    'insert into public.restaurants (%1$s, book_id, source_record_id) select %1$s, $1, $2 from public.restaurants where id = $2 returning id',
    cols
  ) into new_id using pbook, p_record;

  return new_id;
end $$;

revoke execute on function public.copy_record_to_personal(bigint) from public, anon;
grant execute on function public.copy_record_to_personal(bigint) to authenticated;
```

먼저 `20260907000000_add_restaurants_verified_at.sql`의 원래 트리거 본문과 비교하세요. 복사 분기 말고 달라진 곳이 있으면 원래 동작을 유지하세요.

### 1-2. `supabase/migrations/20261016000100_community_skip_copies.sql`

`20261015000100_community.sql`의 집계는 `user_id` 기준이라 복사본까지 세어 같은 방문이 두 번 잡힙니다. restaurants를 `verified`로 세는 모든 함수에 `and r.source_record_id is null and r.copied_at is null`(별칭에 맞게)을 추가해 다시 정의하세요. 적어도 다음 세 곳입니다.

- `my_verified_count()`
- 순위표 함수의 `in_period` CTE
- `mine.user_id = auth.uid() and mine.verified`로 조인하는 함수

`grep -n "verified" supabase/migrations/20261015000100_community.sql`로 빠진 곳이 없는지 확인하세요. `available_tickets`는 개인 기록장만 세므로 바꾸지 않습니다.

## 2. 앱

### 2-1. 타입 · 데이터

- `src/lib/types.ts`의 `Restaurant`에 `source_record_id: number | null;`와 `copied_at: string | null;`를 추가합니다.
- `src/data/books.ts`
  - `ERRORS`에 추가합니다.
    ```ts
    not_my_record: "내가 찍은 기록만 남길 수 있어요",
    pending_record: "보관함 기록은 먼저 저장해 주세요",
    not_couple_record: "연인 기록에서만 쓸 수 있어요",
    not_found: "기록을 찾지 못했어요",
    ```
  - 함수를 추가합니다.
    ```ts
    export async function copyToPersonal(qc: QueryClient, recordId: number): Promise<number> {
      const { data, error } = await supabase.rpc("copy_record_to_personal", { p_record: recordId });
      if (error) throw friendly(error.message);
      await qc.invalidateQueries({ queryKey: ["restaurants"] });
      return data as number;
    }
    ```
- 복사본 찾기: 기록 화면에서 `usePersonalRows()`의 `rows.find(r => r.source_record_id === record.id)`

### 2-2. 기록 화면 `app/record/[id].tsx`

- 보이는 조건: `isCouple && record.user_id === me?.userId && !record.pending`. `readOnly`여도 보여야 합니다. 그래서 지금 `{!readOnly && …}`로 묶인 액션 블록 밖에 따로 둡니다. 위치는 「또 갈 예정으로 담기」 바로 아래, 「기록 수정 / 지우기」 위입니다(읽기 전용이면 액션 블록 자리).
- **복사본이 없을 때:** 「내 기록에도 남기기」 버튼
  - `minHeight 50, borderRadius 18, borderWidth 1.5, borderColor C.ink, backgroundColor C.card`, 가운데 정렬, `gap 8`
  - 왼쪽에 20px 원(`#efe9dc`), 그 안에 `MenuLines size={11}`
  - 글자 `F.sansMd 13.5 C.ink`
  - 누르면 2-3의 확인 시트를 엽니다.
- **복사본이 있을 때:** 「내 기록에도 있어요」 줄
  - `minHeight 50, borderRadius 18, borderWidth 1, borderColor "#e0c3b1", backgroundColor C.brickSoft, paddingHorizontal 16, flexDirection row, alignItems center, gap 10`
  - 벽돌색 체크 svg 14(`M5 12.5l4.5 4.5L19 7.5`, strokeWidth 2.6), 글자 `F.sans 13 #a34d27`, 오른쪽 끝에 「보기 ›」 `F.sans 12 C.brick`
  - 누르면 `setActiveBook(personal.id)` 후 `router.replace({ pathname: "/record/[id]", params: { id: String(copy.id) } })`
- **남긴 직후:** 화면 아래 `bottom: insets.bottom + 16`, 좌우 24에 3초 동안 띠를 띄웁니다.
  - `C.ink` 배경, `borderRadius 16`, `padding 13/16`
  - 「개인 기록에 남겼어요」 `12.5 C.card`, 오른쪽에 「개인 기록 열기」 `12 #e7b79f`
  - 「개인 기록 열기」는 「보기 ›」와 같은 동작입니다.

### 2-3. 확인 시트 (같은 파일 안 컴포넌트, `BottomSheetModal`)

- 제목 「내 기록에도 남길까요?」 `F.serif 19`
- 그 아래 `marginTop 4, F.mono 11 C.faint`로 `{record.name} · {dottedWithDay(record.visited_at)}`
- 목록 카드: `marginTop 16, borderRadius 18, borderWidth 1, borderColor C.lineSoft, backgroundColor C.card, paddingHorizontal 14, paddingVertical 4`
  - 각 줄 `minHeight 44`, 줄 사이 `#efeae0` 1px, 왼쪽 벽돌색 체크 14 + 글자 `F.sans 13`
  - 「사진 {photos.length}장 · 대표 사진」 — 사진이 없으면 뺍니다.
  - 「인증마크 · {verifiedTime(record.verified_at)} 인증 시각」 — 인증 안 된 기록이면 뺍니다. 시각은 `F.mono 11.5`
  - 「메뉴 · 내 별점과 한 줄」
  - 마지막 줄은 체크 대신 「–」, 글자 `C.faint`: 「{partner?.nickname ?? "상대"}의 한 줄 · 기념일 라벨은 옮기지 않아요」
- 안내 문구 `marginTop 12, F.sans 11.5, lineHeight 18, C.faint`: 「개인 기록장에 따로 저장돼요. 나중에 한쪽을 고쳐도 다른 쪽은 그대로예요.」
- 버튼 줄 `marginTop 18, flexDirection row, gap 8`
  - 「취소」: `minHeight 50, borderRadius 18, borderWidth 1, borderColor "#ded8cb", paddingHorizontal 22`, 글자 `13 C.muted`
  - 「내 기록에 남기기」: `flex 1, C.ink` 배경, 글자 `F.sansMd 13.5 C.card`. 저장 중에는 「남기는 중…」을 띄우고 둘 다 막습니다.
  - 성공하면 시트를 닫고 2-2의 띠를 띄웁니다. 실패하면 버튼 위에 `12 #a8412a`로 오류를 보여줍니다.

### 2-4. 개인 기록 쪽 표시

- `app/record/[id].tsx`에서 지금 기록장이 개인이고 `record.copied_at`이 있으면, 분류·지역 줄 아래(`marginTop 12, alignSelf flex-start`)에 칩을 붙입니다.
  - `flexDirection row, alignItems center, gap 7, borderRadius 12, backgroundColor "#e3e9ec", paddingVertical 5, paddingLeft 5, paddingRight 10`
  - `Pair me={me} partner={…} size={18} overlap={6} ring="#e3e9ec"` — 개인 기록장에서는 상대 정보가 없으므로, `books.couple`의 멤버에서 상대를 찾고 없으면 null(빈 원)로 둡니다.
  - 글자 「연인 기록에서 가져옴」 `F.sans 11.5 PARTNER_COLOR`
  - 칩은 눌러도 동작하지 않습니다.
- 지도 카드·캘린더·라벨은 바꾸지 않습니다. 복사본은 일반 개인 기록과 똑같이 다룹니다.

## 3. 확인

1. 인증된 연인 기록을 남긴 뒤, 개인 기록의 방문 시각이 원본과 같은지(오늘 시각이 아닌지)
2. 빠르게 두 번 눌러도 개인 기록이 하나만 생기는지
3. 상대가 찍은 기록에는 버튼이 없는지, RPC를 직접 불러도 `not_my_record`가 나는지
4. 개인 복사본을 지우면 연인 기록 화면이 다시 「내 기록에도 남기기」로 돌아오는지
5. 커뮤니티 인증 수가 복사 전후로 같은지
6. `npx tsc --noEmit` 통과

끝나면 마이그레이션 두 파일을 SQL Editor에서 실행할 순서(1-1 → 1-2)를 알려 주세요.
