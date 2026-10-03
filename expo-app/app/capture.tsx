import { useQueryClient } from "@tanstack/react-query";
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from "expo-camera";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library/legacy";
import { useNetInfo } from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BellIcon, BookmarkIcon, CameraIcon, FlashIcon, FlipIcon, MapPinIcon, VerifiedMark } from "@/components/icons";
import { useRows, useWishes } from "@/data/queries";
import { useAppState } from "@/data/store";
import {
  buildCandidates, buildMine, formatDistance, hhmm, isoDate, metersBetween, nearToCandidate, noneNear, pickCandidates,
  pickList, searchHits, PICK_MAX_M, type Candidate, type Geo, type PickItem,
} from "@/features/capture/logic";
import { nearbyPlaces, searchFoodPlaces, type FoodPlace } from "@/lib/geocode";
import { drainQueue } from "@/features/queue/process";
import { enqueue, persistPhoto } from "@/features/queue/db";
import { supabase } from "@/lib/supabase";
import {
  findMatchingWish, wishKind, wishMetInfo, WISH_AUTO_M, type Kind, type Wish,
} from "@/lib/types";
import { C, F, SHADOW } from "@/theme";

type Step = "permission" | "shoot" | "pick" | "search" | "done";
type Shot = { uri: string };

const FLASH_CYCLE: FlashMode[] = ["off", "on", "auto"];
const ZOOMS = [
  { label: ".5×", zoom: 0, lens: "builtInUltraWideCamera" },
  { label: "1×", zoom: 0, lens: undefined },
  { label: "2×", zoom: 0.2, lens: undefined },
] as const;

const camMessage = (denied: boolean) =>
  denied ? "카메라 권한이 거부되었습니다. 설정에서 허용해 주세요." : "카메라를 열 수 없습니다.";

/** 웹 CaptureFlow 의 4단계 + 권한 준비 한 장 — 핸드오프 §4.2. */
export default function Capture() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ verifyWishId?: string; kind?: Kind }>();
  const { data: rows = [] } = useRows();
  const { data: wishes = [] } = useWishes();

  const verifyWish = useMemo(
    () => (params.verifyWishId ? (wishes.find((w) => w.id === params.verifyWishId) ?? null) : null),
    [wishes, params.verifyWishId]
  );

  const net = useNetInfo();
  const offline = net.isConnected === false;
  const [camPerm, requestCam] = useCameraPermissions();
  const [locPerm, requestLoc] = Location.useForegroundPermissions();
  const permsGranted = !!camPerm?.granted && !!locPerm?.granted;
  const permsKnown = camPerm !== null && locPerm !== null;

  const [step, setStep] = useState<Step>("permission");
  const [shot, setShot] = useState<Shot | null>(null);
  const [shotAt, setShotAt] = useState<Date | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraType>("back");
  const [flash, setFlash] = useState<FlashMode>("off");
  const [zoomIdx, setZoomIdx] = useState(1);
  const [lenses, setLenses] = useState<string[]>([]);
  const appState = useAppState();
  const [pickKind, setPickKind] = useState<Kind>(params.kind ?? appState.kind);
  const [picked, setPicked] = useState<Candidate | null>(null);
  const [extra, setExtra] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [apiHits, setApiHits] = useState<FoodPlace[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [latestPhoto, setLatestPhoto] = useState<string | null>(null);

  // 이미 두 권한이 모두 허용돼 있으면 권한 준비 화면을 건너뜁니다.
  useEffect(() => {
    if (permsKnown && permsGranted && step === "permission") setStep("shoot");
  }, [permsKnown, permsGranted, step]);

  // 갤러리 썸네일 — 최근 사진 1장(권한이 없으면 회색 자리표시).
  useEffect(() => {
    if (step !== "shoot") return;
    (async () => {
      try {
        const perm = await MediaLibrary.getPermissionsAsync();
        if (!perm.granted) return;
        const { assets } = await MediaLibrary.getAssetsAsync({ first: 1, mediaType: "photo", sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
        setLatestPhoto(assets[0]?.uri ?? null);
      } catch { /* 썸네일은 없어도 됩니다 */ }
    })();
  }, [step]);

  const denied = (camPerm && !camPerm.granted && !camPerm.canAskAgain) || (locPerm && !locPerm.granted && !locPerm.canAskAgain);

  async function allow() {
    if (denied) return Linking.openSettings();
    const cam = await requestCam();
    const loc = await requestLoc();
    if (cam.granted && loc.granted) setStep("shoot");
  }

  async function readGeo() {
    setGeo(null);
    setGeoErr(null);
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy ?? 0) });
    } catch {
      setGeoErr("위치 권한이 없어 좌표를 읽지 못했습니다.");
    }
  }

  async function shoot() {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const at = new Date();
      void readGeo(); // 동시에 위치 1회 읽기
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, skipProcessing: true });
      const out = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 900 } }], {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setShot({ uri: out.uri });
      setShotAt(at);
      setStep("pick");
    } catch {
      setError(camMessage(false));
    } finally {
      setBusy(false);
    }
  }

  async function fromGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (!res.canceled) onUnverified(); // 갤러리 사진은 인증되지 않습니다
  }

  /** 인증 없이 기록만 남깁니다 — 이름·종류를 채워 기록 입력을 엽니다. */
  function onUnverified(name?: string, k?: Kind) {
    router.replace({ pathname: "/record/edit", params: { kind: k ?? pickKind, name: name ?? "" } });
  }

  /* ── 후보 ─────────────────────────────────────── */

  const mine = useMemo(() => buildMine(rows, geo), [rows, geo]);
  const candidates = useMemo(() => buildCandidates(mine, extra, pickKind), [mine, extra, pickKind]);
  const list = useMemo(() => pickList(pickCandidates(candidates, wishes, geo), geo), [candidates, wishes, geo]);
  const none = noneNear(candidates, list, geo);
  const hits = useMemo(
    () => searchHits({ rows, extra, apiHits, query, geo, pickKind }),
    [rows, extra, apiHits, query, geo, pickKind]
  );

  useEffect(() => {
    if (step !== "pick" || !geo) return;
    let cancelled = false;
    nearbyPlaces(geo.lat, geo.lng)
      .then((found) => !cancelled && setExtra(found.map(nearToCandidate)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step, geo]);

  useEffect(() => {
    if (step !== "search") return;
    const needle = query.trim();
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      if (needle.length < 2) return setApiHits([]);
      searchFoodPlaces(needle, ctrl.signal).then(setApiHits).catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [step, query]);

  // 인증 대상 위시가 100m 이내면 후보를 묻지 않고 그 가게로 정합니다.
  useEffect(() => {
    if (step !== "pick" || !geo || !verifyWish || picked) return;
    if (verifyWish.lat == null || verifyWish.lng == null) return;
    const d = metersBetween(geo, verifyWish.lat, verifyWish.lng);
    if (d > WISH_AUTO_M) return;
    const wk = wishKind(verifyWish);
    setPicked({
      id: `wish:${verifyWish.id}`, name: verifyWish.name, kind: wk, category: verifyWish.category,
      region: null, address: verifyWish.where_text, lat: verifyWish.lat, lng: verifyWish.lng,
      distance: d, mine: false, wish: verifyWish,
    });
    setStep("done");
  }, [step, geo, verifyWish, picked]);

  /* ── 저장 ─────────────────────────────────────── */

  /**
   * 사진과 페이로드를 먼저 기기에 적어 두고(오프라인 큐, 핸드오프 §6) 올립니다.
   * 연결돼 있으면 바로 올려 새 기록으로 이어가고, 아니면 큐에 남겨 두고 연결되면 올라갑니다.
   */
  async function commit(writeNow: boolean) {
    if (!picked || !shot) return;
    setSaving(true);
    setError("");

    try {
      const at = shotAt ?? new Date();
      const twin = rows.find((r) => r.name === picked.name && r.kind === picked.kind);
      const address = twin?.address ?? picked.address ?? null;
      const matchedWish: Wish | null = picked.wish ?? findMatchingWish(wishes, picked, WISH_AUTO_M);
      const fromWish = matchedWish ? wishMetInfo(matchedWish, isoDate(at)) : null;

      // getSession 은 기기에 저장된 세션을 읽으니 오프라인에서도 됩니다.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("로그인이 필요합니다");

      const payload = {
        user_id: session.user.id,
        kind: picked.kind,
        name: picked.name,
        category: twin?.category ?? picked.category,
        region: twin?.region ?? picked.region,
        address,
        place_key: `${picked.name}|${address ?? ""}`.toLowerCase(),
        lat: twin?.lat ?? picked.lat, // 고른 가게의 좌표 — 읽은 위치는 저장하지 않습니다.
        lng: twin?.lng ?? picked.lng,
        rating: null, menu: null, menus: [], price_level: null, price_range: null, review: null, keywords: [],
        revisit: Boolean(twin),
        visited_at: isoDate(at),
        verified: true,
        acc: geo?.acc ?? null,
        pending: !writeNow,
        from_wish: fromWish,
      };

      const queueId = await enqueue(payload, persistPhoto(shot.uri), matchedWish?.id ?? null);
      const newId = await drainQueue(qc, queueId);

      if (newId != null) {
        if (writeNow) router.replace({ pathname: "/record/edit", params: { id: String(newId) } });
        else router.back();
        return;
      }

      // 아직 못 올렸습니다 — 큐에 남아 있으니 닫아도 이어서 올라갑니다.
      Alert.alert(
        "인증은 저장했어요",
        "연결되면 사진이 올라갑니다. 앱을 닫아도 이어서 올라가고, 보관함에서 상태를 볼 수 있어요.",
        [{ text: "확인", onPress: () => router.back() }]
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "기록을 저장하지 못했습니다");
      setSaving(false);
    }
  }

  const close = () => router.back();

  /* ── 화면 ─────────────────────────────────────── */

  if (step === "permission") {
    return (
      <View style={[s.light, { paddingTop: insets.top + 8 }]}>
        <Pressable style={s.closeLight} onPress={close}><Text style={s.closeX}>✕</Text></Pressable>
        <View style={{ paddingHorizontal: 28, marginTop: 44 }}>
          <Text style={s.permTitle}>{"그 자리에 있었다는 것,\n사진과 위치로 남깁니다"}</Text>
          <Text style={s.permDesc}>DINARY 의 인증은 가게 앞에서 찍은 사진에만 붙습니다. 그래서 두 가지가 필요합니다.</Text>
        </View>
        <View style={{ paddingHorizontal: 24, marginTop: 40, gap: 12 }}>
          <PermCard icon={<CameraIcon size={21} stroke={C.brick} />} title="카메라"
            body="인증 사진을 찍는 데에만 씁니다. 갤러리에서 고른 사진에는 인증이 붙지 않습니다." />
          <PermCard icon={<MapPinIcon size={21} stroke={C.brick} />} title="위치"
            body="사진 찍는 순간 한 번만 읽어 50m 안의 가게를 찾습니다. 좌표는 기록에 남기지 않습니다." />
          <PermCard dashed icon={<BellIcon size={19} stroke={C.faint} />} title="알림 · 나중에 물어봅니다"
            body="담아둔 곳 근처에 왔을 때 알려 드립니다. 첫 위시를 저장하는 순간 여쭙습니다." />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 10 }}>
          <Pressable style={s.dark} onPress={allow}>
            <Text style={s.darkText}>{denied ? "설정에서 허용하기" : "허용하고 촬영 시작"}</Text>
          </Pressable>
          <Pressable style={{ padding: 14, alignItems: "center", marginTop: 8 }} onPress={() => onUnverified()}>
            <Text style={s.ghost}>인증 없이 기록만 남길게요</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === "shoot") {
    const z = ZOOMS[zoomIdx];
    const hasUltra = lenses.includes("builtInUltraWideCamera");
    const zoomChoices = ZOOMS.map((o, i) => ({ ...o, i })).filter((o) => o.lens == null || hasUltra);
    return (
      <View style={s.darkRoot}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          flash={flash}
          zoom={z.zoom}
          selectedLens={z.lens}
          onAvailableLensesChanged={(e) => setLenses(e.lenses)}
        />
        <Pressable style={[s.roundDark, { left: 16, top: insets.top + 8 }]} onPress={close}>
          <Text style={{ color: C.card, fontSize: 16 }}>✕</Text>
        </Pressable>
        <Pressable
          style={[s.roundDark, { right: 16, top: insets.top + 8 }]}
          onPress={() => setFlash(FLASH_CYCLE[(FLASH_CYCLE.indexOf(flash) + 1) % FLASH_CYCLE.length])}
        >
          <FlashIcon />
          {flash !== "on" && <Text style={s.flashTag}>{flash === "auto" ? "A" : "×"}</Text>}
        </Pressable>

        <View style={[s.titleBlock, { top: insets.top + 14 }]} pointerEvents="none">
          <Text style={s.shootTitle}>지금 여기</Text>
          <View style={s.pill}><Text style={s.pillText}>{geo ? `정확도 ${geo.acc}m` : "위치는 촬영 순간에 읽습니다"}</Text></View>
          {verifyWish && (
            <View style={[s.pill, { backgroundColor: "rgba(180,85,45,.34)", flexDirection: "row", gap: 5, alignItems: "center" }]}>
              <BookmarkIcon size={11} stroke={C.card} fill={C.card} />
              <Text style={[s.pillText, { color: C.card }]}>{verifyWish.name} · 담아둔 곳</Text>
            </View>
          )}
        </View>

        <View style={[s.zooms, { bottom: insets.bottom + 214 }]}>
          {zoomChoices.map((o) => {
            const on = o.i === zoomIdx;
            return (
              <Pressable key={o.label} onPress={() => { Haptics.selectionAsync(); setZoomIdx(o.i); }}
                style={[s.zoomBtn, on && s.zoomOn]}>
                <Text style={[s.zoomText, on && { fontSize: 12.5 }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[s.shootRow, { bottom: insets.bottom + 104 }]}>
          <Pressable style={s.gallery} onPress={fromGallery} accessibilityLabel="갤러리에서 고르기">
            {latestPhoto && <Image source={{ uri: latestPhoto }} style={{ width: 46, height: 46, borderRadius: 12 }} />}
          </Pressable>
          <Pressable onPress={shoot} disabled={busy} style={s.shutterOuter} accessibilityLabel="촬영">
            <View style={s.shutterInner} />
          </Pressable>
          <Pressable style={s.flip} onPress={() => setFacing(facing === "back" ? "front" : "back")}>
            <FlipIcon stroke="rgba(251,250,246,.65)" />
          </Pressable>
        </View>
        <Text style={[s.note, { bottom: insets.bottom + 56 }]}>갤러리에서 고른 사진은 인증되지 않아요</Text>
        {!!error && <Text style={[s.note, { bottom: insets.bottom + 30, color: "#f3b89f" }]}>{error}</Text>}
      </View>
    );
  }

  if (step === "pick" || step === "search") {
    const searching = step === "search";
    const items: Candidate[] | PickItem[] = searching ? hits : list;
    return (
      <View style={[s.light, { paddingHorizontal: 20, paddingTop: insets.top + 8 }]}>
        {searching ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable style={s.back} onPress={() => setStep("pick")}><Text style={s.closeX}>←</Text></Pressable>
            <Text style={s.h18}>가게 찾기</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            {shot && <Image source={{ uri: shot.uri }} style={s.thumb74} />}
            <View style={{ flex: 1 }}>
              <Text style={s.pickTitle}>여기 어디예요?</Text>
              <Text style={s.pickSub}>
                {geo ? `지금 위치에서 가까운 곳입니다 (정확도 ${geo.acc}m)` : (geoErr ?? "위치를 읽는 중입니다…")}
              </Text>
            </View>
          </View>
        )}

        <View style={s.seg}>
          {(["restaurant", "cafe"] as Kind[]).map((k) => (
            <Pressable key={k} style={[s.segItem, pickKind === k && s.segOn]} onPress={() => setPickKind(k)}>
              <Text style={[s.segText, pickKind === k && { color: C.card }]}>{k === "restaurant" ? "맛집" : "카페"}</Text>
            </Pressable>
          ))}
        </View>

        {searching && (
          <TextInput
            autoFocus value={query} onChangeText={setQuery} placeholder="가게 이름이나 주소"
            placeholderTextColor="#b3ada1" style={s.input}
          />
        )}

        <FlatList
          style={{ marginTop: 12 }}
          data={items as (Candidate & Partial<PickItem>)[]}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={() => <View style={{ height: 9 }} />}
          renderItem={({ item: c }) => (
            <CandidateRow
              c={c}
              onPress={() => {
                Haptics.selectionAsync();
                if (searching && c.distance != null && c.distance > PICK_MAX_M) return onUnverified(c.name, c.kind);
                setPicked(c);
                setStep("done");
              }}
            />
          )}
          ListFooterComponent={
            searching ? null : (
              <Pressable style={s.manual} onPress={() => setStep("search")}>
                <Text style={s.manualText}>여기 없어요 · 직접 찾기</Text>
              </Pressable>
            )
          }
        />

        <View style={{ paddingBottom: insets.bottom + 10, gap: 8 }}>
          {offline && (
            <View style={s.offline}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brick }} />
              <Text style={s.noticeText}>지금 오프라인입니다. 인증은 그대로 붙고, 사진은 연결되면 올라갑니다.</Text>
            </View>
          )}
          {none && <Text style={s.hint}>가까운 가게가 없어요. 직접 찾아 주세요.</Text>}
          <View style={s.notice}>
            <MapPinIcon size={15} stroke={C.brick} strokeWidth={1.7} />
            <Text style={s.noticeText}>읽은 좌표는 가까운 가게를 찾는 데에만 쓰고, 기록에는 남기지 않습니다.</Text>
          </View>
        </View>
      </View>
    );
  }

  // done — 인증 완료
  const at = shotAt ?? new Date();
  const days = picked?.wish ? wishMetInfo(picked.wish, isoDate(at)).days : null;
  const stamp = `${isoDate(at).replaceAll("-", ".")} ${hhmm(at)}`;
  return (
    <View style={[s.light, { paddingHorizontal: 20, paddingTop: insets.top + 12 }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[s.doneCard, SHADOW.big]}>
          <View>
            {shot && <Image source={{ uri: shot.uri }} style={s.donePhoto} />}
            <View style={s.timeBadge}><Text style={s.timeText}>{hhmm(at)}</Text></View>
            <View style={{ position: "absolute", right: 16, bottom: 16 }}><VerifiedMark size={52} /></View>
          </View>
          <Text style={s.doneTitle}>방문이 인증되었습니다</Text>
          <Text style={s.doneSub}>{picked?.name} · {stamp}</Text>
          {days != null && (
            <View style={s.wishMet}>
              <BookmarkIcon size={12} stroke={C.brick} fill={C.brick} />
              <Text style={s.wishMetText}>담아둔 지 {days}일 만에 다녀왔습니다</Text>
            </View>
          )}
        </View>
        {saving && (
          <View style={s.upload}>
            <ActivityIndicator color={C.brick} />
            <View>
              <Text style={s.uploadMain}>{offline ? "연결을 기다리는 중 · 1 / 1" : "사진 올리는 중 · 1 / 1"}</Text>
              <Text style={s.uploadSub}>앱을 닫아도 이어서 올라갑니다.</Text>
            </View>
          </View>
        )}
        {!!error && <Text style={[s.hint, { color: C.brick, marginTop: 12 }]}>{error}</Text>}
      </ScrollView>
      <View style={{ paddingBottom: insets.bottom + 10 }}>
        <Pressable style={[s.dark, { paddingVertical: 17 }, saving && { opacity: 0.5 }]} disabled={saving} onPress={() => commit(true)}>
          <Text style={s.darkText}>이어서 기록 쓰기</Text>
        </Pressable>
        <Pressable style={{ padding: 14, alignItems: "center", marginTop: 8 }} disabled={saving} onPress={() => commit(false)}>
          <Text style={s.ghost}>나중에 쓸게요</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PermCard({ icon, title, body, dashed }: { icon: React.ReactNode; title: string; body: string; dashed?: boolean }) {
  return (
    <View style={[s.perm, dashed ? { borderStyle: "dashed", borderColor: C.line, backgroundColor: "transparent" } : null]}>
      <View style={[s.permIcon, dashed && { backgroundColor: "#efeade" }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.permCardTitle, dashed && { color: "#4a453d" }]}>{title}</Text>
        <Text style={[s.permBody, dashed && { color: C.faint }]}>{body}</Text>
      </View>
    </View>
  );
}

function CandidateRow({ c, onPress }: { c: Candidate & Partial<PickItem>; onPress: () => void }) {
  const hot = !!c.hot;
  const far = !!c.far;
  return (
    <Pressable
      disabled={far}
      onPress={onPress}
      style={[
        s.cand,
        hot && { borderWidth: 1.5, borderColor: C.brick, backgroundColor: "#f9f0e9", shadowColor: C.brick, shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
        far && { backgroundColor: "transparent", opacity: 0.5 },
      ]}
    >
      {c.distance != null && (
        <View style={[s.dist, hot ? { backgroundColor: C.brickSoft } : { backgroundColor: "#f1ede4" }]}>
          <Text style={[s.distText, { color: hot ? C.brick : C.muted }]}>{formatDistance(c.distance)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        {c.wish && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <BookmarkIcon size={12} stroke={C.brick} fill={C.brick} />
            <Text style={s.wishHead}>위시리스트에 담아둔 식당</Text>
          </View>
        )}
        <Text style={s.candName} numberOfLines={1}>{c.name}</Text>
        <Text style={s.candMeta} numberOfLines={1}>
          {c.mine ? "내 기록" : [c.category, c.address].filter(Boolean).join(" · ")}
        </Text>
        {far && <Text style={s.far}>너무 멀어 고를 수 없습니다</Text>}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  light: { flex: 1, backgroundColor: C.paper },
  closeLight: { width: 44, height: 44, marginLeft: 20, alignItems: "center", justifyContent: "center" },
  closeX: { fontSize: 17, color: C.ink },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  permTitle: { fontFamily: F.serif, fontSize: 27, lineHeight: 38, color: C.ink },
  permDesc: { marginTop: 14, fontFamily: F.sans, fontSize: 13, lineHeight: 24, color: C.muted },
  perm: {
    flexDirection: "row", gap: 14, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: C.lineSoft, backgroundColor: C.card,
  },
  permIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.brickSoft, alignItems: "center", justifyContent: "center" },
  permCardTitle: { fontFamily: F.sansBd, fontSize: 14.5, color: C.ink },
  permBody: { marginTop: 4, fontFamily: F.sans, fontSize: 12, lineHeight: 20, color: C.muted },
  dark: { borderRadius: 20, backgroundColor: C.ink, paddingVertical: 18, alignItems: "center" },
  darkText: { fontFamily: F.sansMd, fontSize: 15, color: C.card },
  ghost: { fontFamily: F.sans, fontSize: 13, color: C.faint },

  darkRoot: { flex: 1, backgroundColor: C.dark },
  roundDark: {
    position: "absolute", width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,250,246,.14)",
    alignItems: "center", justifyContent: "center",
  },
  flashTag: { position: "absolute", right: 9, bottom: 7, fontFamily: F.mono, fontSize: 9, color: C.card },
  titleBlock: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 7 },
  shootTitle: { fontFamily: F.serif, fontSize: 18, color: C.card },
  pill: { borderRadius: 14, backgroundColor: "rgba(251,250,246,.12)", paddingVertical: 5, paddingHorizontal: 12 },
  pillText: { fontFamily: F.sans, fontSize: 11, color: "rgba(251,250,246,.8)" },
  zooms: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  zoomBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(251,250,246,.14)", alignItems: "center", justifyContent: "center" },
  zoomOn: { width: 50, height: 50, borderRadius: 25, backgroundColor: "rgba(251,250,246,.26)" },
  zoomText: { fontFamily: F.mono, fontSize: 11, color: C.card },
  shootRow: { position: "absolute", left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 34 },
  gallery: { width: 46, height: 46, borderRadius: 12, backgroundColor: "rgba(251,250,246,.2)", overflow: "hidden" },
  shutterOuter: { width: 78, height: 78, borderRadius: 39, borderWidth: 3, borderColor: "rgba(251,250,246,.85)", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.card },
  flip: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(251,250,246,.1)", alignItems: "center", justifyContent: "center" },
  note: { position: "absolute", left: 0, right: 0, textAlign: "center", fontFamily: F.sans, fontSize: 11.5, color: "rgba(251,250,246,.45)" },

  h18: { fontFamily: F.serif, fontSize: 18, color: C.ink },
  thumb74: { width: 74, height: 74, borderRadius: 18 },
  pickTitle: { fontFamily: F.serif, fontSize: 20, lineHeight: 27, color: C.ink },
  pickSub: { marginTop: 2, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.muted },
  seg: { marginTop: 12, flexDirection: "row", padding: 3, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  segItem: { flex: 1, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.brick },
  segText: { fontFamily: F.sans, fontSize: 11.5, color: C.muted },
  input: {
    marginTop: 12, minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: "#ded8cb", backgroundColor: C.card,
    paddingHorizontal: 15, fontFamily: F.sans, fontSize: 13.5, color: C.ink,
  },
  cand: {
    flexDirection: "row", alignItems: "center", gap: 12, minHeight: 62, borderRadius: 20, borderWidth: 1,
    borderColor: "#ded8cb", backgroundColor: C.card, paddingVertical: 13, paddingHorizontal: 15,
  },
  dist: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  distText: { fontFamily: F.mono, fontSize: 9.5 },
  wishHead: { fontFamily: F.mono, fontSize: 10.5, color: C.brick },
  candName: { fontFamily: F.serif, fontSize: 16, color: C.ink },
  candMeta: { marginTop: 3, fontFamily: F.sans, fontSize: 11.5, color: C.faint },
  far: { marginTop: 3, fontFamily: F.sans, fontSize: 10.5, color: "#a29a8c" },
  manual: {
    marginTop: 9, minHeight: 48, borderRadius: 20, borderWidth: 1, borderStyle: "dashed", borderColor: C.line,
    alignItems: "center", justifyContent: "center",
  },
  manualText: { fontFamily: F.sans, fontSize: 12.5, color: C.muted },
  hint: { fontFamily: F.sans, fontSize: 11.5, color: C.muted, textAlign: "center" },
  notice: {
    flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: "#e4dfd3",
    backgroundColor: C.card, padding: 13,
  },
  offline: {
    flexDirection: "row", gap: 10, alignItems: "center", borderRadius: 18, borderWidth: 1, borderColor: "#e0c3b1",
    backgroundColor: "#f9f0e9", padding: 13,
  },
  noticeText: { flex: 1, fontFamily: F.sans, fontSize: 11.5, lineHeight: 18, color: C.muted },

  doneCard: { borderRadius: 30, backgroundColor: C.card, padding: 14, paddingBottom: 20 },
  donePhoto: { height: 296, borderRadius: 22, width: "100%", backgroundColor: "#ded8cb" },
  timeBadge: { position: "absolute", left: 14, top: 14, borderRadius: 14, backgroundColor: "rgba(28,26,23,.55)", paddingVertical: 4, paddingHorizontal: 10 },
  timeText: { fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, color: C.card },
  doneTitle: { marginTop: 18, textAlign: "center", fontFamily: F.serif, fontSize: 22, color: C.ink },
  doneSub: { marginTop: 7, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.muted },
  wishMet: {
    marginTop: 12, alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center", borderRadius: 14,
    borderWidth: 1, borderColor: "#e0c3b1", backgroundColor: "#f9f0e9", paddingVertical: 7, paddingHorizontal: 12,
  },
  wishMetText: { fontFamily: F.sans, fontSize: 11, color: C.brick },
  upload: {
    marginTop: 16, flexDirection: "row", gap: 11, alignItems: "center", borderRadius: 18, borderWidth: 1,
    borderColor: "#e4dfd3", backgroundColor: C.card, paddingVertical: 14, paddingHorizontal: 16,
  },
  uploadMain: { fontFamily: F.sansMd, fontSize: 12.5, color: C.ink },
  uploadSub: { fontFamily: F.sans, fontSize: 11, color: C.faint },
});
