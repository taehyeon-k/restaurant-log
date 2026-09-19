/**
 * 촬영 흐름(§4.2) — 웹 `CaptureFlow.tsx` 를 옮긴 것입니다.
 * 웹의 3단계 앞에 **권한 준비** 한 장이 붙고, 끝에 **오프라인 큐** 상태가 붙습니다.
 *
 * 순수 계산(metersBetween, mine, candidates, pickCandidates, pickList, noneNear,
 * searchHits)과 상수는 웹 그대로입니다 — DOM 을 모르는 코드라 손댈 이유가 없습니다.
 * 지워진 것: `session`·`cam`·`zoomCaps`·`trackRef`·`pinchRef`·`liveRef`·`timerRef` —
 * 전부 `getUserMedia` 재시도 관리용이라 네이티브에 대응물이 없습니다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import NetInfo from "@react-native-community/netinfo";

import Spinner from "@/components/Spinner";
import {
  BellIcon,
  BookmarkIcon,
  CameraIcon,
  FlashIcon,
  FlipIcon,
  KindSegment,
  PhotoFill,
  PinIcon,
  VerifiedMark,
} from "@/components/ui";
import { groupPlaces } from "@/lib/places";
import { nearbyPlaces, searchFoodPlaces, type FoodPlace } from "@/lib/geocode";
import {
  findMatchingWish,
  wishMetInfo,
  WISH_AUTO_M,
  WISH_NEAR_M,
  type Kind,
  type Restaurant,
  type Wish,
} from "@/lib/types";
import { useRefresh, useRestaurants, useWishes } from "@/lib/data";
import { supabase, requireUserId } from "@/lib/supabase";
import { uploadPhotoFromUri } from "@/lib/photos";
import { enqueueRecord } from "@/lib/offline";
import { C, FONT, SHADOW } from "@/lib/theme";

/* 이보다 먼 가게는 고를 수 없습니다 — 그 자리에 있었다는 증명이 인증의 값입니다 */
const PICK_MAX_M = 50;
/** 긴 변 900px · JPEG 0.72 — 웹과 같은 값입니다. */
const RESIZE_WIDTH = 900;
const JPEG_QUALITY = 0.72;
/** 배율 버튼 — 웹의 슬라이더 + CSS 크롭은 버립니다. 네이티브는 렌즈를 실제로 바꿉니다. */
const ZOOM_STEPS = [
  { label: ".5×", value: 0 },
  { label: "1×", value: 0.02 },
  { label: "2×", value: 0.1 },
];

type Step = "permission" | "shoot" | "pick" | "search" | "done";
type Geo = { lat: number; lng: number; acc: number };

type Candidate = {
  id: string;
  name: string;
  kind: Kind;
  category: string | null;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distance: number | null;
  /** 이미 내 기록에 있는 가게 */
  mine: boolean;
  /** 이 후보와 짝지어진 위시 — 담아둔 곳이면 후보 목록 맨 위로 올립니다(§1). */
  wish?: Wish | null;
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 1000m 가 넘으면 km 로 바꿔 보여줍니다 — 숫자가 너무 길어지지 않게. */
function formatDistance(m: number) {
  if (m < 1000) return `${m}m`;
  const km = m / 1000;
  return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(1)}km`;
}

/** 두 좌표 사이 거리(m) */
function metersBetween(a: Geo, lat: number, lng: number) {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(lat - a.lat);
  const dLng = rad(lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const refresh = useRefresh();
  const params = useLocalSearchParams<{ verifyWishId?: string; kind?: Kind }>();

  const { rows } = useRestaurants();
  const { wishes } = useWishes();

  const verifyWishId = params.verifyWishId ?? null;
  const kind: Kind = params.kind === "cafe" ? "cafe" : "restaurant";

  const verifyWish = useMemo(
    () => (verifyWishId ? wishes.find((w) => w.id === verifyWishId) ?? null : null),
    [wishes, verifyWishId]
  );

  const [step, setStep] = useState<Step>("permission");
  const [shot, setShot] = useState<string | null>(null);
  const [shotAt, setShotAt] = useState<Date | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [autoMatched, setAutoMatched] = useState(false);
  const [picked, setPicked] = useState<Candidate | null>(null);
  /** 「여기 어디예요?」에서 고르는 종류 — 후보를 걸러 보여주고, 그대로 기록의 kind 가 됩니다. */
  const [pickKind, setPickKind] = useState<Kind>(kind);
  const [extra, setExtra] = useState<Candidate[]>([]);
  const [online, setOnline] = useState(true);

  const [pickQuery, setPickQuery] = useState("");
  const [apiHits, setApiHits] = useState<FoodPlace[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const sub = NetInfo.addEventListener((s) => setOnline(s.isConnected !== false));
    return () => sub();
  }, []);

  /* ── 단계 01 · 권한 준비 ────────────────────────── */

  const [camPermission, requestCamPermission] = useCameraPermissions();
  const [permissionBusy, setPermissionBusy] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  // 이미 두 권한이 모두 허용돼 있으면 이 화면을 건너뛰고 바로 촬영으로 갑니다.
  useEffect(() => {
    if (step !== "permission" || !camPermission) return;
    void (async () => {
      const loc = await Location.getForegroundPermissionsAsync();
      if (camPermission.granted && loc.granted) setStep("shoot");
    })();
  }, [step, camPermission]);

  const askPermissions = useCallback(async () => {
    setPermissionBusy(true);
    try {
      const cam = camPermission?.granted ? camPermission : await requestCamPermission();

      // 거부 상태로 다시 들어왔으면 설정을 엽니다 — 앱 안에서는 더 물을 수 없습니다.
      if (!cam?.granted) {
        if (!cam?.canAskAgain) await Linking.openSettings();
        return;
      }

      const loc = await Location.requestForegroundPermissionsAsync();
      setLocationDenied(!loc.granted);

      // 위치를 거부해도 촬영은 됩니다 — 인증만 붙지 않습니다.
      setStep("shoot");
    } finally {
      setPermissionBusy(false);
    }
  }, [camPermission, requestCamPermission]);

  /* ── 단계 02 · 촬영 ─────────────────────────────── */

  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
  const [zoomIndex, setZoomIndex] = useState(1);
  const [taking, setTaking] = useState(false);
  const [recentPhoto, setRecentPhoto] = useState<string | null>(null);

  // 갤러리 썸네일 — 가장 최근 사진 한 장. 권한이 없으면 그냥 비워 둡니다.
  useEffect(() => {
    if (step !== "shoot") return;
    void (async () => {
      const perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted) return;
      const page = await MediaLibrary.getAssetsAsync({ first: 1, sortBy: ["creationTime"], mediaType: "photo" });
      setRecentPhoto(page.assets[0]?.uri ?? null);
    })().catch(() => {});
  }, [step]);

  /** 촬영 순간 한 번만 읽습니다. 좌표는 후보를 찾는 데에만 쓰고 저장하지 않습니다. */
  const readGeo = useCallback(() => {
    setGeo(null);
    setGeoErr(null);

    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      .then((p) =>
        setGeo({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          acc: Math.round(p.coords.accuracy ?? 0),
        })
      )
      .catch(() => setGeoErr("위치 권한이 없어 좌표를 읽지 못했습니다."));
  }, []);

  /** 긴 변 900 으로 줄여 JPEG 0.72 로 굽습니다 — 웹과 같은 값. */
  async function shrink(uri: string) {
    const out = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: RESIZE_WIDTH } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out.uri;
  }

  async function takeShot() {
    if (taking) return;
    setTaking(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9, skipProcessing: true });
      if (!photo?.uri) return;

      readGeo();
      setShot(await shrink(photo.uri));
      setShotAt(new Date());
      setStep("pick");
    } catch (err) {
      console.error("촬영 실패:", err);
    } finally {
      setTaking(false);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;

    readGeo();
    setShot(await shrink(result.assets[0].uri));
    setShotAt(new Date());
    setStep("pick");
  }

  /* ── 위치 · 후보 ────────────────────────────────── */

  /** 1순위는 내 기록의 가게 — 읽은 좌표에서 800m 안쪽을 거리순으로. */
  const mine = useMemo<Candidate[]>(() => {
    if (!geo) return [];

    return groupPlaces(rows)
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({
        id: `mine:${p.key}`,
        name: p.name,
        kind: p.kind,
        category: p.category,
        region: p.region,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        distance: metersBetween(geo, p.lat as number, p.lng as number),
        mine: true,
      }))
      .filter((c) => (c.distance ?? 0) <= 800)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
      .slice(0, 4);
  }, [geo, rows]);

  const candidates = useMemo(() => {
    const taken = new Set(mine.map((c) => c.name));
    return [...mine, ...extra.filter((c) => !taken.has(c.name))]
      .filter((c) => c.kind === pickKind)
      .sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9))
      .slice(0, 8);
  }, [mine, extra, pickKind]);

  /**
   * 담아둔 곳을 맨 위로(§1) — 위치를 읽었고, 후보 중 가고싶다에 담긴 가게이며
   * 거리가 WISH_NEAR_M 이내인 것만 올립니다.
   */
  const pickCandidates = useMemo(() => {
    if (!geo) return candidates as (Candidate & { wish: Wish | null })[];

    const tagged = candidates.map((c) => ({ ...c, wish: findMatchingWish(wishes, c, WISH_NEAR_M) }));
    return [...tagged.filter((c) => c.wish), ...tagged.filter((c) => !c.wish)];
  }, [candidates, wishes, geo]);

  /** 인증은 50m 안에서만 — 위치를 못 읽었으면 제한하지 않습니다. */
  const pickList = useMemo(
    () =>
      pickCandidates.map((c, i) => {
        const far = !!geo && (c.distance ?? Infinity) > PICK_MAX_M;
        return { ...c, far, hot: i === 0 && !far };
      }),
    [pickCandidates, geo]
  );

  const noneNear = !!geo && candidates.length > 0 && pickList.every((c) => c.far);

  /** 가게 찾기의 검색 대상 — 800m·8곳 제한 없이 내 기록 전체 + 둘레 검색 결과. */
  const searchPool = useMemo<Candidate[]>(() => {
    const mineAll = groupPlaces(rows)
      .filter((p) => p.lat != null && p.lng != null && p.kind === pickKind)
      .map((p) => ({
        id: `mine:${p.key}`,
        name: p.name,
        kind: p.kind,
        category: p.category,
        region: p.region,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        distance: geo ? metersBetween(geo, p.lat as number, p.lng as number) : null,
        mine: true,
      }));
    const taken = new Set(mineAll.map((c) => c.name));
    return [...mineAll, ...extra.filter((c) => !taken.has(c.name) && c.kind === pickKind)].sort(
      (a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)
    );
  }, [rows, extra, geo, pickKind]);

  /**
   * 두 글자 미만이면 내 기록·둘레만 거리순으로, 그 이상이면 전국 검색 결과까지 합칩니다.
   * 이미 있는 가게는 전국 결과에서 걸러 중복을 막습니다.
   */
  const searchHits = useMemo(() => {
    const needle = pickQuery.trim().toLowerCase();
    if (!needle) return searchPool;

    const seen = new Set<string>();
    const hits: Candidate[] = [];

    for (const c of searchPool) {
      if (![c.name, c.category, c.address].some((f) => (f ?? "").toLowerCase().includes(needle))) continue;
      seen.add(norm(c.name));
      hits.push(c);
    }

    for (const p of apiHits) {
      if (p.kind !== pickKind) continue;
      const name = p.name || p.address;
      const key = norm(name);
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        id: `api:${key}:${p.lat},${p.lng}`,
        name,
        kind: p.kind,
        category: p.category,
        region: p.region,
        address: p.address,
        lat: p.lat,
        lng: p.lng,
        distance: geo ? metersBetween(geo, p.lat, p.lng) : null,
        mine: false,
      });
    }

    return hits.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  }, [searchPool, apiHits, pickQuery, geo, pickKind]);

  // 250ms 디바운스 후 두 글자 이상이면 전국 검색.
  useEffect(() => {
    if (step !== "search") return;
    const needle = pickQuery.trim();
    const ctrl = new AbortController();

    const t = setTimeout(() => {
      if (needle.length < 2) {
        setApiHits([]);
        return;
      }
      setSearching(true);
      searchFoodPlaces(needle, ctrl.signal)
        .then(setApiHits)
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 250);

    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [step, pickQuery]);

  // 둘레 장소 검색 — 음식점·카페를 함께 찾습니다. 좌표는 이 요청에만 씁니다.
  useEffect(() => {
    if (step !== "pick" || !geo) return;
    let cancelled = false;

    nearbyPlaces(geo.lat, geo.lng)
      .then((found) => {
        if (cancelled) return;
        setExtra(
          found.map((f) => ({
            id: `near:${f.name}:${f.lat},${f.lng}`,
            name: f.name,
            kind: f.kind,
            category: f.category,
            region: f.region,
            address: f.address,
            lat: f.lat,
            lng: f.lng,
            distance: f.distance,
            mine: false,
          }))
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [step, geo]);

  /**
   * 인증 대상 위시가 있고 100m 이내면 후보 목록을 건너뛰고 곧바로 그 가게로
   * 정합니다(§3) — 사용자가 이미 「방문 인증」으로 그 가게라고 말한 상태입니다.
   */
  useEffect(() => {
    if (step !== "pick" || !geo || !verifyWish || picked) return;
    if (verifyWish.lat == null || verifyWish.lng == null) return;

    const d = metersBetween(geo, verifyWish.lat, verifyWish.lng);
    if (d > WISH_AUTO_M) return;

    setAutoMatched(true);
    setPicked({
      id: `wish:${verifyWish.id}`,
      name: verifyWish.name,
      kind,
      category: verifyWish.category,
      region: null,
      address: verifyWish.where_text,
      lat: verifyWish.lat,
      lng: verifyWish.lng,
      distance: Math.round(d),
      mine: false,
      wish: verifyWish,
    });
    setStep("done");
  }, [step, geo, verifyWish, picked, kind]);

  /* ── 저장 ─────────────────────────────────────── */

  type Upload =
    | { state: "idle" }
    | { state: "uploading" }
    | { state: "saved"; id: number }
    | { state: "queued" }
    | { state: "error"; message: string };

  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const committed = useRef(false);

  /**
   * 「인증 완료」로 들어오는 순간 바로 저장합니다 — 네트워크를 기다리지 않습니다(§6).
   * 저장 스키마는 웹과 같습니다(verified·acc·pending·from_wish·place_key 포함).
   * 여기서는 언제나 `pending: true` 로 남기고, 본문을 쓰면 그때 false 가 됩니다.
   */
  const commit = useCallback(async () => {
    if (!picked || !shot || committed.current) return;
    committed.current = true;
    setUpload({ state: "uploading" });

    const at = shotAt ?? new Date();
    const twin = rows.find((r) => r.name === picked.name && r.kind === picked.kind);
    const address = twin?.address ?? picked.address ?? null;

    // 짝지어진 위시가 있으면 이 인증 기록은 그 위시가 이루어진 것입니다(WISH MET).
    const matchedWish = picked.wish ?? findMatchingWish(wishes, picked, WISH_AUTO_M);
    const fromWish = matchedWish ? wishMetInfo(matchedWish, isoDate(at)) : null;

    const base = {
      kind: picked.kind,
      name: picked.name,
      category: twin?.category ?? picked.category,
      region: twin?.region ?? picked.region,
      address,
      place_key: `${picked.name}|${address ?? ""}`.toLowerCase(),
      // 좌표는 고른 가게의 것입니다 — 읽은 위치는 저장하지 않습니다.
      lat: twin?.lat ?? picked.lat,
      lng: twin?.lng ?? picked.lng,
      rating: null,
      menu: null,
      menus: [],
      price_level: null,
      price_range: null,
      review: null,
      keywords: [],
      revisit: Boolean(twin),
      visited_at: isoDate(at),
      verified: true,
      acc: geo?.acc ?? null,
      pending: true,
      from_wish: fromWish,
    };

    try {
      const userId = await requireUserId();
      const net = await NetInfo.fetch();
      if (net.isConnected === false) throw new Error("offline");

      const url = await uploadPhotoFromUri(shot, "verified.jpg");
      const { data, error } = await supabase
        .from("restaurants")
        .insert({ ...base, user_id: userId, photo_url: url, photo_urls: [url], cover_index: 0 })
        .select("id")
        .single();

      if (error) throw new Error(error.message);

      if (matchedWish) await supabase.from("wishes").delete().eq("id", matchedWish.id);

      refresh();
      setUpload({ state: "saved", id: data.id as number });
    } catch (err) {
      // 올리지 못했으면 큐에 넣고 물러납니다 — 인증은 이미 붙었습니다.
      try {
        const userId = await requireUserId();
        await enqueueRecord({
          payload: { ...base, user_id: userId },
          photoUri: shot,
          wishId: matchedWish?.id ?? null,
          name: picked.name,
        });
        setUpload({ state: "queued" });
      } catch (queueErr) {
        console.error("큐에도 넣지 못했습니다:", queueErr, err);
        setUpload({
          state: "error",
          message: queueErr instanceof Error ? queueErr.message : "기록을 저장하지 못했습니다",
        });
      }
    }
  }, [picked, shot, shotAt, rows, wishes, geo, refresh]);

  useEffect(() => {
    if (step === "done") void commit();
  }, [step, commit]);

  const close = useCallback(() => {
    refresh();
    router.back();
  }, [refresh, router]);

  /** 인증 없이 기록만 남깁니다 — 이름이 있으면 채워서 기록 입력을 엽니다. */
  const goUnverified = useCallback(
    (name?: string, k?: Kind) => {
      router.replace({
        pathname: "/record/new",
        params: { kind: k ?? pickKind, ...(name ? { name } : {}) },
      });
    },
    [router, pickKind]
  );

  /* ── 그리기 ────────────────────────────────────── */

  if (step === "permission") {
    return (
      <PermissionStep
        insets={insets}
        busy={permissionBusy}
        denied={camPermission?.granted === false && camPermission.canAskAgain === false}
        onAllow={askPermissions}
        onSkip={() => goUnverified()}
        onClose={close}
      />
    );
  }

  if (step === "shoot") {
    return (
      <View style={{ flex: 1, backgroundColor: C.shoot }}>
        <CameraView
          ref={cameraRef}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          facing={facing}
          flash={flash}
          zoom={ZOOM_STEPS[zoomIndex].value}
        />

        <Pressable
          onPress={close}
          accessibilityLabel="닫기"
          style={{
            position: "absolute",
            left: 16,
            top: insets.top + 8,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(251,250,246,.14)",
          }}
        >
          <Text style={{ fontSize: 16, color: C.card }}>✕</Text>
        </Pressable>

        <Pressable
          onPress={() => setFlash((f) => (f === "off" ? "on" : f === "on" ? "auto" : "off"))}
          accessibilityLabel={`플래시 ${flash}`}
          style={{
            position: "absolute",
            right: 16,
            top: insets.top + 8,
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(251,250,246,.14)",
          }}
        >
          <FlashIcon mode={flash} />
        </Pressable>

        <View style={{ position: "absolute", top: insets.top + 14, left: 0, right: 0, alignItems: "center", gap: 7 }}>
          <Text style={{ fontFamily: FONT.serifBold, fontSize: 18, color: C.card }}>지금 여기</Text>
          <View style={{ borderRadius: 14, backgroundColor: "rgba(251,250,246,.12)", paddingVertical: 5, paddingHorizontal: 12 }}>
            <Text style={{ fontSize: 11, color: "rgba(251,250,246,.8)", fontFamily: FONT.sans }}>
              찍고 나서 가게를 고르면 돼요
            </Text>
          </View>
          {verifyWish && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 14,
                backgroundColor: "rgba(180,85,45,.34)",
                paddingVertical: 5,
                paddingHorizontal: 12,
              }}
            >
              <BookmarkIcon size={11} fill={C.card} stroke={C.card} />
              <Text style={{ fontSize: 11, color: C.card, fontFamily: FONT.sans }}>
                {verifyWish.name} · 담아둔 곳
              </Text>
            </View>
          )}
        </View>

        {/* 배율 — 렌즈를 실제로 바꿉니다. */}
        <View
          style={{
            position: "absolute",
            bottom: insets.bottom + 214,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
          }}
        >
          {ZOOM_STEPS.map((z, i) => {
            const on = zoomIndex === i;
            const size = on ? 50 : 44;
            return (
              <Pressable
                key={z.label}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setZoomIndex(i);
                }}
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? "rgba(251,250,246,.26)" : "rgba(251,250,246,.14)",
                }}
              >
                <Text style={{ fontFamily: FONT.mono, fontSize: on ? 12.5 : 11, color: C.card }}>{z.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            position: "absolute",
            bottom: insets.bottom + 104,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 34,
          }}
        >
          <Pressable
            onPress={pickFromGallery}
            accessibilityLabel="갤러리에서 고르기"
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "rgba(251,250,246,.1)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {recentPhoto ? (
              <Image source={{ uri: recentPhoto }} style={{ width: 46, height: 46 }} />
            ) : (
              <CameraIcon size={19} stroke="rgba(251,250,246,.6)" width={1.6} />
            )}
          </Pressable>

          <Pressable
            onPress={takeShot}
            accessibilityLabel="찍기"
            disabled={taking}
            style={{
              width: 78,
              height: 78,
              borderRadius: 39,
              borderWidth: 3,
              borderColor: "rgba(251,250,246,.85)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
              {taking && <ActivityIndicator color={C.brick} />}
            </View>
          </Pressable>

          <Pressable
            onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
            accessibilityLabel="카메라 전환"
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(251,250,246,.1)",
            }}
          >
            <FlipIcon />
          </Pressable>
        </View>

        <Text
          style={{
            position: "absolute",
            bottom: insets.bottom + 56,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 11.5,
            color: "rgba(251,250,246,.45)",
            fontFamily: FONT.sans,
          }}
        >
          갤러리에서 고른 사진은 인증되지 않아요
        </Text>
      </View>
    );
  }

  if (step === "search") {
    const typed = pickQuery.trim();

    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: "#e6e0d3",
            paddingHorizontal: 20,
            paddingBottom: 14,
            paddingTop: insets.top + 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => setStep("pick")} accessibilityLabel="뒤로" hitSlop={8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -10 }}>
              <Text style={{ fontSize: 17, color: C.ink }}>←</Text>
            </Pressable>
            <Text style={{ flex: 1, fontFamily: FONT.serifBold, fontSize: 18, color: C.ink }}>가게 찾기</Text>
            <KindSegment value={pickKind} onChange={setPickKind} />
          </View>

          <TextInput
            value={pickQuery}
            onChangeText={setPickQuery}
            placeholder="가게 이름"
            placeholderTextColor={C.placeholder}
            style={{
              marginTop: 12,
              minHeight: 48,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: C.hairline,
              backgroundColor: C.card,
              paddingHorizontal: 15,
              fontSize: 14,
              color: C.ink,
              fontFamily: FONT.sans,
            }}
          />

          <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 18, color: C.faint, fontFamily: FONT.sans }}>
              인증은 50m 안에 있는 가게에만 붙습니다. 그보다 먼 곳은 인증 없이 기록으로 남길 수 있습니다.
            </Text>
            {searching && <Text style={{ fontFamily: FONT.mono, fontSize: 10, color: C.faint }}>검색 중…</Text>}
          </View>
        </View>

        <FlatList
          data={searchHits}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 30, gap: 9 }}
          renderItem={({ item: c }) => {
            const far = !!geo && (c.distance ?? Infinity) > PICK_MAX_M;
            const note =
              c.distance == null
                ? "인증할 수 있습니다"
                : far
                  ? `${formatDistance(c.distance)} · 인증 없이 기록됩니다`
                  : `${formatDistance(c.distance)} · 인증할 수 있습니다`;

            return (
              <Pressable
                onPress={() => {
                  // 50m 밖 결과를 누르면 인증 없이 기록으로 넘깁니다.
                  if (far) return goUnverified(c.name, c.kind);
                  setPicked(c);
                  setStep("done");
                }}
                style={{
                  minHeight: 62,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: far ? "#e4dfd3" : C.hairline,
                  backgroundColor: far ? "transparent" : C.card,
                  paddingHorizontal: 15,
                  paddingVertical: 13,
                }}
              >
                <DistanceBadge distance={c.distance} hot={!far} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: FONT.serifBold, fontSize: 16, color: C.ink }}>
                    {c.name}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>
                    {[c.mine ? "내 기록" : c.category, c.address].filter(Boolean).join(" · ")}
                  </Text>
                  <Text style={{ marginTop: 4, fontSize: 10.5, color: far ? C.dim : C.brick, fontFamily: FONT.sans }}>
                    {note}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <View style={{ gap: 9 }}>
              {searchHits.length === 0 && !searching && typed.length > 0 && (
                <Text style={{ paddingHorizontal: 8, paddingVertical: 24, textAlign: "center", fontSize: 12, lineHeight: 20, color: C.faint, fontFamily: FONT.sans }}>
                  찾는 이름과 맞는 가게가 없습니다. 그대로 인증 없이 기록할 수 있습니다.
                </Text>
              )}
              {typed.length > 0 && (
                <Pressable
                  onPress={() => goUnverified(typed, pickKind)}
                  style={{
                    marginTop: 4,
                    minHeight: 50,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 20,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: "#cdc6b8",
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: FONT.sans }}>
                    「{typed}」 로 인증 없이 기록하기
                  </Text>
                </Pressable>
              )}
            </View>
          }
        />
      </View>
    );
  }

  if (step === "pick") {
    return (
      <View style={{ flex: 1, backgroundColor: C.paper }}>
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <PhotoFill src={shot} category="한식" radius={18} style={{ width: 74, height: 74 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: FONT.serifBold, fontSize: 20, lineHeight: 27, color: C.ink }}>
                여기 어디예요?
              </Text>
              <Text style={{ marginTop: 5, fontSize: 11.5, lineHeight: 18, color: C.muted, fontFamily: FONT.sans }}>
                {geo
                  ? `지금 위치에서 가까운 곳입니다 (정확도 ${geo.acc}m)`
                  : geoErr ?? "위치를 읽는 중입니다…"}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <KindSegment value={pickKind} onChange={setPickKind} fill />
          </View>
        </View>

        <FlatList
          data={pickList}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 9 }}
          ListHeaderComponent={
            noneNear ? (
              <View
                style={{
                  marginBottom: 4,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: "#e2c9bb",
                  backgroundColor: "#f9f0e9",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <Text style={{ fontSize: 12, lineHeight: 20, color: C.muted, fontFamily: FONT.sans }}>
                  50m 안에 가게가 없습니다. 가게 앞에서 다시 찍으면 인증이 붙습니다.
                </Text>
                <Pressable
                  onPress={() => goUnverified(undefined, pickKind)}
                  style={{
                    marginTop: 11,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: C.hairline,
                    backgroundColor: C.card,
                  }}
                >
                  <Text style={{ fontSize: 12.5, color: C.ink, fontFamily: FONT.sans }}>인증 없이 기록만 남기기</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item: c }) => {
            const emphasised = !c.far && (c.hot || !!c.wish);

            return (
              <Pressable
                disabled={c.far}
                onPress={() => {
                  if (c.far) return;
                  void Haptics.selectionAsync();
                  setPicked(c);
                  setStep("done");
                }}
                style={[
                  {
                    minHeight: 62,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderRadius: 20,
                    paddingHorizontal: 15,
                    paddingVertical: 13,
                    opacity: c.far ? 0.5 : 1,
                    borderWidth: emphasised ? 1.5 : 1,
                    borderColor: emphasised ? C.brick : C.hairline,
                    backgroundColor: c.far ? "transparent" : emphasised ? "#f9f0e9" : C.card,
                  },
                  emphasised ? SHADOW.hotRow : null,
                ]}
              >
                <DistanceBadge distance={c.distance} hot={emphasised} />

                <View style={{ flex: 1, minWidth: 0 }}>
                  {c.wish && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
                      <BookmarkIcon size={12} fill={C.brick} stroke={C.brick} />
                      <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, color: C.brick }}>
                        위시리스트에 담아둔 식당
                      </Text>
                    </View>
                  )}
                  <Text numberOfLines={1} style={{ fontFamily: FONT.serifBold, fontSize: 16, color: C.ink }}>
                    {c.name}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>
                    {[c.mine ? "내 기록" : c.category, c.address].filter(Boolean).join(" · ")}
                  </Text>
                  {c.far && (
                    <Text style={{ marginTop: 4, fontSize: 10.5, color: C.dim, fontFamily: FONT.sans }}>
                      너무 멀어 고를 수 없습니다
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <View>
              {candidates.length === 0 && (
                <Text style={{ paddingHorizontal: 8, paddingVertical: 40, textAlign: "center", fontSize: 12.5, lineHeight: 22, color: C.faint, fontFamily: FONT.sans }}>
                  {geoErr
                    ? "위치를 읽지 못해 가까운 가게를 찾을 수 없습니다."
                    : "가까운 가게를 찾는 중입니다…"}
                </Text>
              )}

              <Pressable
                onPress={() => setStep("search")}
                style={{
                  marginTop: 4,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 20,
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: C.line,
                }}
              >
                <Text style={{ fontSize: 12.5, color: C.muted, fontFamily: FONT.sans }}>여기 없어요 · 직접 찾기</Text>
              </Pressable>
            </View>
          }
        />

        {!online && (
          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#e0c3b1",
              backgroundColor: "#f9f0e9",
              paddingHorizontal: 15,
              paddingVertical: 13,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brick }} />
            <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 18, color: C.muted, fontFamily: FONT.sans }}>
              지금 오프라인입니다. 인증은 그대로 붙고, 사진은 연결되면 올라갑니다.
            </Text>
          </View>
        )}

        <View
          style={{
            marginHorizontal: 20,
            marginBottom: insets.bottom + 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#e4dfd3",
            backgroundColor: C.card,
            paddingHorizontal: 15,
            paddingVertical: 13,
          }}
        >
          <PinIcon />
          <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 18, color: C.muted, fontFamily: FONT.sans }}>
            읽은 좌표는 가까운 가게를 찾는 데에만 쓰고, 기록에는 남기지 않습니다.
          </Text>
        </View>
      </View>
    );
  }

  /* ── 단계 04 · 인증 완료 ────────────────────────── */

  const at = shotAt ?? new Date();
  const wishDays = picked?.wish ? wishMetInfo(picked.wish, isoDate(at)).days : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View
          style={[
            {
              marginHorizontal: 20,
              marginTop: insets.top + 12,
              borderRadius: 30,
              backgroundColor: C.card,
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 20,
            },
            SHADOW.bigCard,
          ]}
        >
          <PhotoFill src={shot} category={picked?.category ?? "한식"} radius={22} style={{ height: 296 }}>
            <View
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                borderRadius: 14,
                backgroundColor: "rgba(28,26,23,.55)",
                paddingHorizontal: 11,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontFamily: FONT.mono, fontSize: 9.5, letterSpacing: 0.95, color: C.card }}>
                {hhmm(at)}
              </Text>
            </View>
            <View style={{ position: "absolute", right: 16, bottom: 16 }}>
              <VerifiedMark size={52} shadow />
            </View>
          </PhotoFill>

          <Text style={{ marginTop: 18, textAlign: "center", fontFamily: FONT.serifBold, fontSize: 22, color: C.ink }}>
            방문이 인증되었습니다
          </Text>
          <Text style={{ marginTop: 7, textAlign: "center", fontSize: 12, color: C.muted, fontFamily: FONT.sans }}>
            {picked?.name} · {isoDate(at).replaceAll("-", ".")} {hhmm(at)}
          </Text>

          {wishDays != null && (
            <View
              style={{
                marginTop: 12,
                alignSelf: "center",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "#e0c3b1",
                backgroundColor: "#f9f0e9",
                paddingHorizontal: 12,
                paddingVertical: 7,
              }}
            >
              <BookmarkIcon size={12} fill={C.brick} stroke={C.brick} />
              <Text style={{ fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>
                담아둔 지 {wishDays}일 만에 다녀왔습니다
              </Text>
            </View>
          )}

          {autoMatched && (
            <Text style={{ marginTop: 10, textAlign: "center", fontSize: 11, color: C.brick, fontFamily: FONT.sans }}>
              담아둔 곳이라 바로 이 가게로 정했습니다
            </Text>
          )}
        </View>

        <UploadStatus upload={upload} />
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 10 }}>
        <Pressable
          onPress={() => {
            if (upload.state === "saved") router.replace(`/record/${upload.id}/edit`);
            else if (upload.state === "queued") router.replace("/drafts");
          }}
          disabled={upload.state === "uploading" || upload.state === "error"}
          style={{
            borderRadius: 20,
            backgroundColor: C.ink,
            padding: 17,
            alignItems: "center",
            opacity: upload.state === "uploading" || upload.state === "error" ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 15, color: C.card, fontFamily: FONT.sansMedium }}>
            {upload.state === "queued" ? "보관함에서 이어 쓰기" : "이어서 기록 쓰기"}
          </Text>
        </Pressable>

        <Pressable onPress={close} style={{ marginTop: 8, padding: 14, alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: C.faint, fontFamily: FONT.sans }}>나중에 쓸게요</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 34×34 거리 배지 — 강조는 브릭, 기본은 종이. */
function DistanceBadge({ distance, hot }: { distance: number | null; hot: boolean }) {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hot ? C.brickSoft : "#f1ede4",
      }}
    >
      <Text style={{ fontFamily: FONT.mono, fontSize: 9.5, color: hot ? C.brick : C.muted }}>
        {distance == null ? "—" : formatDistance(distance)}
      </Text>
    </View>
  );
}

function UploadStatus({
  upload,
}: {
  upload:
    | { state: "idle" }
    | { state: "uploading" }
    | { state: "saved"; id: number }
    | { state: "queued" }
    | { state: "error"; message: string };
}) {
  const text =
    upload.state === "uploading"
      ? { title: "사진 올리는 중 · 1 / 1", note: "앱을 닫아도 이어서 올라갑니다." }
      : upload.state === "saved"
        ? { title: "올렸습니다", note: "보관함에서 이어서 쓸 수 있습니다." }
        : upload.state === "queued"
          ? { title: "연결되면 올라갑니다", note: "인증은 그대로 붙었습니다. 보관함에서 상태를 볼 수 있습니다." }
          : upload.state === "error"
            ? { title: "올리지 못했습니다", note: upload.message }
            : null;

  if (!text) return null;

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#e4dfd3",
        backgroundColor: C.card,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      {upload.state === "uploading" && <Spinner />}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12.5, color: C.ink, fontFamily: FONT.sansMedium }}>{text.title}</Text>
        <Text style={{ marginTop: 2, fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>{text.note}</Text>
      </View>
    </View>
  );
}

/**
 * 단계 01 — 권한 준비. OS 다이얼로그를 띄우기 **전에** 왜 필요한지 설명합니다.
 * 웹에는 없던 화면이고, 권한 거부율을 크게 낮춥니다.
 * 알림 권한은 여기서 요청하지 않습니다 — 첫 위시를 저장할 때로 미룹니다(§7).
 */
function PermissionStep({
  insets,
  busy,
  denied,
  onAllow,
  onSkip,
  onClose,
}: {
  insets: { top: number; bottom: number };
  busy: boolean;
  denied: boolean;
  onAllow: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="닫기"
        style={{
          position: "absolute",
          left: 20,
          top: insets.top + 8,
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2,
        }}
      >
        <Text style={{ fontSize: 17, color: C.ink }}>✕</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 96, paddingBottom: 20 }}>
        <Text style={{ paddingHorizontal: 28, fontFamily: FONT.serifBold, fontSize: 27, lineHeight: 38, color: C.ink }}>
          그 자리에 있었다는 것,{"\n"}사진과 위치로 남깁니다
        </Text>
        <Text style={{ marginTop: 14, paddingHorizontal: 28, fontSize: 13, lineHeight: 24, color: C.muted, fontFamily: FONT.sans }}>
          DINARY 의 인증은 가게 앞에서 찍은 사진에만 붙습니다. 그래서 두 가지가 필요합니다.
        </Text>

        <View style={{ marginTop: 24, paddingHorizontal: 24, gap: 12 }}>
          <PermissionCard
            icon={<CameraIcon size={21} stroke={C.brick} width={1.7} />}
            title="카메라"
            body="인증 사진을 찍는 데에만 씁니다. 갤러리에서 고른 사진에는 인증이 붙지 않습니다."
          />
          <PermissionCard
            icon={<PinIcon size={21} />}
            title="위치"
            body="사진 찍는 순간 한 번만 읽어 50m 안의 가게를 찾습니다. 좌표는 기록에 남기지 않습니다."
          />
          <PermissionCard
            dashed
            icon={<BellIcon size={21} stroke={C.faint} />}
            title="알림"
            body="담아둔 곳 근처에 왔을 때 알려 드립니다. 첫 위시를 저장하는 순간 여쭙습니다."
          />
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 10 }}>
        <Pressable
          onPress={onAllow}
          disabled={busy}
          style={{ borderRadius: 20, backgroundColor: C.ink, padding: 18, alignItems: "center", opacity: busy ? 0.6 : 1 }}
        >
          <Text style={{ fontSize: 15, color: C.card, fontFamily: FONT.sansMedium }}>
            {denied ? "설정에서 허용하기" : "허용하고 촬영 시작"}
          </Text>
        </Pressable>

        <Pressable onPress={onSkip} style={{ marginTop: 8, padding: 14, alignItems: "center" }}>
          <Text style={{ fontSize: 13, color: C.faint, fontFamily: FONT.sans }}>인증 없이 기록만 남길게요</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PermissionCard({
  icon,
  title,
  body,
  dashed = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  dashed?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 14,
        borderRadius: 22,
        borderWidth: 1,
        borderStyle: dashed ? "dashed" : "solid",
        borderColor: dashed ? C.line : C.lineSoft,
        backgroundColor: dashed ? "transparent" : C.card,
        padding: 18,
      }}
    >
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: dashed ? "#efeade" : C.brickSoft,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, color: dashed ? "#4a453d" : C.ink, fontFamily: FONT.sansBold }}>{title}</Text>
        <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 20, color: dashed ? C.faint : C.muted, fontFamily: FONT.sans }}>
          {body}
        </Text>
      </View>
    </View>
  );
}
