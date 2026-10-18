import SwiftUI
import UIKit
import WidgetKit

// 「이번 달 인증」 위젯 3종 — 4a 숫자 · 3a 도장 달력 · 3c 마지막 사진. 값은 앱이 App Group 에 써 둡니다(src/lib/widget.ts).

// MARK: 데이터

struct MonthEntry: TimelineEntry {
  let date: Date
  let month: Int
  let count: Int
  /// 인증한 날(일)
  let days: Set<Int>
  let lastName: String
  /// "MM.DD" — 앱이 한국 시간으로 만들어 넘깁니다.
  let lastAt: String
  let photo: UIImage?
  var empty: Bool { count == 0 }
}

private var kst: Calendar {
  var c = Calendar(identifier: .gregorian)
  c.timeZone = TimeZone(identifier: "Asia/Seoul")!
  return c
}

struct MonthProvider: TimelineProvider {
  let d = UserDefaults(suiteName: "group.app.dinary.shared")

  func entry(at date: Date) -> MonthEntry {
    let m = kst.component(.month, from: date)
    let ym = String(format: "%04d-%02d", kst.component(.year, from: date), m)
    // 저장된 달이 지금 달과 다르면(새 달) 0
    guard d?.string(forKey: "month") == ym else {
      return MonthEntry(date: date, month: m, count: 0, days: [], lastName: "", lastAt: "", photo: nil)
    }
    let img = (d?.string(forKey: "lastPhoto")).flatMap { Data(base64Encoded: $0) }.flatMap { UIImage(data: $0) }
    return MonthEntry(
      date: date, month: m, count: d?.integer(forKey: "count") ?? 0,
      days: Set((d?.string(forKey: "days") ?? "").split(separator: ",").compactMap { Int($0) }),
      lastName: d?.string(forKey: "lastName") ?? "", lastAt: d?.string(forKey: "lastAt") ?? "", photo: img)
  }

  func placeholder(in context: Context) -> MonthEntry {
    MonthEntry(date: .now, month: 10, count: 7, days: [2, 5, 9, 10, 14, 16, 18], lastName: "합정 수제비", lastAt: "10.14", photo: nil)
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

// MARK: 색 · 글꼴

private func hex(_ v: UInt32, _ a: Double = 1) -> Color {
  Color(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255, opacity: a)
}
private let brick = hex(0xb4552d), paper = hex(0xfbfaf6), ink = hex(0x1c1a17)
private let line = hex(0xe2ddd2), mute = hex(0x8a8377), sub = hex(0x6b665e), faint = hex(0xd8d2c6), blush = hex(0xf1d9cc)
private let dayPast = hex(0xe2ddd2), dayAhead = hex(0xefebe3)
private func batang(_ s: CGFloat, bold: Bool = false) -> Font { .custom(bold ? "GowunBatang-Bold" : "GowunBatang-Regular", size: s) }
private func mono(_ s: CGFloat) -> Font { .custom("JetBrainsMono-Regular", size: s) }
private let calendarURL = URL(string: "dinary://calendar")!

/// 4a 아래 줄 — 선 · 가게 이름 · ✓ 날짜
private struct LastLine: View {
  let e: MonthEntry
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Rectangle().fill(line).frame(height: 1)
      VStack(alignment: .leading, spacing: 3) {
        Text(e.empty ? "아직 없어요" : e.lastName).font(batang(13, bold: true)).foregroundColor(ink).lineLimit(1)
        Text(e.empty ? "첫 식사를 찍어 보세요" : "✓ \(e.lastAt)").font(mono(9.5)).foregroundColor(e.empty ? mute : brick)
      }
      .padding(.top, 8)
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
    .widgetURL(calendarURL)
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
    let c = cells
    let six = c.count > 35
    let s: CGFloat = six ? 11 : 12
    let gap: CGFloat = six ? 4 : 5
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
              dot(c[row * 7 + col], today: today, s: s)
              if col < 6 { Spacer(minLength: 0) }
            }
          }
        }
      }
    }
    .padding(.vertical, 15).padding(.horizontal, 16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(calendarURL)
    .widgetBackground(paper, legacyPadding: false)
  }

  @ViewBuilder func dot(_ d: Int, today: Int, s: CGFloat) -> some View {
    let on = e.days.contains(d)
    if d == 0 {
      Color.clear.frame(width: s, height: s)
    } else if on && d == today {
      // 오늘 인증: 채운 점 + paper · brick 바깥 고리
      Circle().fill(brick).frame(width: s, height: s)
        .overlay(Circle().stroke(paper, lineWidth: 1.5).padding(-0.75))
        .overlay(Circle().stroke(brick, lineWidth: 1.5).padding(-2.25))
    } else if on {
      Circle().fill(brick).frame(width: s, height: s)
    } else if d == today {
      Circle().strokeBorder(brick, lineWidth: 1.5).frame(width: s, height: s)
    } else {
      Circle().fill(d < today ? dayPast : dayAhead).frame(width: s, height: s)
    }
  }
}

// MARK: 3c

struct MonthPhotoView: View {
  let e: MonthEntry
  var photo: UIImage? { e.empty ? nil : e.photo }

  var body: some View {
    ZStack(alignment: .topLeading) {
      // 글자가 읽히게 사진 위에만 아래로 어두워지는 그라데이션
      if photo != nil {
        LinearGradient(stops: [.init(color: ink.opacity(0), location: 0.4), .init(color: ink.opacity(0.72), location: 1)],
                       startPoint: .top, endPoint: .bottom)
      }
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
        }
        .padding(.horizontal, 2)
      }
      .padding(.vertical, 12).padding(.horizontal, 12)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(calendarURL)
    .photoBackground(photo)
  }
}

extension View {
  /// 사진은 containerBackground 안에 깔아야 iOS 17 에서 가장자리까지 찹니다. 사진이 없으면 brick.
  @ViewBuilder func photoBackground(_ img: UIImage?) -> some View {
    let bg = Group {
      if let img { Image(uiImage: img).resizable().scaledToFill() } else { brick }
    }
    if #available(iOS 17.0, *) {
      containerBackground(for: .widget) { bg }
    } else {
      background(bg)
    }
  }
}

// MARK: 위젯 정의

/// 시안 여백을 직접 주므로 기본 여백을 끕니다(contentMarginsDisabled 는 iOS 17 아래에선 아무 일도 하지 않습니다).
private func monthConfig<V: View>(_ kind: String, _ name: String, _ desc: String, _ view: @escaping (MonthEntry) -> V) -> some WidgetConfiguration {
  StaticConfiguration(kind: kind, provider: MonthProvider()) { view($0) }
    .configurationDisplayName(name)
    .description(desc)
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
}

struct MonthWidget: Widget {
  var body: some WidgetConfiguration {
    monthConfig("MonthWidget", "이번 달 인증", "이번 달에 인증한 식사 수와 마지막 한 곳.") { MonthView(e: $0) }
  }
}

struct MonthDotsWidget: Widget {
  var body: some WidgetConfiguration {
    monthConfig("MonthDotsWidget", "이번 달 인증 · 달력", "이번 달 인증한 날을 달력 점으로.") { MonthDotsView(e: $0) }
  }
}

struct MonthPhotoWidget: Widget {
  var body: some WidgetConfiguration {
    monthConfig("MonthPhotoWidget", "이번 달 인증 · 사진", "마지막으로 인증한 식사 사진과 이번 달 인증 수.") { MonthPhotoView(e: $0) }
  }
}
