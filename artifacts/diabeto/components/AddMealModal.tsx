import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useDiabetes } from "@/context/DiabetesContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const QUICK_FOODS = [
  { name: "Хлеб белый (1 ломтик)", carbs: 15 },
  { name: "Картофель варёный (100г)", carbs: 17 },
  { name: "Рис варёный (100г)", carbs: 28 },
  { name: "Молоко (200мл)", carbs: 10 },
  { name: "Яблоко (1 шт)", carbs: 15 },
  { name: "Банан (1 шт)", carbs: 27 },
  { name: "Сок апельсин (200мл)", carbs: 22 },
  { name: "Гречка (100г)", carbs: 21 },
];

export function AddMealModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { addMeal } = useDiabetes();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setCarbs("");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Введи название блюда");
      return;
    }
    const carbsNum = parseFloat(carbs.replace(",", "."));
    if (isNaN(carbsNum) || carbsNum < 0 || carbsNum > 500) {
      setError("Введи углеводы от 0 до 500 г");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    const xe = carbsNum / 12;
    await addMeal({ name: name.trim(), carbs: carbsNum, xe, timestamp: Date.now() });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleClose();
  };

  const pickQuick = (food: { name: string; carbs: number }) => {
    setName(food.name);
    setCarbs(food.carbs.toString());
    setError("");
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.foreground }]}>Добавить еду</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            <Text style={[styles.save, { color: colors.primary, opacity: loading ? 0.5 : 1 }]}>
              Сохранить
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>НАЗВАНИЕ БЛЮДА</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            value={name}
            onChangeText={(t) => { setName(t); setError(""); }}
            placeholder="Что ела?"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
          />

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>УГЛЕВОДЫ (граммы)</Text>
          <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.numInput, { color: colors.foreground }]}
              value={carbs}
              onChangeText={(t) => { setCarbs(t); setError(""); }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
            />
            <View>
              <Text style={[styles.unitLine, { color: colors.mutedForeground }]}>г углеводов</Text>
              {carbs ? (
                <Text style={[styles.xeCalc, { color: colors.accent }]}>
                  = {(parseFloat(carbs.replace(",", ".")) / 12).toFixed(1)} ХЕ
                </Text>
              ) : null}
            </View>
          </View>
          {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>БЫСТРЫЙ ВЫБОР</Text>
          <View style={styles.quickGrid}>
            {QUICK_FOODS.map((f) => (
              <TouchableOpacity
                key={f.name}
                onPress={() => pickQuick(f)}
                style={[styles.quickBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={[styles.quickName, { color: colors.foreground }]}>{f.name}</Text>
                <Text style={[styles.quickCarbs, { color: colors.primary }]}>{f.carbs}г</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  save: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  body: { padding: 20, paddingBottom: 60 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  numInput: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    letterSpacing: -1,
    flex: 1,
  },
  unitLine: { fontFamily: "Inter_500Medium", fontSize: 14 },
  xeCalc: { fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 2 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6 },
  quickGrid: { gap: 8 },
  quickBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quickName: { fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
  quickCarbs: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
