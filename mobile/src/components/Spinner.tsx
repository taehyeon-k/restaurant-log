import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { C } from "@/lib/theme";

/** 30×30 회전 고리 — 테두리 2px, 위쪽만 벽돌색(§4.2 단계 04). */
export default function Spinner({ size = 30, thickness = 2 }: { size?: number; thickness?: number }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: C.lineSoft,
          borderTopColor: C.brick,
          transform: [
            { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) },
          ],
        }}
      />
    </View>
  );
}
