/**
 * 기록 작성 폼 — 새 기록·기록 고치기가 같은 화면입니다.
 * 웹 `EditScreen.tsx` 그대로이고, 저장 페이로드도 한 글자도 다르지 않습니다.
 */
import { useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DateField from "@/components/DateField";
import { Chip, Eyebrow, ToggleSwitch, VerifiedMark } from "@/components/ui";
import { supabase, requireUserId } from "@/lib/supabase";
import { forwardGeocode } from "@/lib/geocode";
import { regionFromAddress } from "@/lib/regions";
import { FELT_PRICE } from "@/lib/price";
import {
  CATEGORIES,
  findMatchingWish,
  KEYWORDS,
  verifiedDateTime,
  wishMetInfo,
  WISH_AUTO_M,
  type Kind,
  type MenuItem,
  type Restaurant,
  type Wish,
} from "@/lib/types";
import { C, FONT } from "@/lib/theme";

const PIGGY = require("../../assets/piggy.png");

export type RecordFormTarget =
  | {
      mode: "new";
      kind: Kind;
      /** 지도 검색에서 고른 자리 — 이름·주소·좌표를 미리 채웁니다. */
      preset?: {
        name?: string;
        address?: string;
        lat?: number;
        lng?: number;
        category?: string;
        /** 재방문 단추로 만든 새 기록이면 true — 처음부터 재방문으로 표시합니다. */
        revisit?: boolean;
        /** 월력의 그날 화면에서 만들면 그 날짜를 방문일로 미리 채웁니다. */
        visitedAt?: string;
      };
    }
  | { mode: "edit"; record: Restaurant };

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const menuDigits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 9);

const fieldStyle = {
  marginTop: 7,
  minHeight: 46,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: C.hairline,
  backgroundColor: C.card,
  paddingHorizontal: 14,
  fontSize: 14,
  color: C.ink,
  fontFamily: FONT.sans,
} as const;

export default function RecordForm({
  target,
  rows,
  wishes,
  onCancel,
  onSaved,
}: {
  target: RecordFormTarget;
  rows: Restaurant[];
  wishes: Wish[];
  onCancel: () => void;
  onSaved: (saved: { id: number; kind: Kind }) => void;
}) {
  const insets = useSafeAreaInsets();

  const record = target.mode === "edit" ? target.record : null;
  const isNew = record === null;
  /**
   * 인증된 기록은 촬영 시각이 방문일이라 고칠 수 없습니다 — 단, verified_at
   * 마이그레이션 이전에 인증된 옛 기록처럼 시각이 없으면 그냥 날짜칸을 씁니다.
   */
  const isVerified = !isNew && record.verified && !!record.verified_at;
  const preset = target.mode === "new" ? target.preset : undefined;

  /** 새 기록일 때만 여기서 고를 수 있습니다 — 이미 있는 기록의 종류는 바꾸지 않습니다. */
  const [newKind, setNewKind] = useState<Kind>(target.mode === "new" ? target.kind : "restaurant");
  const kind: Kind = record?.kind ?? newKind;
  const categories = CATEGORIES[kind];

  const [name, setName] = useState(record?.name ?? preset?.name ?? "");
  const [address, setAddress] = useState(record?.address ?? preset?.address ?? "");
  const [visitedAt, setVisitedAt] = useState(record?.visited_at ?? preset?.visitedAt ?? today());
  const [category, setCategory] = useState(record?.category ?? preset?.category ?? "");
  const [rating, setRating] = useState(record?.rating ?? 0);
  const [priceLevel, setPriceLevel] = useState(record?.price_level ?? 0);
  const [revisit, setRevisit] = useState(record?.revisit ?? preset?.revisit ?? false);
  const [menus, setMenus] = useState<MenuItem[]>(() => {
    if (record?.menus?.length) return record.menus;
    const names = (record?.menu ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return names.length ? names.map((n) => ({ name: n, price: null })) : [{ name: "", price: null }];
  });
  const [review, setReview] = useState(record?.review ?? "");
  const [keywords, setKeywords] = useState<string[]>(record?.keywords ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const chooseKind = (k: Kind) => {
    if (k === kind) return;
    setNewKind(k);
    setCategory("");
  };

  const setMenuAt = (i: number, patch: Partial<MenuItem>) =>
    setMenus((p) => p.map((m, n) => (n === i ? { ...m, ...patch } : m)));
  const addMenu = () => setMenus((p) => [...p, { name: "", price: null }]);
  const removeMenu = (i: number) => setMenus((p) => (p.length === 1 ? p : p.filter((_, n) => n !== i)));

  const menuTotal = menus.reduce((sum, m) => sum + (m.price ?? 0), 0);
  const namedMenus = menus.filter((m) => m.name.trim() || m.price);
  const menuTotalLabel = namedMenus.length
    ? `${namedMenus.length}개 · ${menuTotal.toLocaleString("ko-KR")}원`
    : "";

  const newRecordTitle = visitedAt && visitedAt !== today() ? "이날 뭐 먹었나요" : "오늘 뭐 먹었나요";

  const ratingText = rating ? rating.toFixed(1) : "고르지 않음";
  const feltLabel = priceLevel ? FELT_PRICE[priceLevel - 1] : "고르지 않음";
  const revisitNote = revisit
    ? "다시 갈 곳으로 표시됩니다 — 지도 핀도 색이 찹니다."
    : "켜면 목록 필터와 지도 핀에 함께 반영됩니다.";

  /** 같은 이름의 가게가 이미 있으면 좌표·주소를 물려받습니다. */
  const twin = useMemo(() => {
    if (!isNew) return null;
    const needle = name.trim();
    if (!needle) return null;
    return rows.find((r) => r.name === needle && r.kind === kind) ?? null;
  }, [isNew, name, kind, rows]);

  const missing = !name.trim() ? "가게 이름을 적어주세요" : !rating ? "별점을 매겨주세요" : "";
  const canSave = !missing;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError("");

    try {
      const cleanName = name.trim();
      const cleanAddress = address.trim();

      const shared = {
        name: cleanName,
        category: category || null,
        address: cleanAddress || null,
        rating: rating || null,
        menu: menus.map((m) => m.name.trim()).filter(Boolean).join(", ") || null,
        menus: menus.filter((m) => m.name.trim()).map((m) => ({ name: m.name.trim(), price: m.price })),
        price_level: priceLevel || null,
        price_range: menuTotal || null,
        review: review.trim() || null,
        revisit,
        // 인증된 기록은 방문일이 촬영 시각 그대로라 고칠 수 없어 아예 보내지 않습니다.
        ...(isVerified ? {} : { visited_at: visitedAt || null }),
        keywords,
        updated_at: new Date().toISOString(),
      };

      if (!isNew) {
        const region = regionFromAddress(cleanAddress) || record.region;
        const { error: err } = await supabase
          .from("restaurants")
          .update({ ...shared, region, pending: false })
          .eq("id", record.id);
        if (err) throw new Error(err.message);

        onSaved({ id: record.id, kind: record.kind });
        return;
      }

      // 좌표: 같은 가게가 있으면 그 값, 검색에서 고른 자리면 그 좌표,
      // 둘 다 없으면 주소·상호로 한 번 찾아봅니다.
      let lat = twin?.lat ?? preset?.lat ?? null;
      let lng = twin?.lng ?? preset?.lng ?? null;

      if (lat == null || lng == null) {
        const hit =
          (cleanAddress ? (await forwardGeocode(cleanAddress).catch(() => []))[0] : null) ??
          (await forwardGeocode(cleanName).catch(() => []))[0] ??
          null;
        if (hit) {
          lat = hit.lat;
          lng = hit.lng;
        }
      }

      const finalAddress = cleanAddress || twin?.address || null;
      const finalRegion = twin?.region || regionFromAddress(finalAddress ?? "") || null;

      // 짝지어진 위시가 있으면 이 기록은 그 위시가 이루어진 것입니다(WISH MET).
      // 좌표가 있으면 거리로, 없으면 이름으로 — 촬영 인증 흐름과 같은 함수입니다.
      const matchedWish = findMatchingWish(wishes, { name: cleanName, lat, lng }, WISH_AUTO_M);
      const fromWish = matchedWish ? wishMetInfo(matchedWish, visitedAt || today()) : null;

      const userId = await requireUserId();

      const { data, error: err } = await supabase
        .from("restaurants")
        .insert({
          user_id: userId,
          kind,
          region: finalRegion,
          place_key: `${cleanName}|${finalAddress ?? ""}`.toLowerCase(),
          lat,
          lng,
          verified: false,
          acc: null,
          ...shared,
          address: finalAddress,
          // 같은 이름의 가게가 이미 있으면 그 자체로 재방문입니다.
          revisit: revisit || Boolean(twin),
          from_wish: fromWish,
        })
        .select("id")
        .single();

      if (err) throw new Error(err.message);

      if (matchedWish) await supabase.from("wishes").delete().eq("id", matchedWish.id);

      onSaved({ id: data.id as number, kind });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다");
      setSaving(false);
    }
  }

  const saveLabel = canSave ? (saving ? "저장 중…" : "기록 저장") : missing;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.paper }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          borderBottomWidth: 1,
          borderBottomColor: "#e6e0d3",
          paddingHorizontal: 14,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
        }}
      >
        <Pressable onPress={onCancel} hitSlop={8} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 13, color: C.faint, fontFamily: FONT.sans }}>취소</Text>
        </Pressable>

        <Text style={{ fontFamily: FONT.mono, fontSize: 10.5, letterSpacing: 1.7, color: C.faint }}>
          {isNew ? "NEW RECORD" : "EDIT RECORD"}
        </Text>

        <Pressable
          onPress={save}
          disabled={!canSave || saving}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}
        >
          <Text style={{ fontSize: 13, color: canSave ? C.brick : "#c4bcae", fontFamily: FONT.sansMedium }}>저장</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 20, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontFamily: FONT.serifBold, fontSize: 25, color: C.ink }}>
          {isNew ? newRecordTitle : "기록 고치기"}
        </Text>

        {isNew && !preset?.revisit && (
          <View style={{ marginTop: 18, gap: 9 }}>
            <Eyebrow>맛집 · 카페</Eyebrow>
            <View style={{ flexDirection: "row", gap: 7 }}>
              {(["restaurant", "cafe"] as Kind[]).map((k) => (
                <Chip key={k} label={k === "restaurant" ? "맛집" : "카페"} active={kind === k} onPress={() => chooseKind(k)} />
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 18 }}>
          <Eyebrow>가게</Eyebrow>
          <TextInput value={name} onChangeText={setName} placeholder="가게 이름" placeholderTextColor={C.placeholder} style={fieldStyle} />
        </View>

        <View style={{ marginTop: 14 }}>
          <Eyebrow>자리</Eyebrow>
          <TextInput value={address} onChangeText={setAddress} placeholder="주소나 동네" placeholderTextColor={C.placeholder} style={fieldStyle} />
        </View>

        {isVerified ? (
          <View style={{ marginTop: 14 }}>
            <Eyebrow>방문</Eyebrow>
            <View
              style={{
                marginTop: 7,
                minHeight: 48,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#e0c3b1",
                backgroundColor: "#f9efe8",
                paddingHorizontal: 15,
              }}
            >
              <VerifiedMark size={20} />
              <Text style={{ fontFamily: FONT.mono, fontSize: 13.5, color: C.ink }}>
                {verifiedDateTime(record.verified_at!)}
              </Text>
            </View>
            <Text style={{ marginTop: 6, fontSize: 11.5, color: C.faint, fontFamily: FONT.sans }}>
              사진을 찍은 시각이 그대로 찍혀 고칠 수 없습니다.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 14 }}>
            <Eyebrow>방문</Eyebrow>
            <DateField value={visitedAt} onChange={setVisitedAt} style={{ marginTop: 7, minHeight: 46, borderRadius: 14 }} />
          </View>
        )}

        <View style={{ marginTop: 18, gap: 9 }}>
          <Eyebrow>종류</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {categories.map((c) => (
              <Chip key={c} label={c} active={category === c} onPress={() => setCategory((p) => (p === c ? "" : c))} />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 20, gap: 9 }}>
          <Eyebrow>별점</Eyebrow>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flexDirection: "row" }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const pct = rating >= n ? "100%" : rating >= n - 0.5 ? "50%" : "0%";
                return (
                  <View key={n} style={{ width: 34, height: 34 }}>
                    <Text style={{ position: "absolute", fontSize: 27, lineHeight: 34, color: "#dcd6ca" }}>★</Text>
                    <View style={{ position: "absolute", width: pct, overflow: "hidden" }}>
                      <Text style={{ fontSize: 27, lineHeight: 34, color: C.brick }}>★</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="반 별"
                      onPress={() => setRating((r) => (r === n - 0.5 ? 0 : n - 0.5))}
                      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 17 }}
                    />
                    <Pressable
                      accessibilityLabel="한 별"
                      onPress={() => setRating((r) => (r === n ? 0 : n))}
                      style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 17 }}
                    />
                  </View>
                );
              })}
            </View>
            <Text style={{ fontFamily: FONT.mono, fontSize: 12, color: C.muted }}>{ratingText}</Text>
          </View>
        </View>

        <View style={{ marginTop: 20, gap: 9 }}>
          <Eyebrow>체감 가격</Eyebrow>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setPriceLevel((p) => (p === n ? 0 : n))}
                  accessibilityLabel={`가격 ${n}`}
                  style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center" }}
                >
                  <Image source={PIGGY} style={{ width: 22, height: 21, opacity: n <= priceLevel ? 1 : 0.3 }} resizeMode="contain" />
                </Pressable>
              ))}
            </View>
            <Text style={{ fontSize: 12, color: C.muted, fontFamily: FONT.sans }}>{feltLabel}</Text>
          </View>
        </View>

        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "#e2c9bb",
            backgroundColor: "#f9f0e9",
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, color: C.ink, fontFamily: FONT.sansMedium }}>재방문 의사</Text>
            <Text style={{ marginTop: 4, fontSize: 11.5, lineHeight: 18, color: C.muted, fontFamily: FONT.sans }}>
              {revisitNote}
            </Text>
          </View>
          <ToggleSwitch checked={revisit} onChange={() => setRevisit((v) => !v)} label="재방문 의사" />
        </View>

        <View style={{ marginTop: 18, gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <Eyebrow>메뉴</Eyebrow>
            <Text style={{ fontFamily: FONT.mono, fontSize: 11, color: C.faint }}>{menuTotalLabel}</Text>
          </View>

          {menus.map((m, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TextInput
                value={m.name}
                onChangeText={(v) => setMenuAt(i, { name: v })}
                placeholder="먹은 것"
                placeholderTextColor={C.placeholder}
                style={[fieldStyle, { flex: 1, marginTop: 0 }]}
              />
              <View style={{ width: 96, justifyContent: "center" }}>
                <TextInput
                  value={m.price == null ? "" : m.price.toLocaleString("ko-KR")}
                  onChangeText={(v) => {
                    const raw = menuDigits(v);
                    setMenuAt(i, { price: raw ? Number(raw) : null });
                  }}
                  inputMode="numeric"
                  placeholder="0"
                  placeholderTextColor={C.placeholder}
                  style={[
                    fieldStyle,
                    { marginTop: 0, textAlign: "right", paddingRight: 26, paddingLeft: 11, fontFamily: FONT.mono, fontSize: 13 },
                  ]}
                />
                <Text style={{ position: "absolute", right: 11, fontSize: 12, color: C.dim }}>원</Text>
              </View>
              {menus.length > 1 && (
                <Pressable onPress={() => removeMenu(i)} accessibilityLabel="이 메뉴 지우기" hitSlop={6} style={{ width: 34, height: 46, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 15, color: C.dim }}>✕</Text>
                </Pressable>
              )}
            </View>
          ))}

          <Pressable
            onPress={addMenu}
            style={{
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "#cdc6b8",
            }}
          >
            <Text style={{ fontSize: 13, color: C.muted, fontFamily: FONT.sans }}>+ 메뉴 추가</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 14 }}>
          <Eyebrow>메모</Eyebrow>
          <TextInput
            value={review}
            onChangeText={setReview}
            multiline
            numberOfLines={5}
            placeholder="그날 자리, 맛, 다시 올 이유"
            placeholderTextColor={C.placeholder}
            style={[
              fieldStyle,
              {
                minHeight: 130,
                paddingVertical: 12,
                textAlignVertical: "top",
                fontFamily: FONT.serif,
                fontSize: 14.5,
                lineHeight: 26,
                color: "#2e2a25",
              },
            ]}
          />
        </View>

        <View style={{ marginTop: 18, gap: 9 }}>
          <Eyebrow>키워드</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {KEYWORDS.map((k) => (
              <Chip
                key={k}
                label={k}
                active={keywords.includes(k)}
                onPress={() => setKeywords((p) => (p.includes(k) ? p.filter((v) => v !== k) : [...p, k]))}
              />
            ))}
          </View>
        </View>

        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderRadius: 18,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: C.line,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Text style={{ flex: 1, fontSize: 11.5, lineHeight: 18, color: C.faint, fontFamily: FONT.sans }}>
            사진은 그 자리에서 찍으면 인증 도장이 함께 붙습니다.
          </Text>
        </View>

        {error.length > 0 && (
          <Text style={{ marginTop: 14, fontSize: 12.5, color: "#a8412a", fontFamily: FONT.sans }}>{error}</Text>
        )}

        <Pressable
          onPress={save}
          disabled={!canSave || saving}
          style={{
            marginTop: 22,
            borderRadius: 20,
            padding: 16,
            alignItems: "center",
            backgroundColor: canSave ? C.ink : "#e4dfd3",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 14.5, color: canSave ? C.card : C.faint, fontFamily: FONT.sansMedium }}>
            {saveLabel}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
