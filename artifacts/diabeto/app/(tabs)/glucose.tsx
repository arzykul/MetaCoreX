import React, { useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useDiabetes, GlucoseEntry } from "@/context/DiabetesContext";
import { GlucoseChart } from "@/components/GlucoseChart";
import { AddGlucoseModal } from "@/components/AddGlucoseModal";

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MEAL_CTX_LABELS: Record<string, string> = {
  before: "До еды",
  after: "После еды",
  fasting: "Натощак",
  bedtime: "На ночь",
};

export default function GlucoseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { glucose, deleteGlucose, profile } = useDiabetes();
  const [showAdd, setShowAdd] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const getStatus = (v: number) => {
    if (v < 3.9) return { color: colors.glucoseLow, label: "Низкий" };
    if (v >= profile.targetMin && v <= profile.targetMax) return { color: colors.glucoseNormal, label: "Норма" };
    if (v > profile.targetMax && v <= 13.9) return { color: colors.glucoseHigh, label: "Высокий" };
    return { color: colors.glucoseDanger, label: "Опасно" };
  };

  const handleDelete = (item: GlucoseEntry) => {
    Alert.alert("Удалить запись?", `Сахар ${item.value} ммоль/л от ${formatDateTime(item.timestamp)}`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteGlucose(item.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: GlucoseEntry }) => {
    const s = getStatus(item.value);
    return (
      <TouchableOpacity
        onLongPress={() => handleDelete(item)}
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.8}
      >
        <View style={[styles.badge, { backgroundColor: s.color + "18", borderColor: s.color }]}>
          <Text style={[styles.badgeVal, { color: s.color }]}>{item.value.toFixed(1)}</Text>
          <Text style={[styles.badgeLabel, { color: s.color }]}>{s.label}</Text>
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowTime, { color: colors.foreground }]}>{formatDateTime(item.timestamp)}</Text>
          {item.mealContext && (
            <Text style={[styles.rowCtx, { color: colors.mutedForeground }]}>{MEAL_CTX_LABELS[item.mealContext]}</Text>
          )}
          {item.note ? (
            <Text style={[styles.rowNote, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.note}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={glucose}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        scrollEnabled={!!glucose.length}
        contentContainerStyle={[
          styles.list,
          { paddingTop: topPad + 16, paddingBottom: botPad + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>График сахара</Text>
            <GlucoseChart
              entries={glucose}
              targetMin={profile.targetMin}
              targetMax={profile.targetMax}
            />
            <View style={styles.statsRow}>
              {[
                { label: "Всего замеров", val: glucose.length.toString() },
                {
                  label: "В норме",
                  val:
                    glucose.length > 0
                      ? `${Math.round((glucose.filter((e) => e.value >= profile.targetMin && e.value <= profile.targetMax).length / glucose.length) * 100)}%`
                      : "—",
                },
                {
                  label: "Средний",
                  val:
                    glucose.length > 0
                      ? (glucose.reduce((s, e) => s + e.value, 0) / glucose.length).toFixed(1)
                      : "—",
                },
              ].map((s) => (
                <View key={s.label} style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.statVal, { color: colors.foreground }]}>{s.val}</Text>
                  <Text style={[styles.statLbl, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.listTitle, { color: colors.foreground }]}>История</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Держи палец — удалить запись</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="water-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Нет замеров. Нажми + чтобы добавить.
            </Text>
          </View>
        }
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: botPad + 100 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
      <AddGlucoseModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, marginBottom: 4 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 16, marginBottom: 24 },
  statBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
  },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 20, letterSpacing: -0.5 },
  statLbl: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4, textAlign: "center" },
  listTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, marginBottom: 4 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 14,
  },
  badge: {
    width: 64,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  badgeVal: { fontFamily: "Inter_700Bold", fontSize: 17, letterSpacing: -0.5 },
  badgeLabel: { fontFamily: "Inter_500Medium", fontSize: 10 },
  rowInfo: { flex: 1 },
  rowTime: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rowCtx: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  rowNote: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  empty: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 40,
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  fab: {
    position: "absolute",
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
});
