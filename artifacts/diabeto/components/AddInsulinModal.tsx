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

export function AddInsulinModal({ visible, onClose }: Props) {
  const colors = useColors();
  const { addInsulin } = useDiabetes();
  const insets = useSafeAreaInsets();
  const [units, setUnits] = useState("");
  const [type, setType] = useState<"fast" | "long">("fast");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setUnits("");
    setType("fast");
    setNote("");
    setError("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const u = parseFloat(units.replace(",", "."));
    if (isNaN(u) || u <= 0 || u > 100) {
      setError("Введи дозу от 0.5 до 100 единиц");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setLoading(true);
    await addInsulin({ units: u, type, timestamp: Date.now(), note });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    handleClose();
  };

  const adjustUnits = (delta: number) => {
    const current = parseFloat(units) || 0;
    const next = Math.max(0.5, Math.min(100, current + delta));
    setUnits(Number.isInteger(next) ? next.toString() : next.toFixed(1));
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
          <Text style={[styles.title, { color: colors.foreground }]}>Инъекция инсулина</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            <Text style={[styles.save, { color: colors.primary, opacity: loading ? 0.5 : 1 }]}>
              Сохранить
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ТИП ИНСУЛИНА</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              onPress={() => setType("fast")}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: type === "fast" ? colors.primary : colors.card,
                  borderColor: type === "fast" ? colors.primary : colors.border,
                },
              ]}
            >
              <Ionicons name="flash" size={18} color={type === "fast" ? "#fff" : colors.foreground} />
              <Text style={[styles.typeName, { color: type === "fast" ? "#fff" : colors.foreground }]}>
                Быстрый
              </Text>
              <Text style={[styles.typeDesc, { color: type === "fast" ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                Ультракороткий
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setType("long")}
              style={[
                styles.typeBtn,
                {
                  backgroundColor: type === "long" ? colors.accent : colors.card,
                  borderColor: type === "long" ? colors.accent : colors.border,
                },
              ]}
            >
              <Ionicons name="moon" size={18} color={type === "long" ? "#fff" : colors.foreground} />
              <Text style={[styles.typeName, { color: type === "long" ? "#fff" : colors.foreground }]}>
                Длинный
              </Text>
              <Text style={[styles.typeDesc, { color: type === "long" ? "rgba(255,255,255,0.7)" : colors.mutedForeground }]}>
                Базальный
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 24 }]}>ДОЗА (единицы)</Text>
          <View style={[styles.doseRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => adjustUnits(-1)} style={styles.adjBtn}>
              <Ionicons name="remove" size={24} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={[styles.doseInput, { color: colors.foreground }]}
              value={units}
              onChangeText={(t) => { setUnits(t); setError(""); }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              textAlign="center"
            />
            <Text style={[styles.doseUnit, { color: colors.mutedForeground }]}>ед</Text>
            <TouchableOpacity onPress={() => adjustUnits(1)} style={styles.adjBtn}>
              <Ionicons name="add" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {!!error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>ЗАМЕТКА</Text>
          <TextInput
            style={[styles.noteInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            value={note}
            onChangeText={setNote}
            placeholder="Место укола, особенности..."
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
  title: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  save: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  body: { padding: 20, paddingBottom: 60 },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  typeRow: { flexDirection: "row", gap: 12 },
  typeBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 4,
    alignItems: "center",
  },
  typeName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  typeDesc: { fontFamily: "Inter_400Regular", fontSize: 12 },
  doseRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  adjBtn: {
    width: 56,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  doseInput: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 40,
    letterSpacing: -1,
    height: 70,
  },
  doseUnit: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    marginRight: 8,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 6 },
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
