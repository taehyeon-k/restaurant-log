// Claude Design 미리보기에서 브라우저가 못 하는 일(위치·카메라·알림·SQLite·네트워크)을 "빈 성공"으로 막는 대용 모듈들.
// 키가 import 경로이고, 값은 번들에 그대로 들어가는 ES 모듈 소스입니다. build-dist.mjs 의 플러그인이 읽습니다.
const asyncNoop = "async () => undefined";
const granted = "{ granted: true, status: 'granted', canAskAgain: true }";
const place = (name, address, lat, lng, extra = "") => `{ name: ${JSON.stringify(name)}, address: ${JSON.stringify(address)}, lat: ${lat}, lng: ${lng}${extra} }`;

export const SAMPLE_PLACES = [
  place("을지면옥", "서울 중구 을지로3가 230-1", 37.5662, 126.9921, ", category: '한식', distance: 120"),
  place("카페 레이어드", "서울 종로구 수송동 146-1", 37.5726, 126.9803, ", category: '커피', distance: 260"),
  place("스시 마루", "서울 용산구 이태원동 34-5", 37.5347, 126.9945, ", category: '일식', distance: 410"),
];

export const stubs = {
  "expo-linking": `export const createURL = (p = '') => 'dinary://' + p; export const openSettings = ${asyncNoop}; export const openURL = ${asyncNoop}; export const useLinkingURL = () => null;`,
  "expo-web-browser": `export const maybeCompleteAuthSession = () => ({ type: 'failed' }); export const openAuthSessionAsync = async () => ({ type: 'cancel' }); export const openBrowserAsync = ${asyncNoop};`,
  "expo-location": `
    export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };
    export const GeofencingEventType = { Enter: 1, Exit: 2 };
    export const getForegroundPermissionsAsync = async () => (${granted});
    export const requestForegroundPermissionsAsync = async () => (${granted});
    export const getBackgroundPermissionsAsync = async () => (${granted});
    export const requestBackgroundPermissionsAsync = async () => (${granted});
    export const getCurrentPositionAsync = async () => ({ coords: { latitude: 37.5662, longitude: 126.9921, accuracy: 14 }, timestamp: Date.now() });
    export const getLastKnownPositionAsync = getCurrentPositionAsync;
    export const hasStartedGeofencingAsync = async () => false;
    export const startGeofencingAsync = ${asyncNoop};
    export const stopGeofencingAsync = ${asyncNoop};
    export const useForegroundPermissions = () => [${granted}, async () => (${granted})];`,
  "expo-image-picker": `export const launchImageLibraryAsync = async () => ({ canceled: true, assets: null });`,
  "@react-native-community/datetimepicker": `import * as React from 'react'; import { View } from 'react-native'; export default function DateTimePicker() { return React.createElement(View, { style: { height: 0 } }); }`,
  "@react-native-community/netinfo": `const state = { isConnected: true, isInternetReachable: true }; export default { fetch: async () => state, addEventListener: () => () => {} }; export const useNetInfo = () => state;`,
  "expo-notifications": `export const getPermissionsAsync = async () => (${granted}); export const requestPermissionsAsync = async () => (${granted}); export const scheduleNotificationAsync = async () => 'preview'; export const setNotificationHandler = () => {}; export const useLastNotificationResponse = () => null;`,
  "expo-task-manager": `export const defineTask = () => {};`,
  "expo-sqlite": `
    const db = { execAsync: ${asyncNoop}, runAsync: async () => ({ lastInsertRowId: 1, changes: 1 }), getAllAsync: async () => [], getFirstAsync: async () => null };
    export const openDatabaseAsync = async () => db; export class SQLiteDatabase {}`,
  "expo-image-manipulator": `export const manipulateAsync = async (uri) => ({ uri, width: 1080, height: 1080 }); export const SaveFormat = { JPEG: 'jpeg', PNG: 'png' };`,
  "expo-camera": `
    import * as React from 'react'; import { View } from 'react-native';
    export const CameraView = React.forwardRef(function CameraView({ children, style }, ref) {
      React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: '' }) }), []);
      return React.createElement(View, { style: [{ backgroundColor: '#2b2824' }, style] }, children);
    });
    export const useCameraPermissions = () => [${granted}, async () => (${granted})];`,
  "expo-file-system": `export class File { constructor(...a) { this.uri = a.join('/'); } copy() {} delete() {} get exists() { return true; } } export const Paths = { document: 'file:///preview', cache: 'file:///preview' };`,
  "expo-haptics": `export const impactAsync = ${asyncNoop}; export const selectionAsync = ${asyncNoop}; export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium' };`,
  "react-native-gesture-handler": `import * as React from 'react'; import { View } from 'react-native'; export const GestureHandlerRootView = ({ children, style }) => React.createElement(View, { style }, children);`,

  // 앱 자체의 기기 의존 모듈
  "@/features/queue/process": `export const onQueueChange = () => () => {}; export const notifyQueue = () => {}; export const drainQueue = async () => 0; export const startQueueTriggers = () => () => {};`,
  "@/features/queue/db": `export const db = () => ({}); export const persistPhoto = (uri) => uri; export const removePhoto = () => {}; export const enqueue = ${asyncNoop}; export const listQueue = async () => []; export const removeFromQueue = ${asyncNoop}; export const resetFailed = ${asyncNoop};`,
  // 보관함이 「올리는 중 / 올리지 못함」을 보여주도록 사진 한 장씩의 대기열 두 줄을 돌려줍니다(배열이어야 합니다).
  "@/features/queue/useQueue": `
    const swatch = (a, b) => 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/></svg>');
    const rows = [
      { id: 1, payload: JSON.stringify({ name: '성수 베이글 맛집' }), photo_uri: swatch('#f3e2bb', '#a8853f'), wish_id: null, attempts: 1, failed: 0, next_at: 0, created_at: 0 },
      { id: 2, payload: JSON.stringify({ name: '한남 와인바' }), photo_uri: swatch('#e3b99a', '#9a4a52'), wish_id: null, attempts: 3, failed: 1, next_at: 0, created_at: 0 },
    ];
    export const useQueue = () => rows;`,
  "@/features/notify/geofence": `export const askWishPermissions = async () => true; export const syncWishGeofences = ${asyncNoop};`,
  "@/lib/api": `export const apiFetch = async () => ({ ok: true, status: 200, json: async () => ({}) });`,
  "@/lib/photos": `export const uploadPhoto = async (uri) => uri;`,
  "@/lib/geocode": `
    const P = [${SAMPLE_PLACES.join(", ")}];
    export const forwardGeocode = async () => P;
    export const reverseGeocode = async () => P[0];
    export const searchFoodPlaces = async () => P;
    export const nearbyPlaces = async () => P;`,
};
