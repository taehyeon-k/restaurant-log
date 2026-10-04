// Claude Design 에 올리는 "화면" 모음 — 앱의 실제 화면 코드를 그대로 쓰되, 데이터·라우터·기기 기능만 대용품(stubs)으로 바꿔 끼웁니다.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AccountTab from "../app/(tabs)/account";
import CalendarTab from "../app/(tabs)/calendar";
import MapTab from "../app/(tabs)/index";
import WishTab from "../app/(tabs)/wish";
import Capture from "../app/capture";
import DayScreen from "../app/day/[date]";
import Drafts from "../app/drafts";
import Labels from "../app/labels";
import Login from "../app/login";
import PlaceDetail from "../app/place/[key]";
import RecordDetail from "../app/record/[id]";
import RecordEdit from "../app/record/edit";
import Welcome from "../app/welcome";
import WishDetail from "../app/wish/[id]";
import WishNew from "../app/wish/new";
import WishSpot from "../app/wish/spot";
import { setState } from "../src/data/store";
import TabBar from "../src/components/TabBar";
import { C } from "../src/theme";
import { sampleAccount, sampleRows, sampleWishes } from "./mock-data";
import { RouteContext } from "./stubs/expo-router";

type Params = Record<string, string>;
export type AppScreenProps = {
  /** 이 화면이 라우트에서 받는 값 — 예: 기록 상세는 { id: "1" }. */
  params?: Params;
  /** 지도 화면의 맛집 / 카페 탭. */
  kind?: "restaurant" | "cafe";
  children?: React.ReactNode;
};

const insets = { top: 47, left: 0, right: 0, bottom: 34 };
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets };

function makeClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } } });
  qc.setQueryData(["restaurants"], sampleRows);
  qc.setQueryData(["wishes"], sampleWishes);
  qc.setQueryData(["account"], sampleAccount);
  return qc;
}

/** 390×844 폰 화면 틀 — 샘플 기록·위시·계정이 미리 채워진 상태로 화면을 감쌉니다. */
export function AppScreen({ params = {}, kind = "restaurant", children }: AppScreenProps) {
  const client = React.useMemo(makeClient, []);
  // 화면 폭을 읽는 코드(기록 상세의 사진 등)가 브라우저 창이 아니라 폰 틀 폭(390)을 쓰게 합니다.
  React.useMemo(() => {
    const dims = { width: 390, height: 844, scale: 2, fontScale: 1 };
    // react-native-web 은 브라우저에서 Dimensions.set 을 막아 두어서, 읽는 쪽(get)을 바꿔 끼웁니다.
    (Dimensions as unknown as { get: (name: string) => typeof dims }).get = () => dims;
  }, []);
  setState({ kind, markerFilter: "all", ghost: null, spotPick: null });
  return (
    <div style={{ width: 390, height: 844, position: "relative", overflow: "hidden", display: "flex", background: C.paper, borderRadius: 28, boxShadow: "0 0 0 1px #d8d3c8" }}>
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={client}>
          <RouteContext.Provider value={{ params, segments: [] }}>
            <View style={{ flex: 1 }}>{children}</View>
          </RouteContext.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </div>
  );
}

const TAB_ROUTES = ["calendar", "index", "wish", "account"].map((name) => ({ key: name, name }));

/** 탭 화면 + 아래 탭바(가운데 카메라 버튼 포함). */
function Tabbed({ tab, children }: { tab: string; children: React.ReactNode }) {
  const navigation = { emit: () => ({ defaultPrevented: false }), navigate() {} };
  const state = { index: TAB_ROUTES.findIndex((r) => r.name === tab), routes: TAB_ROUTES };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <TabBar {...({ state, navigation } as any)} />
    </View>
  );
}

/** `behind` — 앱에서 투명 모달로 뜨는 화면(위시 상세)은 뒤에 깔리는 탭 화면 위에 겹쳐 그립니다. */
const screen = (Body: React.ComponentType, defaults: Params = {}, tab?: string, Behind?: React.ComponentType) =>
  function Screen({ params, kind }: { params?: Params; kind?: AppScreenProps["kind"] }) {
    let body: React.ReactNode = tab ? <Tabbed tab={tab}><Body /></Tabbed> : <Body />;
    if (Behind) {
      body = (
        <View style={{ flex: 1 }}>
          <Tabbed tab="index"><Behind /></Tabbed>
          <View style={StyleSheet.absoluteFill}><Body /></View>
        </View>
      );
    }
    return <AppScreen params={{ ...defaults, ...params }} kind={kind}>{body}</AppScreen>;
  };

export const MapScreen = screen(MapTab, {}, "index");
export const CalendarScreen = screen(CalendarTab, {}, "calendar");
export const WishListScreen = screen(WishTab, {}, "wish");
export const AccountScreen = screen(AccountTab, {}, "account");
export const RecordDetailScreen = screen(RecordDetail, { id: "1" });
export const RecordEditScreen = screen(RecordEdit, { id: "1" });
export const WishNewScreen = screen(WishNew);
export const WishSpotScreen = screen(WishSpot, { lat: "37.5665", lng: "126.978" });
export const WishDetailScreen = screen(WishDetail, { id: "w1" }, undefined, MapTab);
export const PlaceDetailScreen = screen(PlaceDetail, { key: "을지면옥" });
export const DayDetailScreen = screen(DayScreen, { date: "2026-10-02" });
export const DraftsScreen = screen(Drafts);
export const LabelBookScreen = screen(Labels);
export const LoginScreen = screen(Login);
export const WelcomeScreen = screen(Welcome);
export const CaptureScreen = screen(Capture);
