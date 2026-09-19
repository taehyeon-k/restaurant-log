/**
 * 알림 · 지오펜스(§7) — 담아둔 위시 50m 안에 들어오면 알립니다.
 * 누르면 `/capture?verifyWishId=…` 로 바로 카메라가 열립니다.
 *
 * iOS 는 상시 위치 대신 Region Monitoring 을 씁니다 — 배터리도 심사도 유리하지만
 * **동시 감시 20개 제한**이 있어, 좌표 있는 위시 중 가까운 20개만 등록하고
 * 앱 실행·위치 변화 때 갱신합니다.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { WISH_NEAR_M, type Wish } from "@/lib/types";

export const GEOFENCE_TASK = "dinary-wish-geofence";
/** iOS 가 한 번에 감시할 수 있는 구역 수. */
const MAX_REGIONS = 20;
const NAMES_KEY = "dinary:wish-names";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** 배경 작업은 React 상태를 볼 수 없으므로 id→이름을 따로 남겨 둡니다. */
async function rememberNames(wishes: Wish[]) {
  const map: Record<string, string> = {};
  for (const w of wishes) map[w.id] = w.name;
  await AsyncStorage.setItem(NAMES_KEY, JSON.stringify(map));
}

async function nameOf(id: string) {
  const raw = await AsyncStorage.getItem(NAMES_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as Record<string, string>)[id] ?? null;
  } catch {
    return null;
  }
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.error("지오펜스 작업 실패:", error.message);
    return;
  }
  const { eventType, region } = (data ?? {}) as {
    eventType?: Location.GeofencingEventType;
    region?: Location.LocationRegion;
  };
  if (eventType !== Location.GeofencingEventType.Enter || !region?.identifier) return;

  const name = (await nameOf(region.identifier)) ?? "담아둔 곳";

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${name} 근처입니다`,
      body: "담아둔 곳이에요. 지금 들러 인증을 남겨 보시겠어요?",
      data: { wishId: region.identifier },
    },
    trigger: null,
  });
});

const metersBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/**
 * 알림 권한 — **첫 위시를 저장하는 순간**에만 묻습니다. 앱 첫 실행이 아닙니다(§7).
 * 이미 정해진 답이 있으면 다시 묻지 않습니다.
 */
export async function ensureNotificationPermission() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();

  if (Platform.OS === "android" && asked.granted) {
    await Notifications.setNotificationChannelAsync("wish-nearby", {
      name: "담아둔 곳 근처",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#b4552d",
    });
  }

  return asked.granted;
}

/**
 * 배경 위치 권한 — 안드로이드는 전경 권한과 **분리된 두 번째 요청**이어야 합니다.
 * 거부되면 지오펜스는 세우지 않고 조용히 물러납니다(앱을 켠 동안만 확인).
 */
export async function ensureBackgroundLocation() {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (!asked.granted) return false;
  }

  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.granted) return true;
  if (!bg.canAskAgain) return false;

  return (await Location.requestBackgroundPermissionsAsync()).granted;
}

/**
 * 알림을 켜 둔 위시의 자리를 감시합니다. 앱 실행·위시 변화 때마다 부르면 됩니다 —
 * 매번 통째로 다시 세우므로 지운 위시가 남아 울리는 일이 없습니다.
 */
export async function syncWishGeofences(wishes: Wish[], from?: { lat: number; lng: number } | null) {
  const watchable = wishes.filter(
    (w): w is Wish & { lat: number; lng: number } =>
      w.notify && w.lat != null && w.lng != null
  );

  await rememberNames(watchable);

  const running = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);

  if (!watchable.length) {
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {});
    return 0;
  }

  const granted = await Location.getBackgroundPermissionsAsync();
  if (!granted.granted) return 0;

  // 20개 제한 — 지금 위치를 알면 가까운 순, 모르면 담은 순으로 자릅니다.
  const ordered = from
    ? [...watchable].sort(
        (a, b) =>
          metersBetween(from.lat, from.lng, a.lat, a.lng) -
          metersBetween(from.lat, from.lng, b.lat, b.lng)
      )
    : watchable;

  const regions: Location.LocationRegion[] = ordered.slice(0, MAX_REGIONS).map((w) => ({
    identifier: w.id,
    latitude: w.lat,
    longitude: w.lng,
    radius: WISH_NEAR_M,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  return regions.length;
}

/** 지금 위치를 한 번 읽습니다 — 지오펜스 20개를 고를 때만 씁니다. 실패해도 괜찮습니다. */
export async function currentPositionOrNull() {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return null;
    const p = await Location.getLastKnownPositionAsync();
    if (!p) return null;
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch {
    return null;
  }
}
