import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { C, FONT } from "@/lib/theme";

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * "YYYY-MM-DD" 를 다루는 날짜 칸 — 웹의 `<input type="date">` 자리입니다.
 * 값은 언제나 문자열로 오가므로, 저장 페이로드는 웹과 완전히 같습니다.
 */
export default function DateField({
  value,
  onChange,
  placeholder = "날짜 고르기",
  minimumDate,
  style,
  allowClear = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  style?: object;
  allowClear?: boolean;
}) {
  const [open, setOpen] = useState(false);

  // 문자열을 로컬 자정으로 읽습니다 — 시간대 때문에 하루가 밀리지 않게.
  const asDate = value ? new Date(`${value}T00:00:00`) : new Date();

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          {
            minHeight: 48,
            justifyContent: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderColor: C.hairline,
            backgroundColor: C.card,
            paddingHorizontal: 15,
          },
          style,
        ]}
      >
        <Text style={{ fontFamily: FONT.mono, fontSize: 13, color: value ? C.ink : C.placeholder }}>
          {value ? value.replaceAll("-", ".") : placeholder}
        </Text>
      </Pressable>

      {allowClear && value.length > 0 && (
        <Pressable onPress={() => onChange("")} hitSlop={8} style={{ marginTop: 6, alignSelf: "flex-start" }}>
          <Text style={{ fontSize: 11, color: C.faint, fontFamily: FONT.sans }}>날짜 비우기</Text>
        </Pressable>
      )}

      {open && (
        <DateTimePicker
          value={asDate}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={minimumDate}
          onChange={(event, next) => {
            // 안드로이드는 고르거나 닫는 순간 한 번만 옵니다.
            if (Platform.OS === "android") setOpen(false);
            if (event.type === "dismissed" || !next) return;
            onChange(toKey(next));
            if (Platform.OS === "ios") setOpen(false);
          }}
        />
      )}
    </View>
  );
}
