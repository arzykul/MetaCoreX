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
import { useDiabetes, MealEntry } from "@/context/DiabetesContext";
import { AddMealModal } from "@/components/AddMealModal";

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MealsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { meals, deleteMeal, todayCarbs } = useDiabetes();
  const [showAdd, setShowAdd] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const todayXE = todayCarbs / 12;

  const handleDelete = (item: MealEntry) => {
    Alert.alert("Удалить запись?", item.name, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          await deleteMeal(item.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: MealEntry }) => (
    <TouchableOpacity
      onLongPress={() => handleDelete(item)}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
      activeOpacity={0.8}
    >
      <View style={[styles.iconBox, { backgroundColor: colors.accent + "18" }]}>
        <MaterialCommunityIcons name="food-apple" size={22} color={colors.accent} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowName, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{formatDateTime(item.timestamp)}</Text>
      </View>
      <View style={styles.rowNums}>
        <Text style={[styles.carbsVal, { color: colors.foreground }]}>{item.carbs.toFixed(0)}г</Text>
        <Text style={[styles.xeVal, { color: colors.accent }]}>{item.xe.toFixed(1)} ХЕ</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={meals}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        scrollEnabled={!!meals.length}
        contentContainerStyle={[styles.list, { paddingTop: topPad + 16, paddingBottom: botPad + 120 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>Питание</Text>
            <View style={styles.todayRow}>
              <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="food" size={28} color={colors.accent} />
                <Text style={[styles.todayVal, { color: colors.foreground }]}>{todayCarbs.toFixed(0)}</Text>
                <Text style={[styles.todayUnit, { color: colors.mutedForeground }]}>г углеводов сегодня</Text>
              </View>
              <View style={[styles.todayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <MaterialCommunityIcons name="bread-slice" size={28} color={colors.primary} />
                <Text style={[styles.todayVal, { color: colors.foreground }]}>{todayXE.toFixed(1)}</Text>
                <Text style={[styles.todayUnit, { color: colors.mutedForeground }]}>ХЕ сегодня</Text>
              </View>
            </View>
            <View style={[styles.xeInfo, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.xeInfoText, { color: colors.foreground }]}>
                1 ХЕ = 12 г углеводов — основная единица расчёта дозы инсулина
              </Text>
            </View>
            <Text style={[styles.listTitle, { color: colors.foreground }]}>История приёмов</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Держи палец — удалить запись</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <MaterialCommunityIcons name="food-off" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Нет записей о питании. Нажми + чтобы добавить.
            </Text>
          </View>
        }
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.accent, bottom: botPad + 100 }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
      <AddMealModal visible={showAdd} onClose={() => setShowAdd(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 20 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, marginBottom: 16 },
  todayRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  todayCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  todayVal: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -1 },
  todayUnit: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center" },
  xeInfo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 20,
  },
  xeInfoText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1, lineHeight: 18 },
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
  rowName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rowTime: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  rowNums: { alignItems: "flex-end" },
  carbsVal: { fontFamily: "Inter_700Bold", fontSize: 16 },
  xeVal: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 2 },
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
