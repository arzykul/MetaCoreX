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

type MealContext = "before" | "after" | "fasting" | "bedtime";

const CONTEXTS: { key: MealContext; label: string; icon: string }[] = [
  { key: "fasting", label: "Натощак", icon: "🌅" },
  { key: "before", label: "До еды", icon: "🍽️" },
  { key: "after", label: "После еды", icon: "✅" },
  { key: "bedtime", label: "На ночь", icon: "🌙" },
];

export function AddGlucoseModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { addGlucose } = useDiabetes();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [ctx, setCtx] = useState<MealContext>("before");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setValue("");
    setNote("");
    setCtx("before");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num) || num < 1 || num > 35) {
      setError("Введи значение от 1 до 35 ммоль/л");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    await addGlucose({ value: num, timestamp: Date.now(), note, mealContext: ctx });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleClose();
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
          <Text style={[styles.title, { color: colors.foreground }]}>Замер сахара</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            <Text style={[styles.save, { color: colors.primary, opacity: loading ? 0.5 : 1 }]}>
              Сохранить
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            УРОВЕНЬ ГЛЮКОЗЫ
          </Text>
          <View style={[styles.inputRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.bigInput, { color: colors.foreground }]}
              value={value}
              onChangeText={(t) => { setValue(t); setError(""); }}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={colors.mutedForeground}
              autoFocus
            />
            <Text style={[styles.inputUnit, { color: colors.mutedForeground }]}>ммоль/л</Text>
          </View>
          {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
            КОНТЕКСТ
          </Text>
          <View style={styles.ctxRow}>
            {CONTEXTS.map((c) => (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCtx(c.key)}
                style={[
                  styles.ctxBtn,
                  {
                    backgroundColor: ctx === c.key ? colors.primary : colors.card,
                    borderColor: ctx === c.key ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.ctxLabel, { color: ctx === c.key ? "#fff" : colors.foreground }]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
            ЗАМЕТКА (необязательно)
          </Text>
          <TextInput
            style={[styles.noteInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            value={note}
            onChangeText={setNote}
            placeholder="Как самочувствие?"
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={200}
          />
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
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
  },
  save: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
  },
  body: {
    padding: 20,
    paddingBottom: 60,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  bigInput: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    letterSpacing: -1,
  },
  inputUnit: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginTop: 6,
  },
  ctxRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ctxBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  ctxLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  noteInput: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
