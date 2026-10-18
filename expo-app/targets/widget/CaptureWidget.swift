import SwiftUI
import WidgetKit

/// 앱의 CameraIcon(24×24 선 아이콘)과 같은 모양.
struct CameraShape: Shape {
  func path(in rect: CGRect) -> Path {
    let s = min(rect.width, rect.height) / 24
    let ox = rect.midX - 12 * s, oy = rect.midY - 12 * s
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
    var path = Path()
    path.addRoundedRect(in: CGRect(origin: p(2.5, 5.5), size: CGSize(width: 19 * s, height: 14 * s)),
                        cornerSize: CGSize(width: 3.5 * s, height: 3.5 * s))
    path.addEllipse(in: CGRect(origin: p(8, 8.5), size: CGSize(width: 8 * s, height: 8 * s)))
    path.move(to: p(8, 5.5))
    path.addLine(to: p(9.4, 3))
    path.addLine(to: p(14.6, 3))
    path.addLine(to: p(16, 5.5))
    return path
  }
}

struct CameraIcon: View {
  var size: CGFloat
  var body: some View {
    // 작게 그려도 선이 흐려지지 않게 최소 굵기를 둡니다.
    CameraShape()
      .stroke(style: StrokeStyle(lineWidth: max(1.5, size * 1.7 / 24), lineCap: .round, lineJoin: .round))
      .frame(width: size, height: size)
  }
}

struct Entry: TimelineEntry { let date: Date }

/// 늘 같은 모습이라 타임라인은 한 장이면 됩니다.
struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> Entry { Entry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    completion(Timeline(entries: [Entry(date: .now)], policy: .never))
  }
}

let captureURL = URL(string: "dinary://capture")!

struct CaptureView: View {
  @Environment(\.widgetFamily) var family

  var body: some View {
    content
      .widgetURL(captureURL)
      .widgetBackground(family == .systemSmall ? Color("brick") : Color.clear, legacyPadding: family == .systemSmall)
  }

  @ViewBuilder var content: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        CameraIcon(size: 26)
      }
      .widgetAccentable()
    case .accessoryRectangular:
      HStack(spacing: 8) {
        CameraIcon(size: 26)
        VStack(alignment: .leading, spacing: 1) {
          Text("바로 촬영").font(.headline)
          Text("DINARY").font(.caption2).opacity(0.7)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .widgetAccentable()
    case .accessoryInline:
      Label("바로 촬영", systemImage: "camera")
    default:
      VStack(alignment: .leading) {
        Text("DINARY").font(.system(size: 12, weight: .bold)).tracking(1.5).opacity(0.75)
        Spacer()
        CameraIcon(size: 44)
        Spacer()
        Text("바로 촬영").font(.system(size: 17, weight: .bold))
      }
      .foregroundColor(Color("paper"))
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }
}

extension View {
  /// iOS 17 부터는 배경을 containerBackground 로 넘겨야 여백 · 잠금화면 처리가 맞습니다.
  /// iOS 16 은 시스템 여백이 없어 홈 화면 위젯에만 직접 띄웁니다.
  @ViewBuilder func widgetBackground(_ color: Color, legacyPadding: Bool) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(for: .widget) { color }
    } else {
      padding(legacyPadding ? 16 : 0).background(color)
    }
  }
}

@main
struct CaptureWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "CaptureWidget", provider: Provider()) { _ in CaptureView() }
      .configurationDisplayName("바로 촬영")
      .description("누르면 카메라가 바로 열려 방문을 기록합니다.")
      .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
