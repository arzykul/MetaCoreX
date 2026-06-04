import React, { useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useDiabetes } from "@/context/DiabetesContext";
import { GlucoseGauge } from "@/components/GlucoseGauge";
import { StatCard } from "@/components/StatCard";
import { AddGlucoseModal } from "@/components/AddGlucoseModal";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return formatTime(ts);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const MEAL_CTX_LABELS: Record<string, string> = {
  before: "До еды",
  after: "После еды",
  fasting: "Натощак",
  bedtime: "На ночь",
};

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    lastGlucose,
    todayGlucoseAvg,
    todayCarbs,
    todayInsulin,
    glucose,
    profile,
  } = useDiabetes();
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  const recent = glucose.slice(0, 5);

  const getGlucoseStatus = (v: number) => {
    if (v < 3.9) return { color: colors.glucoseLow, bg: colors.glucoseLow + "18" };
    if (v >= profile.targetMin && v <= profile.targetMax) return { color: colors.glucoseNormal, bg: colors.glucoseNormal + "18" };
    if (v > profile.targetMax && v <= 13.9) return { color: colors.glucoseHigh, bg: colors.glucoseHigh + "18" };
    return { color: colors.glucoseDanger, bg: colors.glucoseDanger + "18" };
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: botPad + 120 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Привет,</Text>
            <Text style={[styles.name, { color: colors.foreground }]}>{profile.name} 💙</Text>
          </View>
          <View style={[styles.dateBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.dateText, { color: colors.foreground }]}>
              {new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
            </Text>
          </View>
        </View>

        {/* Gauge */}
        <View style={styles.gaugeSection}>
          <GlucoseGauge
            value={lastGlucose?.value ?? null}
            targetMin={profile.targetMin}
            targetMax={profile.targetMax}
            size={200}
          />
          {lastGlucose && (
            <Text style={[styles.lastTime, { color: colors.mutedForeground }]}>
              Последний замер: {formatDate(lastGlucose.timestamp)}
              {lastGlucose.mealContext ? ` · ${MEAL_CTX_LABELS[lastGlucose.mealContext]}` : ""}
            </Text>
          )}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard
            icon="chart-line"
            label="Средний за день"
            value={todayGlucoseAvg !== null ? todayGlucoseAvg.toFixed(1) : "—"}
            unit="ммоль/л"
            color={colors.primary}
          />
          <StatCard
            icon="food-apple"
            label="Углеводы"
            value={todayCarbs.toFixed(0)}
            unit="г сегодня"
            color={colors.accent}
          />
          <StatCard
            icon="needle"
            label="Инсулин"
            value={todayInsulin.toFixed(1)}
            unit="ед сегодня"
            color={colors.warning}
          />
        </View>

        {/* Recent glucose */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Последние замеры</Text>
        </View>

        {recent.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="water-check" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Нажми + чтобы добавить первый замер
            </Text>
          </View>
        ) : (
          recent.map((e) => {
            const s = getGlucoseStatus(e.value);
            return (
              <View key={e.id} style={[styles.glucoseRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.glucoseDot, { backgroundColor: s.bg, borderColor: s.color }]}>
                  <Text style={[styles.glucoseVal, { color: s.color }]}>{e.value.toFixed(1)}</Text>
                </View>
                <View style={styles.glucoseInfo}>
                  <Text style={[styles.glucoseTime, { color: colors.foreground }]}>{formatDate(e.timestamp)}</Text>
                  {e.mealContext && (
                    <Text style={[styles.glucoseCtx, { color: colors.mutedForeground }]}>
                      {MEAL_CTX_LABELS[e.mealContext]}
                    </Text>
                  )}
                  {e.note && (
                    <Text style={[styles.glucoseNote, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {e.note}
                    </Text>
                  )}
                </View>
                <Text style={[styles.glucoseUnit, { color: colors.mutedForeground }]}>ммоль/л</Text>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* FAB */}
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
  scroll: { paddingHorizontal: 20 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  greeting: { fontFamily: "Inter_400Regular", fontSize: 15 },
  name: { fontFamily: "Inter_700Bold", fontSize: 24, letterSpacing: -0.5 },
  dateBadge: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  gaugeSection: { alignItems: "center", marginBottom: 28 },
  lastTime: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 12 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  glucoseRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 14,
  },
  glucoseDot: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  glucoseVal: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: -0.5 },
  glucoseInfo: { flex: 1 },
  glucoseTime: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  glucoseCtx: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  glucoseNote: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  glucoseUnit: { fontFamily: "Inter_400Regular", fontSize: 12 },
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
