import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ShareIcon } from "./icons";
import { BottomSheetModal, Button, Eyebrow, Toggle } from "./ui";
import { feltLevel } from "@/lib/price";
import { buildShareText } from "@/lib/share";
import type { Restaurant } from "@/lib/types";
import { C, F } from "@/theme";

/** 기록 줄에 붙는 작은 공유 단추(30×30). 줄 전체를 누른 것으로 넘어가지 않습니다. */
export const ShareButton = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    hitSlop={8}
    accessibilityLabel="기록 공유"
    style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: "#e4dfd3", alignItems: "center", justifyContent: "center" }}
  >
    <ShareIcon size={14} stroke={C.muted} />
  </Pressable>
);

function ScopeRow({
  title, sub, right, dim, last,
}: { title: string; sub: string; right: React.ReactNode; dim?: boolean; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 15,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: "#ece7dc", opacity: dim ? 0.45 : 1,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{title}</Text>
        <Text style={{ marginTop: 2, fontFamily: F.sans, fontSize: 11, color: C.faint }}>{sub}</Text>
      </View>
      {right}
    </View>
  );
}

/** 기록 한 건 공유 — 어디까지 보낼지 고르고 기본 공유창으로 보냅니다. 글은 buildShareText 하나에서 나옵니다. */
export function ShareSheet({ record, visible, onClose }: { record: Restaurant; visible: boolean; onClose: () => void }) {
  const [rate, setRate] = useState(false);
  const [memo, setMemo] = useState(false);
  const { height } = useWindowDimensions();

  // 열 때마다 ②③ 은 꺼진 상태에서 시작합니다.
  useEffect(() => {
    if (visible) {
      setRate(false);
      setMemo(false);
    }
  }, [visible]);

  const level = feltLevel(record);
  const hasRate = record.rating != null || level > 0;
  const hasMemo = !!record.review?.trim();
  const rateSub = hasRate
    ? [record.rating != null ? `★ ${record.rating}` : null, level ? `돼지 ${level}마리` : null].filter(Boolean).join(" · ")
    : "이 기록에는 없습니다";
  const memoSub = !hasMemo ? "이 기록에는 없습니다" : rate ? "메모 전체를 함께 보냅니다" : "별점·체감 가격을 켜야 고를 수 있어요";

  const message = buildShareText(record, { rate, memo });

  const toggleRate = (v: boolean) => {
    setRate(v);
    if (!v) setMemo(false);
  };

  async function send() {
    try {
      const res = await Share.share({ message });
      if (res.action === Share.sharedAction) onClose();
    } catch {
      // 공유창이 열리지 않으면 시트를 그대로 둡니다.
    }
  }

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: height * 0.78 }} showsVerticalScrollIndicator={false}>
        <Eyebrow wide>기록 공유</Eyebrow>
        <Text style={{ marginTop: 6, fontFamily: F.serif, fontSize: 22, color: C.ink }}>{record.name}</Text>
        <Text style={{ marginTop: 4, fontFamily: F.sans, fontSize: 11.5, color: C.faint }}>
          어디까지 보낼지 고르세요. 아래로 갈수록 더 많이 보입니다.
        </Text>

        <View style={{ marginTop: 14, borderWidth: 1, borderColor: "#ded8cb", borderRadius: 18, backgroundColor: C.card, overflow: "hidden" }}>
          <ScopeRow
            title="가게 · 위치 · 메뉴"
            sub="항상 함께 갑니다"
            right={
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.brickSoft, alignItems: "center", justifyContent: "center" }}>
                <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={C.brick} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M5 12.5l4.5 4.5L19 7.5" />
                </Svg>
              </View>
            }
          />
          <ScopeRow
            title="별점 · 체감 가격"
            sub={rateSub}
            dim={!hasRate}
            right={<Toggle value={rate} onChange={toggleRate} disabled={!hasRate} label="별점 · 체감 가격" />}
          />
          <ScopeRow
            title="내가 쓴 기록"
            sub={memoSub}
            dim={!rate || !hasMemo}
            last
            right={<Toggle value={memo} onChange={setMemo} disabled={!rate || !hasMemo} label="내가 쓴 기록" />}
          />
        </View>

        <View style={{ marginTop: 16 }}>
          <Eyebrow>미리보기</Eyebrow>
        </View>
        <View style={{ marginTop: 7, borderRadius: 16, borderWidth: 1, borderColor: "#e4dfd3", backgroundColor: "#ffffff", paddingVertical: 13, paddingHorizontal: 15 }}>
          <Text selectable style={{ fontFamily: F.sans, fontSize: 12.5, lineHeight: 12.5 * 1.65, color: "#2e2a25" }}>{message}</Text>
        </View>

        <View style={{ marginTop: 14, flexDirection: "row", gap: 8 }}>
          <Button kind="dark" label="보내기" onPress={send} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
}
