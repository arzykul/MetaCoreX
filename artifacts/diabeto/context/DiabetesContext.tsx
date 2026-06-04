import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface GlucoseEntry {
  id: string;
  value: number;
  timestamp: number;
  note?: string;
  mealContext?: "before" | "after" | "fasting" | "bedtime";
}

export interface MealEntry {
  id: string;
  name: string;
  carbs: number;
  xe: number;
  timestamp: number;
  note?: string;
}

export interface InsulinEntry {
  id: string;
  type: "fast" | "long";
  units: number;
  timestamp: number;
  note?: string;
}

export interface UserProfile {
  name: string;
  targetMin: number;
  targetMax: number;
  insulinRatio: number;
  correctionFactor: number;
}

interface DiabetesContextType {
  glucose: GlucoseEntry[];
  meals: MealEntry[];
  insulin: InsulinEntry[];
  profile: UserProfile;
  addGlucose: (entry: Omit<GlucoseEntry, "id">) => Promise<void>;
  addMeal: (entry: Omit<MealEntry, "id">) => Promise<void>;
  addInsulin: (entry: Omit<InsulinEntry, "id">) => Promise<void>;
  deleteGlucose: (id: string) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  deleteInsulin: (id: string) => Promise<void>;
  updateProfile: (profile: Partial<UserProfile>) => Promise<void>;
  lastGlucose: GlucoseEntry | null;
  todayGlucoseAvg: number | null;
  todayCarbs: number;
  todayInsulin: number;
}

const DEFAULT_PROFILE: UserProfile = {
  name: "Моя дочка",
  targetMin: 4.0,
  targetMax: 8.0,
  insulinRatio: 1,
  correctionFactor: 2.5,
};

const DiabetesContext = createContext<DiabetesContextType | undefined>(
  undefined
);

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function DiabetesProvider({ children }: { children: React.ReactNode }) {
  const [glucose, setGlucose] = useState<GlucoseEntry[]>([]);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [insulin, setInsulin] = useState<InsulinEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    (async () => {
      try {
        const [gRaw, mRaw, iRaw, pRaw] = await Promise.all([
          AsyncStorage.getItem("glucose"),
          AsyncStorage.getItem("meals"),
          AsyncStorage.getItem("insulin"),
          AsyncStorage.getItem("profile"),
        ]);
        if (gRaw) setGlucose(JSON.parse(gRaw));
        if (mRaw) setMeals(JSON.parse(mRaw));
        if (iRaw) setInsulin(JSON.parse(iRaw));
        if (pRaw) setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(pRaw) });
      } catch (_) {}
    })();
  }, []);

  const addGlucose = useCallback(async (entry: Omit<GlucoseEntry, "id">) => {
    const newEntry: GlucoseEntry = { ...entry, id: genId() };
    setGlucose((prev) => {
      const updated = [newEntry, ...prev].slice(0, 500);
      AsyncStorage.setItem("glucose", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addMeal = useCallback(async (entry: Omit<MealEntry, "id">) => {
    const newEntry: MealEntry = { ...entry, id: genId() };
    setMeals((prev) => {
      const updated = [newEntry, ...prev].slice(0, 500);
      AsyncStorage.setItem("meals", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const addInsulin = useCallback(async (entry: Omit<InsulinEntry, "id">) => {
    const newEntry: InsulinEntry = { ...entry, id: genId() };
    setInsulin((prev) => {
      const updated = [newEntry, ...prev].slice(0, 500);
      AsyncStorage.setItem("insulin", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteGlucose = useCallback(async (id: string) => {
    setGlucose((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      AsyncStorage.setItem("glucose", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteMeal = useCallback(async (id: string) => {
    setMeals((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      AsyncStorage.setItem("meals", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteInsulin = useCallback(async (id: string) => {
    setInsulin((prev) => {
      const updated = prev.filter((e) => e.id !== id);
      AsyncStorage.setItem("insulin", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateProfile = useCallback(async (partial: Partial<UserProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...partial };
      AsyncStorage.setItem("profile", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayMs = startOfDay.getTime();

  const lastGlucose = glucose.length > 0 ? glucose[0] : null;

  const todayGlucoseEntries = glucose.filter(
    (e) => e.timestamp >= startOfDayMs
  );
  const todayGlucoseAvg =
    todayGlucoseEntries.length > 0
      ? todayGlucoseEntries.reduce((sum, e) => sum + e.value, 0) /
        todayGlucoseEntries.length
      : null;

  const todayCarbs = meals
    .filter((e) => e.timestamp >= startOfDayMs)
    .reduce((sum, e) => sum + e.carbs, 0);

  const todayInsulin = insulin
    .filter((e) => e.timestamp >= startOfDayMs)
    .reduce((sum, e) => sum + e.units, 0);

  return (
    <DiabetesContext.Provider
      value={{
        glucose,
        meals,
        insulin,
        profile,
        addGlucose,
        addMeal,
        addInsulin,
        deleteGlucose,
        deleteMeal,
        deleteInsulin,
        updateProfile,
        lastGlucose,
        todayGlucoseAvg,
        todayCarbs,
        todayInsulin,
      }}
    >
      {children}
    </DiabetesContext.Provider>
  );
}

export function useDiabetes() {
  const ctx = useContext(DiabetesContext);
  if (!ctx) throw new Error("useDiabetes must be used within DiabetesProvider");
  return ctx;
}
