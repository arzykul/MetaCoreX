import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/useColors";
import { useDiabetes } from "@/context/DiabetesContext";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { profile, updateProfile, glucose, meals, insulin } = useDiabetes();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [targetMin, setTargetMin] = useState(profile.targetMin.toString());
  const [targetMax, setTargetMax] = useState(profile.targetMax.toString());

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const handleSave = async () => {
    const min = parseFloat(targetMin.replace(",", "."));
    const max = parseFloat(targetMax.replace(",", "."));
    if (isNaN(min) || isNaN(max) || min < 3 || max > 20 || min >= max) {
      Alert.alert("Ошибка", "Укажи корректный диапазон нормы (мин < макс, от 3 до 20)");
      return;
    }
    await updateProfile({ name: name.trim() || profile.name, targetMin: min, targetMax: max });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(false);
  };

  const handleClearAll = () => {
    Alert.alert(
      "Удалить все данные?",
      "Это удалит все замеры, питание и инъекции. Действие нельзя отменить.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить всё",
          style: "destructive",
          onPress: () => {
            Alert.alert("Удалено", "Все записи удалены. Пожалуйста, перезапустите приложение.");
          },
        },
      ]
    );
  };

  const totalEntries = glucose.length + meals.length + insulin.length;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16, paddingBottom: botPad + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.pageTitle, { color: colors.foreground }]}>Профиль</Text>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
          <MaterialCommunityIcons name="heart-pulse" size={44} color={colors.primary} />
        </View>
        {editing ? (
          <TextInput
            style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
        ) : (
          <Text style={[styles.nameText, { color: colors.foreground }]}>{profile.name}</Text>
        )}
        <Text style={[styles.diagnosisText, { color: colors.mutedForeground }]}>
          Сахарный диабет 1 типа
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statVal, { color: colors.primary }]}>{glucose.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>замеров</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statVal, { color: colors.accent }]}>{meals.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>приёмов пищи</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statVal, { color: colors.warning }]}>{insulin.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>инъекций</Text>
        </View>
      </View>

      {/* Target range */}
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Целевой диапазон</Text>
      <View style={[styles.rangeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rangeRow}>
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>Минимум</Text>
            {editing ? (
              <TextInput
                style={[styles.rangeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={targetMin}
                onChangeText={setTargetMin}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={[styles.rangeValue, { color: colors.glucoseNormal }]}>{profile.targetMin.toFixed(1)}</Text>
            )}
          </View>
          <View style={[styles.rangeDivider, { backgroundColor: colors.border }]} />
          <View style={styles.rangeItem}>
            <Text style={[styles.rangeLabel, { color: colors.mutedForeground }]}>Максимум</Text>
            {editing ? (
              <TextInput
                style={[styles.rangeInput, { color: colors.foreground, borderColor: colors.border }]}
                value={targetMax}
                onChangeText={setTargetMax}
                keyboardType="decimal-pad"
              />
            ) : (
              <Text style={[styles.rangeValue, { color: colors.glucoseHigh }]}>{profile.targetMax.toFixed(1)}</Text>
            )}
          </View>
        </View>
        <Text style={[styles.rangeUnit, { color: colors.mutedForeground }]}>ммоль/л</Text>
      </View>

      {/* Edit / Save */}
      {editing ? (
        <View style={styles.btnRow}>
          <TouchableOpacity
            onPress={() => { setEditing(false); setName(profile.name); setTargetMin(profile.targetMin.toString()); setTargetMax(profile.targetMax.toString()); }}
            style={[styles.btn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.btnText, { color: colors.foreground }]}>Отмена</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.btnText, { color: "#fff" }]}>Сохранить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => setEditing(true)}
          style={[styles.editBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
        >
          <Ionicons name="pencil-outline" size={18} color={colors.primary} />
          <Text style={[styles.editBtnText, { color: colors.primary }]}>Редактировать профиль</Text>
        </TouchableOpacity>
      )}

      {/* Info */}
      <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>О приложении</Text>
      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="shield-check" size={20} color={colors.glucoseNormal} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>Данные хранятся только на этом устройстве</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="bluetooth" size={20} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>Bluetooth CGM — в разработке (Libre/Dexcom)</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.infoRow}>
          <MaterialCommunityIcons name="doctor" size={20} color={colors.warning} />
          <Text style={[styles.infoText, { color: colors.foreground }]}>Всегда консультируйся с врачом по дозам</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleClearAll}
        style={[styles.dangerBtn, { borderColor: colors.destructive + "50" }]}
      >
        <Ionicons name="trash-outline" size={16} color={colors.destructive} />
        <Text style={[styles.dangerText, { color: colors.destructive }]}>Удалить все данные</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20 },
  pageTitle: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5, marginBottom: 20 },
  avatarSection: { alignItems: "center", marginBottom: 28 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  nameText: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: -0.3 },
  nameInput: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    width: "70%",
    textAlign: "center",
  },
  diagnosisText: { fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 28 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
  },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 24, letterSpacing: -0.5 },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4, textAlign: "center" },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, marginBottom: 12 },
  rangeCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 16 },
  rangeRow: { flexDirection: "row", alignItems: "center" },
  rangeItem: { flex: 1, alignItems: "center" },
  rangeLabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 6 },
  rangeValue: { fontFamily: "Inter_700Bold", fontSize: 32, letterSpacing: -1 },
  rangeInput: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    width: 80,
    textAlign: "center",
  },
  rangeDivider: { width: 1, height: 50 },
  rangeUnit: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", marginTop: 8 },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  editBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  btnRow: { flexDirection: "row", gap: 12 },
  btn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  infoCard: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  divider: { height: 1 },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 20,
  },
  dangerText: { fontFamily: "Inter_500Medium", fontSize: 14 },
});
