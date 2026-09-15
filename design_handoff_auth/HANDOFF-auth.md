# HANDOFF — 로그인과 계정 (카카오 · 구글)

시안: `DINARY 로그인.dc.html` (01 로그인 / 02 닉네임 / 03 프로필)
대상 저장소: `taehyeon-k/restaurant-log` (main, `ed6b0f2f` 기준)

## 0. 정한 것

| 항목 | 결정 |
|---|---|
| 로그인 시점 | 앱을 열면 바로 로그인 화면. 로그인 없이는 어떤 화면도 열리지 않음 |
| 수단 | 카카오, 구글 (이메일·애플 없음) |
| 공개 범위 | 완전 비공개. 남의 기록은 지도에 점으로도 뜨지 않음 |
| 기존 데이터 | 지금 저장소에 있는 기록 전부를 내 계정 하나로 귀속 |
| 프로필 | 닉네임·사진·통계가 있는 화면 (탭바 5번째) |
| 닉네임 | 첫 로그인 직후 1단계로 물음. OAuth 이름을 미리 채움 |

인증마크 규칙은 바뀌지 않습니다. 계정이 생겨도 도장은 그 자리에서 찍은 사진으로만 찍힙니다.

## 1. Supabase 설정

1. Authentication → Providers → **Kakao** 켜기. 카카오 개발자 콘솔의 REST API 키 / Client Secret 입력. (지오코딩에 쓰는 앱과 같은 앱을 써도 됩니다.)
   - 카카오 앱 → 카카오 로그인 → 활성화 ON, Redirect URI에 `https://<project-ref>.supabase.co/auth/v1/callback`
   - 동의항목: 닉네임(필수), 프로필 사진(선택). **이메일은 "사용 안 함"** — 이메일 동의항목은 비즈 앱 전환·검수가 필요하고, DINARY는 소유자를 Supabase uuid로만 구분하므로 받을 이유가 없습니다
2. Authentication → Providers → **Google** 켜기. Google Cloud 콘솔 OAuth 클라이언트(웹)의 ID/Secret, 승인된 리디렉션 URI에 같은 callback 주소.
   - Google OAuth 동의 화면은 "게시(프로덕션)"로 전환해야 테스트 사용자 100명 제한이 풀립니다. 기본 범위(email·profile)만 쓰면 구글 검증 절차는 없습니다
3. Authentication → URL Configuration → Site URL에 Vercel 주소, Redirect URLs에 `http://localhost:3000/**` 와 배포 주소 `/**` 추가.

## 2. 마이그레이션 — `supabase/migrations/20260915000000_add_auth.sql`

기존 두 테이블은 `user_id` 도 RLS도 없는 1인용입니다. 다음 순서로 바꿉니다.

```sql
-- 1) 프로필
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- 2) 소유자 칸
alter table public.restaurants add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.wishes      add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- 3) 기존 기록 귀속 — <MY_UUID> 는 카카오로 한 번 로그인한 뒤
--    Authentication → Users 에서 복사한 내 uuid
update public.restaurants set user_id = '<MY_UUID>' where user_id is null;
update public.wishes      set user_id = '<MY_UUID>' where user_id is null;

alter table public.restaurants alter column user_id set not null;
alter table public.wishes      alter column user_id set not null;

create index if not exists restaurants_user_idx on public.restaurants(user_id);
create index if not exists wishes_user_idx      on public.wishes(user_id);

-- 4) RLS — 본인 것만 읽고 쓰기
alter table public.restaurants enable row level security;
alter table public.wishes      enable row level security;
alter table public.profiles    enable row level security;

create policy "own restaurants" on public.restaurants
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own wishes" on public.wishes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- 5) 가입하면 프로필 한 줄
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (new.id,
          new.raw_user_meta_data->>'name',
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

**순서 주의**: 3)의 귀속을 건너뛰고 RLS를 켜면 기존 기록 128건이 화면에서 통째로 사라집니다. 반드시 내 uuid를 먼저 채우세요.

사진 스토리지 버킷도 같이 잠급니다 — 버킷을 private으로 돌리고, 객체 경로를 `${user.id}/...` 로 두어 `(storage.foldername(name))[1] = auth.uid()::text` 정책을 겁니다. 이미 올라간 파일은 경로를 옮기거나, 당장은 버킷만 public으로 남겨두고 다음 작업으로 미뤄도 됩니다(주소를 아는 사람만 볼 수 있는 상태).

## 3. 코드

### 3.1 클라이언트 교체
`@supabase/ssr` 는 이미 package.json 에 있습니다(0.12.5). `src/lib/supabase.ts` 를 둘로 나눕니다.
- `supabase/client.ts` — `createBrowserClient(url, key)`
- `supabase/server.ts` — `createServerClient(...)` + `cookies()`

지금 `supabase` 를 직접 가져다 쓰는 곳(`src/lib/places.ts`, `page.tsx`, 폼들)은 새 클라이언트로 바꿉니다. insert 할 때 `user_id: user.id` 를 넣어줍니다.

### 3.2 미들웨어 — `src/middleware.ts` (신규)
세션을 갱신하고, 없으면 `/login` 으로 보냅니다.
```
matcher: 정적파일·/login·/auth/callback 을 뺀 전부
```

### 3.3 새 라우트
| 경로 | 내용 |
|---|---|
| `/login` | 시안 01(폰)·시안 04(데스크톱). 서버 컴포넌트 껍데기 + 버튼만 클라이언트 |
| `/auth/callback` | `exchangeCodeForSession` 후 프로필의 `nickname` 이 비어 있으면 `/welcome`, 아니면 `/` |
| `/welcome` | 시안 02. 닉네임·사진 저장 후 `/` |
| `/privacy`, `/terms` | 6절. 로그인 없이 열려야 함 |

프로필은 새 라우트가 아닙니다 — `TabBar.tsx` 에 이미 `account`("내계정") 탭이 있고 지금은 빈 화면입니다. 시안 03을 그 탭의 내용으로 채웁니다.

버튼 동작:
```ts
supabase.auth.signInWithOAuth({
  provider: "kakao", // 또는 "google"
  options: { redirectTo: `${location.origin}/auth/callback` },
});
```

### 3.4 탭바
구조는 그대로 둡니다(이미 5칸 + 가운데 카메라). `account` 탭 아이콘만, 프로필 사진이 있으면 원형 21px 사진으로 바꾸고 없으면 지금 사람 아이콘 유지.

## 4. 화면 값

공통: 종이 `#f6f3ec`, 카드 `#fbfaf6`, 선 `#d8d3c8`/`#e2dccf`, 본문 `#1c1a17`, 보조 `#8a8377`, 벽돌 `#b4552d`. 제목은 Gowun Batang 700, 숫자·라벨은 JetBrains Mono.

코드에서는 하드코딩 대신 이미 있는 Tailwind 토큰을 씁니다 — `bg-paper`/`bg-card`/`border-line-soft`/`text-brick`/`var(--color-brick)`, 글꼴은 `font-mono`와 Gowun 변수.

**01 로그인** — 상단 여백 132px에 워드마크 `DINARY` 가운데 정렬, Gowun Batang 700, 58px, letter-spacing .14em, 먹색 `#1c1a17`. 바로 아래 12px "다이닝에 다이어리를 더하다." (연한 회색 `#b3aa9b` — 종이 배경이라 순백은 보이지 않음). 버튼은 바닥에 붙여 두 개, 높이 54px, radius 16px, 간격 11px.
- 카카오: 배경 `#fee500`, 글자 `#1c1a17`, 말풍선 마크 22px
- 구글: 배경 `#fbfaf6`, 1px `#d8d3c8` — **G 마크는 구글 공식 에셋을 받아 넣으세요.** 시안의 점선 원은 자리표시입니다. 구글 브랜드 가이드상 버튼 문구는 "Google로 시작하기" 표기를 권장합니다.
- 약관 문구 11px, 가운데.

**02 닉네임** — 사진 자리 78px 원, 입력은 밑줄 1.5px `#b4552d`, 글자 Gowun Batang 21px, 오른쪽에 `2/12` 카운터(최대 12자). OAuth 이름이 있으면 미리 채우고 "카카오 계정 이름을 가져왔습니다" 안내. 버튼은 벽돌색 꽉 찬 54px.

**04 데스크톱 로그인** — 같은 `/login` 라우트입니다. 종이색 바탕에 가운데 정렬 한 덩어리(폭 392px), 카드나 테두리 없음. 워드마크 68px, 버튼 높이 56px. 바닥에 52px 띄로 mono 10.5px — 왼쪽 `DINARY`, 오른쪽 "기록은 나만 봅니다". 폭 744px 미만이면 폰 레이아웃(시안 01)으로 — `Shell.tsx` 의 기준과 같습니다.

닉네임 화면(시안 02)도 데스크톱에서는 같은 392px 덩어리를 가운데 둡니다.

**03 프로필** — 사진 64px + 닉네임 21px + 연결 칩 + `SINCE 2026.03`. 통계 3칸(기록/인증/식당)은 한 카드에 세로줄로 나눔, 숫자 mono 22px이고 인증만 벽돌색. 아래 라벨첩 요약, 그 아래 목록 카드(계정 연결 / 기록 내려받기 / 로그아웃 / 회원 탈퇴), 각 행 50px.

통계 쿼리:
- 기록 = `count(*) where pending = false`
- 인증 = `count(*) where verified`
- 식당 = `count(distinct place_key)` (없으면 이름 기준)

## 5. 확인 목록

- [ ] 로그아웃 상태에서 `/`, `/calendar` 직접 열면 `/login` 으로 감
- [ ] 카카오로 첫 로그인 → `/welcome` → 닉네임 저장 → 지도
- [ ] 같은 계정 재로그인은 `/welcome` 건너뜀
- [ ] 다른 계정으로 로그인하면 기록 0건(내 128건이 보이면 RLS 실패)
- [ ] 촬영 인증 흐름에서 저장된 기록에 `user_id` 가 들어감
- [ ] Vercel 환경변수 그대로, 리디렉션 주소 등록됨

## 6. 약관·개인정보 처리방침 페이지 (구글 게시에 필요)

Google OAuth 동의 화면을 "게시"하려면 브랜딩 항목에 실제로 열리는 링크 두 개가 있어야 합니다.

브랜딩 입력값
- 앱 이름: `DINARY` / 지원 이메일: 소유자 지메일
- 앱 로고: **비워둠** (로고를 올리면 구글 브랜드 검증 대상이 됩니다)
- 애플리케이션 홈페이지: `https://restaurant-log-pied.vercel.app`
- 개인정보처리방침: `https://restaurant-log-pied.vercel.app/privacy`
- 서비스 약관: `https://restaurant-log-pied.vercel.app/terms`
- 승인된 도메인: `vercel.app`

### 6.1 라우트

`src/app/privacy/page.tsx`, `src/app/terms/page.tsx` 를 만듭니다. 로그인 전에도 열려야 하므로 `middleware.ts` 의 matcher 에서 `/privacy`, `/terms` 를 제외하세요.

### 6.2 공통 레이아웃

종이 `#f6f3ec` 바탕, 본문 폭 `max-width: 640px`, 좌우 여백 24px, 위 72px / 아래 96px.
- 머리: mono 10px letter-spacing .18em 로 `PRIVACY` / `TERMS`, 그 아래 Gowun Batang 700 24px 제목, 그 아래 mono 11px `최종 수정 2026.09.15` (`#a29a8c`)
- 조 제목: Gowun Batang 700 15px, 위 여백 32px
- 본문: 13.5px / line-height 1.85 / `#3c3833`
- 맨 아래 `← DINARY로 돌아가기` 링크(벽돌색)

### 6.3 개인정보 처리방침 본문

> **DINARY 개인정보 처리방침**
> 최종 수정: 2026년 9월 15일
>
> DINARY(이하 "서비스")는 개인이 만든 식사 기록 서비스입니다. 아래 내용은 서비스가 어떤 정보를 받아 어떻게 쓰는지 정리한 것입니다.
>
> **1. 수집하는 정보**
> 가. 로그인할 때 — 카카오 또는 구글로 로그인하면 해당 계정의 고유 식별자, 닉네임, 프로필 사진 주소를 받습니다. 이메일·전화번호·성별·생년월일은 받지 않습니다.
> 나. 서비스를 쓰면서 — 이용자가 직접 남긴 식당 이름, 주소, 메모, 별점, 가격, 사진, 방문 날짜, 라벨, 가고 싶은 곳 목록이 저장됩니다.
> 다. 방문 인증 — 사진을 찍어 방문을 인증할 때 기기의 위치를 읽어 근처 식당 후보를 찾습니다. 이때 좌표 자체는 저장하지 않고, 위치 정확도(미터)와 인증이 통과한 시각만 기록에 남습니다.
>
> **2. 쓰는 곳**
> 받은 정보는 이용자 본인의 기록을 저장하고 보여주는 데에만 씁니다. 광고에 쓰지 않고, 이용자를 분석해 다른 곳에 넘기지 않습니다.
>
> **3. 공개 범위**
> 모든 기록은 비공개입니다. 다른 이용자에게 기록·사진·위치가 보이지 않으며, 지도에도 본인 기록만 표시됩니다.
>
> **4. 맡겨 둔 곳**
> 데이터베이스와 사진 보관에 Supabase, 웹 호스팅에 Vercel, 주소·장소 검색에 카카오 지도 API를 씁니다. 각 사업자는 자신의 정책에 따라 정보를 처리합니다.
>
> **5. 보관과 삭제**
> 기록은 이용자가 지우기 전까지 보관합니다. 프로필 화면의 회원 탈퇴를 누르면 계정과 계정에 속한 기록·사진이 모두 삭제되며 되돌릴 수 없습니다. 개별 기록은 언제든 지울 수 있습니다.
>
> **6. 이용자의 권리**
> 언제든 본인 기록을 보고, 고치고, 내려받고, 지울 수 있습니다. 카카오·구글 계정 연결 해제는 각 서비스의 연결된 앱 관리에서도 할 수 있습니다.
>
> **7. 문의**
> <연락받을 이메일 주소>

### 6.4 서비스 약관 본문

> **DINARY 이용약관**
> 최종 수정: 2026년 9월 15일
>
> **1. 서비스**
> DINARY는 이용자가 직접 남기는 식사 기록장입니다. 식당에서 찍은 사진과 위치로 방문을 인증하고, 그 기록을 지도와 달력으로 되돌아보게 합니다. 개인이 만들어 무료로 제공하며, 예고 없이 기능이 바뀌거나 중단될 수 있습니다.
>
> **2. 계정**
> 카카오 또는 구글 계정으로 로그인해 이용합니다. 계정 관리 책임은 이용자에게 있습니다.
>
> **3. 기록의 소유**
> 이용자가 올린 사진과 글의 권리는 이용자에게 있습니다. 서비스는 이를 이용자에게 보여주기 위해 저장하고 처리할 뿐, 다른 목적으로 쓰거나 공개하지 않습니다.
>
> **4. 방문 인증**
> 인증마크는 식당 자리에서 직접 찍은 사진에만 부여됩니다. 위치를 속이거나 인증을 우회하려는 시도는 금지합니다.
>
> **5. 금지하는 것**
> 법을 어기는 내용, 타인의 권리를 침해하는 사진과 글, 서비스를 무리하게 자동 호출하는 행위.
>
> **6. 책임의 한계**
> 무료로 제공하는 개인 서비스이므로 데이터 손실, 서비스 중단, 인증 오류로 생긴 손해에 대해 책임지지 않습니다. 중요한 기록은 내려받아 따로 보관하시기를 권합니다.
>
> **7. 해지**
> 프로필 화면의 회원 탈퇴로 언제든 그만둘 수 있고, 탈퇴하면 기록은 모두 삭제됩니다.
>
> **8. 문의**
> <연락받을 이메일 주소>

두 본문의 `<연락받을 이메일 주소>` 는 실제 주소로 바꿔야 합니다. 구글이 게시 심사 없이도 링크가 열리는지는 확인합니다.
