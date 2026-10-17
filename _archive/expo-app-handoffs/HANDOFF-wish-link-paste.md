# 위시 담기: 링크 붙여넣기

대상: Expo 앱 (TestFlight 배포 중). **JS만 바꾸면 되는 작업이다.** 네이티브 모듈이나 공유 확장은 넣지 않는다. 새 빌드 없이 OTA(EAS Update)로 반영되어야 한다.
참고 시안: `DINARY 앱 전체 프로토.dc.html` (위시 담기 폼 → 링크)

## 바꿀 점
지금은 위시 담기 폼에서 「링크」를 누르면 샘플 링크가 그대로 들어간다.
→ 바꿀 동작: 사용자가 유튜브나 인스타에서 **복사해 온 링크를 직접 붙여넣는다.**

## 흐름
1. 위시 담기 폼의 「링크」 줄을 누른다.
2. 그 자리에 입력창이 열리고 키보드가 올라온다 (autoFocus).
   - 입력창 placeholder: `복사한 링크를 붙여넣으세요`
   - 입력창 오른쪽: 「붙여넣기」 버튼과 ✕ (닫기)
3. 링크를 넣는 방법은 둘이다.
   - 입력창을 길게 눌러 붙여넣기
   - 「붙여넣기」 버튼: `expo-clipboard`의 `Clipboard.getStringAsync()`로 바로 읽는다
4. 올바른 링크가 들어오면 바로 「어느 가게인가요」 화면으로 넘어간다. 따로 확인 버튼은 없다.
5. 가게를 고르면 폼으로 돌아오고, 출처 줄에 `{라벨}에서 담음 · {짧은 주소}`가 표시된다. ✕를 누르면 출처가 지워진다.
6. 저장하면 위시 항목에 `source_url`, `source_kind`이 같이 저장된다. 상세 화면에는 `{라벨}에서 보기` 버튼이 있고, 누르면 `Linking.openURL(url)`로 원래 영상을 연다.

## 링크 판별
```ts
function parseSourceLink(raw: string) {
  const m = raw.trim().match(/https?:\/\/\S+|(?:www\.)?(?:youtube\.com|youtu\.be|instagram\.com)\/\S+/i);
  if (!m) return null;
  let url = m[0];
  if (!/^https?:/i.test(url)) url = 'https://' + url;
  const yt = /youtube\.com|youtu\.be/i.test(url);
  const ig = /instagram\.com/i.test(url);
  if (!yt && !ig) return { error: 'unsupported' as const };
  const shorts = yt && /shorts/i.test(url);
  const kind = yt ? (shorts ? 'shorts' : 'youtube') : 'reel';
  const label = { shorts: '쇼츠', youtube: '유튜브', reel: '릴스' }[kind];
  const bare = url.replace(/^https?:\/\/(www\.|m\.)?/i, '');
  const short = bare.length > 28 ? bare.slice(0, 26) + '…' : bare;
  return { url, kind, label, short };
}
```
- 공유 문구 안에 링크가 섞여 있어도 (`"이 영상 봐 https://youtu.be/..."`) 링크만 뽑아낸다.
- 유튜브나 인스타가 아닌 링크이거나, 링크가 없는 글을 붙여넣으면 입력창 아래에 `유튜브나 인스타그램 링크를 넣어주세요`를 벽돌색(#b4552d) 11.5px로 띄운다.
- 「붙여넣기」 버튼을 눌렀는데 클립보드가 비어 있으면 토스트 `복사한 링크가 없어요`를 띄운다.

## 「어느 가게인가요」 화면
- 맨 위 카드: `head` (`YOUTUBE 쇼츠` / `YOUTUBE` / `INSTAGRAM 릴스`)와 붙여넣은 주소를 보여준다.
- 가게 검색칸은 **비워서 시작한다.** 영상 제목은 가져오지 않는다 (제목 가져오기는 다음 단계).
- 2글자 이상 입력하면 기존 가게 검색(카카오/네이버 등 지금 쓰는 API)의 결과를 보여준다. 시안에 있는 결과 목록은 샘플 데이터다.

## 데이터
위시 테이블(Supabase)에 컬럼이 없으면 추가한다. nullable이므로 앱 빌드와는 상관없다.
```sql
alter table wishes add column if not exists source_url text;
alter table wishes add column if not exists source_kind text; -- 'shorts' | 'youtube' | 'reel'
```

## 스타일
- 입력창: 높이 56, radius 16, 테두리 1.5px #b4552d, 배경 #fbfaf6
- 「붙여넣기」 버튼: 배경 #1c1a17, 글자 #fbfaf6, 높이 40, radius 12, 12px
- 닫기 ✕: #a29a8c
- 터치 영역은 최소 44px로 한다.

## 이번에 하지 않는 것
- 유튜브나 인스타의 공유 버튼으로 바로 넘겨받기 (iOS 공유 확장. 네이티브 빌드가 필요하다)
- 영상 제목이나 썸네일 자동으로 가져오기
