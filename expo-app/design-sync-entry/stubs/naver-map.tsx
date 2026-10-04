// Claude Design 미리보기용 네이버 지도 대용품 — 종이톤 가짜 지도 위에, 진짜 마커 컴포넌트를 위·경도 그대로 올려 놓습니다.
import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { C } from "../../src/theme";

type Camera = { latitude: number; longitude: number; zoom?: number };
const Ctx = React.createContext<{ project: (lat: number, lng: number) => { x: number; y: number } }>({ project: () => ({ x: 0, y: 0 }) });

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

export const NaverMapView = React.forwardRef<unknown, any>(function NaverMapView({ children, initialCamera, mapPadding, style }, ref) {
  const [size, setSize] = React.useState({ w: 390, h: 844 });
  const cam: Camera = initialCamera ?? { latitude: 37.5665, longitude: 126.978, zoom: 12 };
  const scale = (256 * 2 ** (cam.zoom ?? 12)) / 360;
  const padTop = mapPadding?.top ?? 0;
  const padBottom = mapPadding?.bottom ?? 0;

  React.useImperativeHandle(ref, () => ({ animateCameraTo() {}, animateRegionTo() {}, getCameraState: async () => cam }), [cam]);

  const project = React.useCallback(
    (lat: number, lng: number) => {
      const cx = size.w / 2;
      const cy = padTop + (size.h - padTop - padBottom) / 2;
      const k = (256 * 2 ** (cam.zoom ?? 12)) / (2 * Math.PI);
      return { x: cx + (lng - cam.longitude) * scale, y: cy - (mercY(lat) - mercY(cam.latitude)) * k };
    },
    [size, cam.latitude, cam.longitude, cam.zoom, scale, padTop, padBottom],
  );

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const { w, h } = size;
  const river = `M0 ${h * 0.62} C ${w * 0.25} ${h * 0.56}, ${w * 0.45} ${h * 0.7}, ${w * 0.7} ${h * 0.6} S ${w * 0.95} ${h * 0.55}, ${w} ${h * 0.58} L ${w} ${h * 0.66} C ${w * 0.9} ${h * 0.62}, ${w * 0.7} ${h * 0.7}, ${w * 0.5} ${h * 0.77} S ${w * 0.2} ${h * 0.66}, 0 ${h * 0.7} Z`;

  return (
    <View onLayout={onLayout} style={[{ overflow: "hidden", backgroundColor: C.map }, style]}>
      <Svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
        {Array.from({ length: Math.ceil(w / 56) + 1 }, (_, i) => <Rect key={`v${i}`} x={i * 56} y={0} width={1} height={h} fill={C.mapGrid} />)}
        {Array.from({ length: Math.ceil(h / 56) + 1 }, (_, i) => <Rect key={`h${i}`} x={0} y={i * 56} width={w} height={1} fill={C.mapGrid} />)}
        <Path d={`M-10 ${h * 0.3} L ${w * 0.5} ${h * 0.22} L ${w + 10} ${h * 0.3}`} stroke={C.mapRoad} strokeWidth={11} fill="none" />
        <Path d={`M${w * 0.32} -10 L ${w * 0.4} ${h * 0.5} L ${w * 0.36} ${h + 10}`} stroke={C.mapRoad} strokeWidth={9} fill="none" />
        <Path d={`M${w * 0.72} -10 L ${w * 0.66} ${h * 0.4} L ${w * 0.8} ${h + 10}`} stroke={C.mapRoad} strokeWidth={7} fill="none" />
        <Rect x={w * 0.05} y={h * 0.1} width={w * 0.2} height={h * 0.07} rx={14} fill={C.mapPark} />
        <Rect x={w * 0.62} y={h * 0.14} width={w * 0.3} height={h * 0.09} rx={18} fill={C.mapPark} />
        <Path d={river} fill="#d3dcd6" />
      </Svg>
      <Ctx.Provider value={{ project }}>{children}</Ctx.Provider>
    </View>
  );
});

export const NaverMapMarkerOverlay = ({ latitude, longitude, width = 30, height = 40, onTap, children }: any) => {
  const { x, y } = React.useContext(Ctx).project(latitude, longitude);
  return <View onTouchEnd={onTap} style={{ position: "absolute", left: x - width / 2, top: y - height, width, height }}>{children}</View>;
};
