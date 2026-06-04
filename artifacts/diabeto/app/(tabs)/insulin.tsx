import React, { useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useDiabetes, InsulinEntry } from "@/context/DiabetesContext";
import { AddInsulinModal } from "@/components/AddInsulinModal";

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InsulinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { insulin, deleteInsulin, todayInsulin } = useDiabetes();
  const [showAdd, setShowAdd] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const todayFast = insulin
    .filter((e) => {
      const d = new Date(e.timestamp);
      const now = new Date();
      d.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      return d.getTime() === now.getTime() && e.type === "fast";
    })
    .reduce((s, e) => s + e.units, 0);

  const todayLong = insulin
    .filter((e) => {
      const d = new Date(e.timestamp);
      const now = new Date();
      d.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      return d.getTime() === now.getTime() && e.type === "long";
    })
    .reduce((s, e) => s + e.units, 0);

  const handleDelete = (item: InsulinEntry) => {
    Alert.alert("Удалить запись?", `${item.type === "fast" ? "Быстрый" : "Длинный"} инсулин ${item.units} ед`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteInsulin(item.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: InsulinEntry }) => {
    const isFast = item.type === "fast";
    const iconColor = isFast ? colors.primary : colors.accent;
    return (
      <TouchableOpacity
        onLongPress={() => handleDelete(item)}
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        activeOpacity={0.8}
      >
        <View style={[styles.iconBox, { backgroundColor: iconColor + "18" }]}>
          <Ionicons name={isFast ? "flash" : "moon"} size={22} color={iconColor} />
        </View>
        <View style={styles.rowInfo}>
          <Text style={[styles.rowType, { color: colors.foreground }]}>
            {isFast ? "Быстрый (ультракороткий)" : "Длинный (базальный)"}
          </Text>
          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{formatDateTime(item.timestamp)}</Text>
          {item.note ? (
            <Text style={[styles.rowNote, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.note}
            </Text>
          ) : null}
        </View>
        <View style={styles.units}>
          <Text style={[styles.unitsVal, { color: iconColor }]}>{item.units}</Text>
          <Text style={[styles.unitsLabel, { color: colors.mutedForeground }]}>ед</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={insulin}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        scrollEnabled={!!insulin.length}
        contentContainerStyle={[styles.list, { paddingTop: topPad + 16, paddingBottom: botPad + 120 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>Инсулин</Text>
            <View style={styles.todayRow}>
              <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="flash" size={28} color={colors.primary} />
                <Text style={[styles.todayVal, { color: colors.foreground }]}>{todayFast.toFixed(1)}</Text>
                <Text style={[styles.todayUnit, { color: colors.mutedForeground }]}>ед быстрого</Text>
              </View>
              <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="moon" size={28} color={colors.accent} />
                <Text style={[styles.todayVal, { color: colors.foreground }]}>{todayLong.toFixed(1)}</Text>
                <Text style={[styles.todayUnit, { color: colors.mutedForeground }]}>ед длинного</Text>
              </View>
              <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="needle" size={28} color={colors.warning} />
                <Text style={[styles.todayVal, { color: colors.foreground }]}>{todayInsulin.toFixed(1)}</Text>
                <Text style={[styles.todayUnit, { color: colors.mutedForeground }]}>всего ед</Text>
              </View>
            </View>
            <View style={[styles.safetyBox, { backgroundColor: colors.destructive + "10", borderColor: colors.destructive + "30" }]}>
              <Ionicons name="warning-outline" size={16} color={colors.destructive} />
              <Text style={[styles.safetyText, { color: colors.foreground }]}>
                Дозу инсулина всегда согласовывай с врачом-эндокринологом
              </Text>
            </View>
            <Text style={[styles.listTitle, { color: colors.foreground }]}>История инъекций</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Держи палец — удалить запись</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="needle-off" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Нет записей. Нажми + чтобы добавить.
            </Text>
          </View>
        }
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.warning, bottom: botPad + 100 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
      <AddInsulinModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, marginBottom: 16 },
  todayRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  todayCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  todayVal: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -1 },
  todayUnit: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" },
  safetyBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  safetyText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1, lineHeight: 17 },
  listTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, marginBottom: 4 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rowInfo: { flex: 1 },
  rowType: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  rowTime: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  rowNote: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  units: { alignItems: "center" },
  unitsVal: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.5 },
  unitsLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
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
