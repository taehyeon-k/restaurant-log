# 「이번 달 인증」 위젯 3종 반영 지시서

## 0. Claude Code 에 붙여 넣을 명령

```
expo-app/ 에 widget-month.zip 을 넣어 두었어. 이 안의 HANDOFF-widget-month.md 대로 위젯을 반영해 줘.

1. expo-app/widget-month.zip 을 풀어서
   - fonts/*.ttf 3개 → expo-app/targets/widget/fonts/
   - fonts/OFL-*.txt 2개 → expo-app/targets/widget/fonts/licenses/
   - HANDOFF-widget-month.md → handoff/HANDOFF-widget-month.md
   그 다음 zip 과 푼 임시 폴더는 지워.
2. HANDOFF-widget-month.md 의 2~7절을 순서대로 반영해:
   - targets/widget/Info.plist 에 UIAppFonts
   - app.json ios.entitlements 와 targets/widget/expo-target.config.js 에 App Group group.app.dinary
   - src/lib/widget.ts 신규, 기록 목록 로드 · 인증 기록 저장 · 기록 삭제 직후 syncMonthWidget(rows), 로그아웃 · 탈퇴 때 clearMonthWidget()
   - targets/widget/MonthWidgets.swift 신규
   - CaptureWidget.swift 의 @main 을 떼고 DinaryWidgets WidgetBundle 로 묶기
   - dinary://calendar 가 캘린더 탭으로 열리는지 확인, dinary://capture 처리하는 곳이 따로 있으면 같이 추가
3. 지시서 코드는 빌드 확인 전 초안이야. 실제 타입 · import 경로 · 기존 함수 이름(verifiedOnly, coverPhoto, ExtensionStorage)에 맞춰 고치고, 바꾼 점은 끝에 알려 줘.
4. 숫자는 세 위젯 모두 인증 횟수(count). placeCount 는 쓰는 곳이 없으면 빼도 돼.
5. 끝나면 npx tsc --noEmit 통과 확인, 그리고 내가 할 일(Apple Developer 에서 App Group 만들기, prebuild --clean, 개발 빌드)을 정리해 줘.
```

시안: `DINARY 위젯 구현.dc.html` **4a · 3a · 3c**. 기존 「바로 촬영」(`CaptureWidget`)은 그대로 두고, 같은 확장에 위젯 세 개를 더 넣습니다. 위젯 고르기 화면에 각각 따로 뜹니다(모두 systemSmall).

| 위젯 kind | 시안 | 고르기 화면 이름 |
|---|---|---|
| `MonthWidget` | 4a 「10월의 인증」 | 이번 달 인증 |
| `MonthDotsWidget` | 3a 도장 달력 | 이번 달 인증 · 달력 |
| `MonthPhotoWidget` | 3c 마지막 사진 | 이번 달 인증 · 사진 |

세 위젯 모두 누르면 `dinary://calendar`.

## 1. 모양

공통: 158×158 기준, 안쪽 여백 위아래 15 · 좌우 16(3c 는 12·14), 색 brick #b4552d · paper #fbfaf6 · ink #1c1a17 · line #e2ddd2 · mute #8a8377.

**4a**
- 바탕 paper. 위·가운데·아래로 벌림
- 위 「{M}월의 인증」 Gowun Batang Bold 13, ink
- 가운데 숫자 Gowun Batang Regular 62, brick, 단위 없음 — **인증 횟수**
- 아래 1pt line 위 8 여백 → 가게 이름 Gowun Bold 13 ink(한 줄 말줄임), `✓ MM.DD` JetBrains Mono 9.5 brick

**3a**
- 바탕 paper. 위 줄과 달력을 위·아래로 벌림
- 위 줄: 왼쪽 「{M}월」 Gowun Bold 15 ink, 오른쪽 숫자 JetBrains Mono 11 brick, 단위 없음 — **인증 횟수**
- 달력: 7칸 × 5~6줄 점, 지름 12, 줄 간격 5, 칸은 좌우로 벌림(일요일 시작)
  - 인증한 날: brick 채움
  - 오늘: 인증했으면 brick 채움 + paper 1.5 · brick 1.5 바깥 고리, 안 했으면 brick 1.5 테두리
  - 지난 날 #e2ddd2, 남은 날 #efebe3, 달 밖 칸은 비움
- 6줄이 필요한 달(1일이 금·토이고 31일까지 등)은 지름 11 · 줄 간격 4 로 줄여 넣음

**3c**
- 바탕: 마지막 인증 기록의 대표사진(`coverPhoto`) 가득 채움 + 아래로 어두워지는 그라데이션(40% 지점 투명 → 끝 ink 72%)
- 왼쪽 위 paper 알약(모서리 10, 여백 3·8): 숫자 Gowun Bold 15 brick + `{M}월` Mono 9 #6b665e, 간격 3 — 인증 횟수
- 왼쪽 아래: 가게 이름 Gowun Bold 14 paper, `✓ MM.DD` Mono 9.5 #f1d9cc, 간격 2
- 사진이 없으면 바탕을 brick 으로

**인증 없을 때**: 4a 는 숫자 0 을 #d8d2c6, 아래 줄 「아직 없어요」 + 「첫 식사를 찍어 보세요」(mute). 3a 는 숫자 0 을 mute 로, 점은 모두 회색. 3c 는 brick 바탕에 알약 0, 같은 두 줄.

## 2. 글꼴

위젯은 앱에서 불러온 글꼴을 못 씁니다. ttf 를 확장 폴더에 넣습니다.

```
expo-app/targets/widget/fonts/GowunBatang-Regular.ttf
expo-app/targets/widget/fonts/GowunBatang-Bold.ttf
expo-app/targets/widget/fonts/JetBrainsMono-Regular.ttf
```

`targets/widget/Info.plist`:

```xml
<key>UIAppFonts</key>
<array>
  <string>GowunBatang-Regular.ttf</string>
  <string>GowunBatang-Bold.ttf</string>
  <string>JetBrainsMono-Regular.ttf</string>
</array>
```

## 3. App Group

`app.json` → `ios.entitlements`:

```json
"com.apple.security.application-groups": ["group.app.dinary"]
```

`targets/widget/expo-target.config.js`:

```js
entitlements: {
  "com.apple.security.application-groups": ["group.app.dinary"],
},
```

Apple Developer 에서 `group.app.dinary` 생성 → `app.dinary`, `app.dinary.widget` 둘 다 켜기 → `npx expo prebuild --clean` + 개발 빌드 다시.

## 4. 앱 쪽 — `src/lib/widget.ts` (신규)

```ts
import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";
import * as ImageManipulator from "expo-image-manipulator";
import { verifiedOnly } from "./recommend";
import { coverPhoto, type Restaurant } from "./types";

const store = new ExtensionStorage("group.app.dinary");
const KINDS = ["MonthWidget", "MonthDotsWidget", "MonthPhotoWidget"];

/** 한국 시간 "YYYY-MM" */
const kstMonth = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 7);

let lastPhotoSrc = "";

export async function syncMonthWidget(rows: Restaurant[]) {
  if (Platform.OS !== "ios") return;
  const month = kstMonth(new Date().toISOString());
  const mine = verifiedOnly(rows)
    .filter((r) => kstMonth(r.verified_at!) === month)
    .sort((a, b) => (a.verified_at! < b.verified_at! ? 1 : -1));
  const last = mine[0];
  const places = new Set(mine.map((r) => r.place_key ?? `${r.name}|${r.address ?? ""}`.toLowerCase()));

  store.set("month", month);
  store.set("count", mine.length);
  store.set("placeCount", places.size);
  // 3a — 인증한 날(한국 시간 일) "2,5,9"
  const days = new Set(mine.map((r) => Number(new Date(new Date(r.verified_at!).getTime() + 9 * 3600e3).toISOString().slice(8, 10))));
  store.set("days", [...days].join(","));
  store.set("lastName", last?.name ?? "");
  store.set("lastAt", last?.verified_at ?? "");

  // 3c — 대표사진을 작게 줄여 base64 로. 같은 사진이면 다시 만들지 않습니다.
  const src = last ? coverPhoto(last) ?? "" : "";
  if (src !== lastPhotoSrc) {
    lastPhotoSrc = src;
    if (!src) store.set("lastPhoto", "");
    else {
      try {
        const out = await ImageManipulator.manipulateAsync(src, [{ resize: { width: 360 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
        store.set("lastPhoto", out.base64 ?? "");
      } catch { store.set("lastPhoto", ""); }
    }
  }
  KINDS.forEach((k) => ExtensionStorage.reloadWidget(k));
}

export function clearMonthWidget() {
  if (Platform.OS !== "ios") return;
  ["month", "days", "lastName", "lastAt", "lastPhoto"].forEach((k) => store.set(k, ""));
  store.set("count", 0); store.set("placeCount", 0);
  lastPhotoSrc = "";
  KINDS.forEach((k) => ExtensionStorage.reloadWidget(k));
}
```

부를 곳: 기록 목록을 새로 받은 직후(지도 탭 로드), 인증 기록 저장 직후, 기록 삭제 직후 → `syncMonthWidget(rows)`. 로그아웃·탈퇴 → `clearMonthWidget()`.

## 5. 위젯 쪽 — `targets/widget/MonthWidgets.swift` (신규)

```swift
import SwiftUI
import WidgetKit
import UIKit

// MARK: 데이터

struct MonthEntry: TimelineEntry {
  let date: Date
  let month: Int
  let count: Int
  let placeCount: Int
  let days: Set<Int>      // 인증한 날(일)
  let lastName: String
  let lastAt: String      // "MM.DD"
  let photo: UIImage?
  var empty: Bool { count == 0 }
}

private var kst: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Asia/Seoul")!; return c }

struct MonthProvider: TimelineProvider {
  let d = UserDefaults(suiteName: "group.app.dinary")

  func entry(at date: Date) -> MonthEntry {
    let m = kst.component(.month, from: date)
    let ym = String(format: "%04d-%02d", kst.component(.year, from: date), m)
    // 저장된 달이 지금 달과 다르면(새 달) 0
    guard d?.string(forKey: "month") == ym else {
      return MonthEntry(date: date, month: m, count: 0, placeCount: 0, days: [], lastName: "", lastAt: "", photo: nil)
    }
    var at = ""
    if let s = d?.string(forKey: "lastAt"), let t = ISO8601DateFormatter.withFraction.date(from: s) ?? ISO8601DateFormatter().date(from: s) {
      at = String(format: "%02d.%02d", kst.component(.month, from: t), kst.component(.day, from: t))
    }
    let img = (d?.string(forKey: "lastPhoto")).flatMap { Data(base64Encoded: $0) }.flatMap { UIImage(data: $0) }
    return MonthEntry(date: date, month: m, count: d?.integer(forKey: "count") ?? 0,
                      placeCount: d?.integer(forKey: "placeCount") ?? 0,
                      days: Set((d?.string(forKey: "days") ?? "").split(separator: ",").compactMap { Int($0) }),
                      lastName: d?.string(forKey: "lastName") ?? "", lastAt: at, photo: img)
  }

  func placeholder(in context: Context) -> MonthEntry {
    MonthEntry(date: .now, month: 10, count: 7, placeCount: 7, days: [2, 5, 9, 10, 14, 16, 18], lastName: "합정 수제비", lastAt: "10.14", photo: nil)
  }
  func getSnapshot(in context: Context, completion: @escaping (MonthEntry) -> Void) {
    completion(context.isPreview ? placeholder(in: context) : entry(at: .now))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<MonthEntry>) -> Void) {
    let now = Date()
    let next = kst.startOfDay(for: kst.date(byAdding: .day, value: 1, to: now)!)
    // 지금 한 장 + 내일 0시 한 장(3a 오늘 칸 · 새 달 0). 그 사이는 앱이 reloadWidget 으로 알립니다.
    completion(Timeline(entries: [entry(at: now), entry(at: next)], policy: .after(next)))
  }
}

extension ISO8601DateFormatter {
  static let withFraction: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
}

// MARK: 색 · 글꼴

private func hex(_ v: UInt32, _ a: Double = 1) -> Color {
  Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255, opacity: a)
}
private let brick = hex(0xb4552d), paper = hex(0xfbfaf6), ink = hex(0x1c1a17)
private let line = hex(0xe2ddd2), mute = hex(0x8a8377), sub = hex(0x6b665e), faint = hex(0xd8d2c6), blush = hex(0xf1d9cc)
private func batang(_ s: CGFloat, bold: Bool = false) -> Font { .custom(bold ? "GowunBatang-Bold" : "GowunBatang-Regular", size: s) }
private func mono(_ s: CGFloat) -> Font { .custom("JetBrainsMono-Regular", size: s) }
private let dayPast = hex(0xe2ddd2), dayAhead = hex(0xefebe3)

/// 4a · 3c 공통 아래 줄
private struct LastLine: View {
  let e: MonthEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Rectangle().fill(line).frame(height: 1)
      VStack(alignment: .leading, spacing: 3) {
        Text(e.empty ? "아직 없어요" : e.lastName).font(batang(13, bold: true)).foregroundColor(ink).lineLimit(1)
        Text(e.empty ? "첫 식사를 찍어 보세요" : "✓ \(e.lastAt)").font(mono(9.5)).foregroundColor(e.empty ? mute : brick)
      }.padding(.top, 8)
    }
  }
}

// MARK: 4a

struct MonthView: View {
  let e: MonthEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("\(e.month)월의 인증").font(batang(13, bold: true)).foregroundColor(ink)
      Spacer(minLength: 0)
      Text("\(e.count)").font(batang(62)).foregroundColor(e.empty ? faint : brick).lineLimit(1).minimumScaleFactor(0.6)
      Spacer(minLength: 0)
      LastLine(e: e)
    }
    .padding(.vertical, 15).padding(.horizontal, 16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: "dinary://calendar")!)
    .widgetBackground(paper, legacyPadding: false)
  }
}

// MARK: 3a

struct MonthDotsView: View {
  let e: MonthEntry

  /// 일요일 시작 칸. 0 = 달 밖.
  var cells: [Int] {
    let first = kst.date(from: kst.dateComponents([.year, .month], from: e.date))!
    let lead = kst.component(.weekday, from: first) - 1
    let n = kst.range(of: .day, in: .month, for: first)!.count
    let total = Int(ceil(Double(lead + n) / 7)) * 7
    return (0..<total).map { i in (i < lead || i - lead >= n) ? 0 : i - lead + 1 }
  }

  var body: some View {
    let today = kst.component(.day, from: e.date)
    let c = cells, six = c.count > 35
    let s: CGFloat = six ? 11 : 12, gap: CGFloat = six ? 4 : 5
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        Text("\(e.month)월").font(batang(15, bold: true)).foregroundColor(ink)
        Spacer()
        Text("\(e.count)").font(mono(11)).foregroundColor(e.empty ? mute : brick)
      }
      Spacer(minLength: 0)
      VStack(spacing: gap) {
        ForEach(0..<(c.count / 7), id: \.self) { row in
          HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { col in
              let d = c[row * 7 + col]
              dot(d, today: today, s: s)
              if col < 6 { Spacer(minLength: 0) }
            }
          }
        }
      }
    }
    .padding(.vertical, 15).padding(.horizontal, 16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: "dinary://calendar")!)
    .widgetBackground(paper, legacyPadding: false)
  }
}

extension MonthDotsView {
  @ViewBuilder func dot(_ d: Int, today: Int, s: CGFloat) -> some View {
    let on = e.days.contains(d)
    if d == 0 { Color.clear.frame(width: s, height: s) }
    else if on && d == today {
      Circle().fill(brick).frame(width: s, height: s)
        .overlay(Circle().stroke(paper, lineWidth: 1.5).padding(-0.75))
        .overlay(Circle().stroke(brick, lineWidth: 1.5).padding(-2.25))
    }
    else if on { Circle().fill(brick).frame(width: s, height: s) }
    else if d == today { Circle().strokeBorder(brick, lineWidth: 1.5).frame(width: s, height: s) }
    else { Circle().fill(d < today ? dayPast : dayAhead).frame(width: s, height: s) }
  }
}

// MARK: 3c

struct MonthPhotoView: View {
  let e: MonthEntry
  var body: some View {
    ZStack(alignment: .topLeading) {
      LinearGradient(stops: [.init(color: ink.opacity(0), location: 0.4), .init(color: ink.opacity(0.72), location: 1)],
                     startPoint: .top, endPoint: .bottom)
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
          Text("\(e.count)").font(batang(15, bold: true)).foregroundColor(brick)
          Text("\(e.month)월").font(mono(9)).foregroundColor(sub)
        }
        .padding(.vertical, 3).padding(.horizontal, 8)
        .background(RoundedRectangle(cornerRadius: 10).fill(paper))
        Spacer(minLength: 0)
        VStack(alignment: .leading, spacing: 2) {
          Text(e.empty ? "아직 없어요" : e.lastName).font(batang(14, bold: true)).foregroundColor(paper).lineLimit(1)
          Text(e.empty ? "첫 식사를 찍어 보세요" : "✓ \(e.lastAt)").font(mono(9.5)).foregroundColor(blush)
        }.padding(.horizontal, 2)
      }
      .padding(.vertical, 12).padding(.horizontal, 12)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(URL(string: "dinary://calendar")!)
    .photoBackground(e.empty ? nil : e.photo)
  }
}

extension View {
  /// 사진은 containerBackground 안에 깔아야 iOS 17 에서 가장자리까지 찹니다.
  @ViewBuilder func photoBackground(_ img: UIImage?) -> some View {
    let bg = Group {
      if let img { Image(uiImage: img).resizable().scaledToFill() } else { brick }
    }
    if #available(iOS 17.0, *) { containerBackground(for: .widget) { bg } }
    else { background(bg) }
  }
}

// MARK: 위젯 정의

private func month<V: View>(_ kind: String, _ name: String, _ desc: String, _ view: @escaping (MonthEntry) -> V) -> some WidgetConfiguration {
  StaticConfiguration(kind: kind, provider: MonthProvider()) { view($0) }
    .configurationDisplayName(name)
    .description(desc)
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabledIfAvailable()
}

struct MonthWidget: Widget {
  var body: some WidgetConfiguration { month("MonthWidget", "이번 달 인증", "이번 달에 인증한 식사 수와 마지막 한 곳.") { MonthView(e: $0) } }
}
struct MonthDotsWidget: Widget {
  var body: some WidgetConfiguration { month("MonthDotsWidget", "이번 달 인증 · 달력", "이번 달 인증한 날을 달력 점으로.") { MonthDotsView(e: $0) } }
}
struct MonthPhotoWidget: Widget {
  var body: some WidgetConfiguration { month("MonthPhotoWidget", "이번 달 인증 · 사진", "마지막으로 인증한 식사 사진과 이번 달 인증 수.") { MonthPhotoView(e: $0) } }
}

extension WidgetConfiguration {
  /// 시안 여백을 직접 주기 위해 iOS 17 기본 여백을 끕니다.
  func contentMarginsDisabledIfAvailable() -> some WidgetConfiguration {
    if #available(iOSApplicationExtension 17.0, *) { return self.contentMarginsDisabled() } else { return self }
  }
}
```

## 6. `CaptureWidget.swift` 수정

`struct CaptureWidget` 앞의 `@main` 을 지우고 파일 끝에 번들을 둡니다.

```swift
@main
struct DinaryWidgets: WidgetBundle {
  var body: some Widget {
    CaptureWidget()
    MonthWidget()
    MonthDotsWidget()
    MonthPhotoWidget()
  }
}
```

기존 `widgetBackground(_:legacyPadding:)` 는 그대로 씁니다. 월 위젯은 여백을 직접 주므로 `legacyPadding: false`.

## 7. 라우트

`dinary://calendar` → `app/(tabs)/calendar.tsx`. `dinary://capture` 를 따로 처리하는 곳이 있으면 같은 곳에 `calendar` 추가.

## 확인할 것

- 숫자는 세 위젯 모두 **인증 횟수**(`count`, 같은 식당 두 번이면 2), 단위 글자 없음.
- 3a 오늘 칸 때문에 타임라인은 매일 0시에 새로 만듭니다(달이 바뀌는 것도 같이 처리).
- 3c 사진: 대표사진 주소가 공개 주소(`photos.ts` getPublicUrl)라 그대로 줄일 수 있습니다. 비공개로 바꾸면 서명된 주소를 넘겨야 합니다. 360px JPEG 약 30KB.
- 보관함(`pending`) 기록은 `verifiedOnly` 에서 빠집니다.
