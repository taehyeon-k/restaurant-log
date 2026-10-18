import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SearchLineIcon } from "@/components/icons";
import { useGallerySearch, useGalleryTopMenus, type GalleryScope } from "@/features/community/api";
import { StaffAvatar } from "@/features/community/BoardPost";
import { useOpenProfile } from "@/features/community/ProfileSheet";
import { Avatar, FilterChips, K, metaLine, PhotoOrStripes, shortAddr, titleName } from "@/features/community/ui";
import { SignedImage } from "@/lib/signedPhoto";
import { C, F } from "@/theme";

const DEBOUNCE_MS = 300;

/** 갤러리 검색(HANDOFF-gallery 04) — 메뉴 · 가게 · 동네 · 사람. 공백 · 대소문자는 가리지 않습니다. */
export default function GallerySearch() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openProfile = useOpenProfile();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<GalleryScope>("all");
  const { data: top = [] } = useGalleryTopMenus();
  const { data: res, isFetching } = useGallerySearch(q, scope);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);

  const searched = !!q && !!res;
  const empty = searched && !res.menu.length && !res.places.length && !res.areas.length && !res.people.length;
  const card = Math.floor((width - 40 - 16) / 3);
  const placeCount = res ? new Set(res.menu.map((m) => m.place)).size : 0;

  const section = (title: string, right?: React.ReactNode) => (
    <View style={{ marginTop: 22, marginBottom: 10, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.4, color: C.faint }}>{title}</Text>
      {right}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, height: 42, borderRadius: 21, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 7 }}>
          <SearchLineIcon />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="메뉴 · 가게 · 동네 · 사람"
            placeholderTextColor={K.inactive}
            returnKeyType="search"
            onSubmitEditing={() => setQ(text.trim())}
            style={{ flex: 1, paddingVertical: 0, fontFamily: F.sans, fontSize: 13.5, color: C.ink }}
          />
          {!!text && (
            <Pressable onPress={() => { setText(""); setQ(""); }} hitSlop={8} accessibilityLabel="지우기">
              <Text style={{ fontFamily: F.sans, fontSize: 13, color: K.inactive }}>✕</Text>
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => router.back()} hitSlop={8}><Text style={{ fontFamily: F.sans, fontSize: 13, color: C.muted }}>취소</Text></Pressable>
      </View>
      <FilterChips<GalleryScope>
        value={scope}
        onChange={setScope}
        options={[{ id: "all", label: "전체" }, { id: "menu", label: "메뉴" }, { id: "place", label: "가게" }, { id: "area", label: "동네" }, { id: "person", label: "사람" }]}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!q && (
          <>
            {section("요즘 많이 찾는 메뉴")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {top.length === 0 && <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.faint }}>아직 모인 메뉴가 없습니다.</Text>}
              {top.map((m) => (
                <Pressable key={m} onPress={() => { setText(m); setQ(m); }} style={{ height: 32, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: K.dashed, paddingHorizontal: 13, justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.sans, fontSize: 12, color: C.muted }}>{m}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {empty && <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: F.sans, fontSize: 12.5, color: C.faint }}>「{q}」에 맞는 사진이 없습니다.</Text>}
        {!!q && !res && isFetching && <Text style={{ paddingVertical: 40, textAlign: "center", fontFamily: F.sans, fontSize: 12, color: C.faint }}>찾는 중…</Text>}

        {/* 메뉴 · 검색어 — 3칸 카드 */}
        {searched && res.menu.length > 0 && (
          <>
            {section(`메뉴 · ${q}`, (
              <Pressable onPress={() => router.push({ pathname: "/community/gallery/list", params: { menu: q, title: q } })} hitSlop={6}>
                <Text style={{ fontFamily: F.sans, fontSize: 11.5, color: C.brick }}>사진 {res.menu.length} · 가게 {placeCount} ›</Text>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(scope === "menu" ? res.menu : res.menu.slice(0, 6)).map((p) => (
                <Pressable key={p.id} onPress={() => router.push({ pathname: "/community/gallery/[id]", params: { id: String(p.id) } })} style={{ width: card, gap: 4 }}>
                  <View style={{ width: card, height: card, borderRadius: 10, overflow: "hidden", backgroundColor: K.stripe }}>
                    <SignedImage uri={p.photo_ref} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  </View>
                  <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 12, color: C.ink }}>{p.place_name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 9.5, color: C.faint }}>♥ {p.like_count}{p.area ? ` · ${p.area.split(" ").slice(-1)[0]}` : ""}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* 가게 */}
        {searched && res.places.length > 0 && (
          <>
            {section("가게")}
            {res.places.map((pl) => (
              <Pressable
                key={pl.place}
                onPress={() => router.push({ pathname: "/community/gallery/list", params: { place: pl.place, title: pl.name } })}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}
              >
                <PhotoOrStripes uri={pl.cover_ref} width={40} height={40} radius={9} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.serif, fontSize: 14, color: C.ink }}>{pl.name}</Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>{metaLine(pl.category, (pl.area ?? shortAddr(pl.address, null)).split(" ").slice(1).join(" "))}</Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>사진 {pl.photo_count}</Text>
              </Pressable>
            ))}
          </>
        )}

        {/* 동네 */}
        {searched && res.areas.length > 0 && (
          <>
            {section("동네")}
            {res.areas.map((a) => (
              <Pressable
                key={a.area}
                onPress={() => router.push({ pathname: "/community/gallery/list", params: { area: a.area, title: a.area } })}
                style={{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}
              >
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.sans, fontSize: 13, color: C.ink }}>{a.area}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.muted }}>사진 {a.photo_count} ›</Text>
              </Pressable>
            ))}
          </>
        )}

        {/* 사람 — 누르면 프로필 창 */}
        {searched && res.people.length > 0 && (
          <>
            {section("사람")}
            {res.people.map((p) => {
              const title = titleName(p.title_label_id);
              return (
                <Pressable key={p.id} onPress={() => openProfile(p.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
                  {p.role === "admin" ? <StaffAvatar size={36} /> : <Avatar name={p.nickname} url={p.avatar_url} size={36} seed={p.id} />}
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.sansMd, fontSize: 13.5, color: C.ink }}>{p.role === "admin" ? "DINARY 운영" : p.nickname}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: F.sans, fontSize: 11, color: C.faint }}>사진 {p.photo_count}{title ? ` · ${title}` : ""}</Text>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}
