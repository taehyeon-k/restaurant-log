import { NaverMapView, type NaverMapViewProps, type NaverMapViewRef } from "@mj-studio/react-native-naver-map";
import { forwardRef, useState } from "react";
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
  const [liveLogoBottom, setLiveLogoBottom] = useState<number | null>(null);

  useAnimatedReaction(
    () => (logoBottom?.value == null ? null : Math.round(logoBottom.value)),
    (v, prev) => {
      if (v !== null && v !== prev) scheduleOnRN(setLiveLogoBottom, v);
    },
    [logoBottom],
  );

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
        onInitialized={onInitialized}
        onCameraIdle={onCameraIdle}
        {...rest}
        logoMargin={liveLogoBottom == null ? logoMargin : { ...logoMargin, bottom: liveLogoBottom }}
      />
      {!STYLE_ID && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(246,243,236,0.18)" }]} />}
    </View>
  );
});
