import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F, SHADOW } from "@/theme";
import { useAppNotice } from "./api";

const KEY = "notice.dismissed";

/**
 * 앱 전체 공지(app_notices) — 앱을 열 때 기간 안의 최신 공지 하나를 상단 배너로. 닫으면 그 id 를 기기에 기억합니다.
 * 누르면 내용을 펼칩니다. TODO(푸시): 공지 푸시 알림은 이번 범위 밖입니다.
 */
export function NoticeBanner({ enabled }: { enabled: boolean }) {
  const insets = useSafeAreaInsets();
  const { data: notice } = useAppNotice(enabled);
  const [dismissed, setDismissed] = useState<number | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => setDismissed(v ? Number(v) : null)).catch(() => setDismissed(null));
  }, []);

  if (!enabled || !notice || dismissed === undefined || dismissed === notice.id) return null;

  const close = () => {
    setDismissed(notice.id);
    AsyncStorage.setItem(KEY, String(notice.id)).catch(() => {});
  };

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 6, left: 12, right: 12 }}>
      <Pressable
        onPress={() => notice.body && setOpen((v) => !v)}
        style={[{ borderRadius: 16, backgroundColor: C.ink, paddingVertical: 11, paddingLeft: 14, paddingRight: 8, gap: 6 }, SHADOW.card]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ borderRadius: 7, backgroundColor: C.brick, paddingHorizontal: 6, paddingVertical: 1, fontFamily: F.sansBd, fontSize: 10, color: C.card, overflow: "hidden" }}>공지</Text>
          <Text numberOfLines={open ? undefined : 1} style={{ flex: 1, fontFamily: F.sansMd, fontSize: 12.5, color: C.card }}>{notice.title}</Text>
          <Pressable onPress={close} hitSlop={10} accessibilityLabel="공지 닫기" style={{ paddingHorizontal: 6 }}>
            <Text style={{ fontFamily: F.sans, fontSize: 14, color: "#a8a196" }}>✕</Text>
          </Pressable>
        </View>
        {open && !!notice.body && <Text style={{ fontFamily: F.sans, fontSize: 12, lineHeight: 19, color: "#d8d2c6", paddingRight: 8 }}>{notice.body}</Text>}
        {!open && !!notice.body && <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: "#8a8377" }}>눌러서 펼치기 · DINARY 운영</Text>}
      </Pressable>
    </View>
  );
}
