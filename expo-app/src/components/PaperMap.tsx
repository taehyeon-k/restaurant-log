import { NaverMapView, type NaverMapViewProps, type NaverMapViewRef } from "@mj-studio/react-native-naver-map";
import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";

/** NCP 콘솔에 등록한 종이톤 커스텀 스타일 id — 핸드오프 §4.1 의 권장 해법. */
const STYLE_ID = process.env.EXPO_PUBLIC_NAVER_MAP_STYLE_ID;

/**
 * 종이톤 지도. 웹의 `.naver-map-tone` CSS 필터는 네이티브에 못 걸어서,
 * 스타일 id 가 있으면 그걸 쓰고 없으면 임시로 종이색 오버레이를 덮습니다(마커도 함께 흐려집니다).
 */
export const PaperMap = forwardRef<NaverMapViewRef, NaverMapViewProps>(function PaperMap(props, ref) {
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
        {...props}
      />
      {!STYLE_ID && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(246,243,236,0.18)" }]} />}
    </View>
  );
});
