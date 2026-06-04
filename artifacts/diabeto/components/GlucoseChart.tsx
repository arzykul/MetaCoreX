import React from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

import { useColors } from "@/hooks/useColors";
import type { GlucoseEntry } from "@/context/DiabetesContext";

const SCREEN_W = Dimensions.get("window").width;
const CHART_W = SCREEN_W - 48;
const CHART_H = 110;
const PAD = 10;

interface Props {
  entries: GlucoseEntry[];
  targetMin: number;
  targetMax: number;
}

export function GlucoseChart({ entries, targetMin, targetMax }: Props) {
  const colors = useColors();

  const recent = [...entries].sort((a, b) => a.timestamp - b.timestamp).slice(-12);
  if (recent.length < 2) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Добавь хотя бы 2 замера для графика
        </Text>
      </View>
    );
  }

  const values = recent.map((e) => e.value);
  const minV = Math.min(...values, targetMin - 1);
  const maxV = Math.max(...values, targetMax + 1);
  const range = maxV - minV || 1;

  const toX = (i: number) =>
    PAD + (i / (recent.length - 1)) * (CHART_W - PAD * 2);
  const toY = (v: number) =>
    CHART_H - PAD - ((v - minV) / range) * (CHART_H - PAD * 2);

  const pathD = recent
    .map((e, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(e.value).toFixed(1)}`)
    .join(" ");

  const targetMinY = toY(targetMin);
  const targetMaxY = toY(targetMax);
  const zoneTop = Math.min(targetMinY, targetMaxY);
  const zoneH = Math.abs(targetMaxY - targetMinY);

  const getDotColor = (v: number) => {
    if (v < 3.9) return colors.glucoseLow;
    if (v >= targetMin && v <= targetMax) return colors.glucoseNormal;
    if (v > targetMax && v <= 13.9) return colors.glucoseHigh;
    return colors.glucoseDanger;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Target zone */}
        <Rect
          x={PAD}
          y={zoneTop}
          width={CHART_W - PAD * 2}
          height={zoneH}
          fill={colors.glucoseNormal}
          fillOpacity={0.1}
        />
        {/* Target min line */}
        <Line
          x1={PAD} y1={targetMinY}
          x2={CHART_W - PAD} y2={targetMinY}
          stroke={colors.glucoseNormal}
          strokeWidth={1}
          strokeDasharray="4,3"
          strokeOpacity={0.5}
        />
        {/* Target max line */}
        <Line
          x1={PAD} y1={targetMaxY}
          x2={CHART_W - PAD} y2={targetMaxY}
          stroke={colors.glucoseHigh}
          strokeWidth={1}
          strokeDasharray="4,3"
          strokeOpacity={0.5}
        />
        {/* Path */}
        <Path
          d={pathD}
          fill="none"
          stroke={colors.primary}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Dots */}
        {recent.map((e, i) => (
          <Circle
            key={e.id}
            cx={toX(i)}
            cy={toY(e.value)}
            r={4}
            fill={getDotColor(e.value)}
          />
        ))}
      </Svg>
      <View style={styles.labels}>
        <Text style={[styles.labelText, { color: colors.glucoseNormal }]}>
          ↓{targetMin} норма ↑{targetMax} ммоль/л
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
  },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    marginTop: 8,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },
  labels: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 4,
  },
  labelText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
});
