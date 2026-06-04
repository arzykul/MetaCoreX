import React, { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";

interface Props {
  value: number | null;
  targetMin: number;
  targetMax: number;
  size?: number;
}

export function GlucoseGauge({ value, targetMin, targetMax, size = 180 }: Props) {
  const colors = useColors();
  const scale = useSharedValue(0.85);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 12, stiffness: 120 });
  }, [value]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const getStatus = () => {
    if (value === null) return { color: colors.mutedForeground, label: "—" };
    if (value < 3.9) return { color: colors.glucoseLow, label: "Низкий" };
    if (value >= targetMin && value <= targetMax) return { color: colors.glucoseNormal, label: "В норме" };
    if (value > targetMax && value <= 13.9) return { color: colors.glucoseHigh, label: "Высокий" };
    return { color: colors.glucoseDanger, label: "Опасно" };
  };

  const status = getStatus();

  return (
    <Animated.View style={[styles.container, animStyle, { width: size, height: size }]}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.card,
            borderColor: status.color,
            shadowColor: status.color,
          },
        ]}
      >
        <Text style={[styles.value, { color: status.color, fontSize: size * 0.28 }]}>
          {value !== null ? value.toFixed(1) : "—"}
        </Text>
        <Text style={[styles.unit, { color: colors.mutedForeground, fontSize: size * 0.09 }]}>
          ммоль/л
        </Text>
        <Text style={[styles.label, { color: status.color, fontSize: size * 0.1 }]}>
          {status.label}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  value: {
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  unit: {
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  label: {
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
});
