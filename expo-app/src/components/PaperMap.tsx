import { NaverMapView, type NaverMapViewProps, type NaverMapViewRef } from "@mj-studio/react-native-naver-map";
import { forwardRef, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

/** NCP 콘솔에 등록한 종이톤 커스텀 스타일 id — 핸드오프 §4.1 의 권장 해법. */
const STYLE_ID = process.env.EXPO_PUBLIC_NAVER_MAP_STYLE_ID;

/**
 * 종이톤 지도. 웹의 `.naver-map-tone` CSS 필터는 네이티브에 못 걸어서,
 * 스타일 id 가 있으면 그걸 쓰고 없으면 임시로 종이색 오버레이를 덮습니다(마커도 함께 흐려집니다).
 */
type Props = NaverMapViewProps & {
  /**
   * 네이버 로고의 logoMargin.bottom(dp) 을 UI 스레드 값으로 받아 매 프레임 따라갑니다 — 시트를 끄는 동안에도 로고가 시트 위에 붙어 있게.
   * 이 컴포넌트 안에서만 다시 그려서 부모 화면·마커(children 은 같은 요소라 건너뜀)는 다시 그리지 않습니다.
   */
  logoBottom?: SharedValue<number | null>;
};

export const PaperMap = forwardRef<NaverMapViewRef, Props>(function PaperMap(props, ref) {
  const { onInitialized, onCameraIdle, logoBottom, logoMargin, ...rest } = props;
  const idleLogged = useRef(false);
  const [liveLogoBottom, setLiveLogoBottom] = useState<number | null>(null);

  useAnimatedReaction(
    () => (logoBottom?.value == null ? null : Math.round(logoBottom.value)),
    (v, prev) => {
      if (v !== null && v !== prev) scheduleOnRN(setLiveLogoBottom, v);
    },
    [logoBottom],
  );

  // 지도가 안 뜰 때 진단용 로그. 인증 실패 사유는 JS 로 오지 않고 네이티브 로그에만 남습니다:
  //   adb logcat | grep -i naver
  useEffect(() => {
    console.log("[PaperMap] mount", { styleId: STYLE_ID ?? "(none)" });
    // 10초 안에 초기화/첫 카메라 idle 이 없으면 원인 후보를 알려줍니다.
    const t = setTimeout(() => {
      if (!idleLogged.current) {
        console.warn(
          "[PaperMap] 10s passed without a camera idle — tiles likely failed to load. Check: (1) customStyleId valid? (try removing EXPO_PUBLIC_NAVER_MAP_STYLE_ID) (2) NCP Dynamic Map enabled + app.dinary registered (3) build made after NAVER_MAP_CLIENT_ID was set. Native details: adb logcat | grep -i naver",
        );
      }
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <NaverMapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        customStyleId={STYLE_ID}
        isShowZoomControls={false}
        isShowCompass={false}
        isShowScaleBar={false}
        isShowLocationButton={false}
        isExtentBoundedInKorea
        onInitialized={() => {
          console.log("[PaperMap] native map initialized");
          onInitialized?.();
        }}
        onCameraIdle={(e) => {
          if (!idleLogged.current) {
            idleLogged.current = true;
            console.log("[PaperMap] first camera idle (camera only; does not prove tiles loaded)", { zoom: e.zoom });
          }
          onCameraIdle?.(e);
        }}
        {...rest}
        logoMargin={liveLogoBottom == null ? logoMargin : { ...logoMargin, bottom: liveLogoBottom }}
      />
      {!STYLE_ID && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(246,243,236,0.18)" }]} />}
    </View>
  );
});
