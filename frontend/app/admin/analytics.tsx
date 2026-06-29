import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii, font } from "@/src/theme";

type Analytics = {
  total_promos: number; active_promos: number;
  total_views: number; total_saves: number; total_redeems: number;
  total_users: number; opted_in_users: number; opt_in_rate: number;
};

type AdminPromo = {
  id: string; title: string; bar_name: string; status: string;
  start_time: string; end_time: string; redeems: number; views: number;
};

const TIMEFRAMES = ["Today", "Week", "Month"];

export default function AdminAnalytics() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [timeframe, setTimeframe] = useState("Week");

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const [a, p] = await Promise.all([
          api<Analytics>("/admin/analytics"),
          api<AdminPromo[]>("/admin/promos"),
        ]);
        setAnalytics(a); setPromos(p);
      } catch {}
    })();
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="analytics-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Analytics</Text>
        <Pressable testID="analytics-create" onPress={() => router.push("/admin/create")} style={styles.backBtn}>
          <Ionicons name="add" size={22} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={styles.segmented}>
          {TIMEFRAMES.map((t) => (
            <Pressable key={t} testID={`tf-${t}`} onPress={() => setTimeframe(t)} style={[styles.seg, timeframe === t && styles.segActive]}>
              <Text style={[styles.segText, timeframe === t && styles.segTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.grid}>
          <Kpi testID="kpi-redeems" label="QR Redeems" value={analytics?.total_redeems ?? 0} accent />
          <Kpi testID="kpi-views" label="Views" value={analytics?.total_views ?? 0} />
          <Kpi testID="kpi-saves" label="Saves" value={analytics?.total_saves ?? 0} />
          <Kpi testID="kpi-active" label="Active Promos" value={analytics?.active_promos ?? 0} />
          <Kpi testID="kpi-users" label="Users" value={analytics?.total_users ?? 0} />
          <Kpi testID="kpi-opt-in" label="Opt-in %" value={`${analytics?.opt_in_rate ?? 0}%`} />
        </View>

        <Text style={styles.section}>Promo performance</Text>
        {promos.map((p) => (
          <View key={p.id} style={styles.promoRow} testID={`admin-promo-${p.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoBar}>{p.bar_name}</Text>
              <Text style={styles.promoTitle} numberOfLines={1}>{p.title}</Text>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{p.redeems}</Text>
                  <Text style={styles.statLabel}>redeems</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{p.views}</Text>
                  <Text style={styles.statLabel}>views</Text>
                </View>
                <View style={[styles.statusPill, p.status === "active" ? styles.statusActive : styles.statusComplete]}>
                  <Text style={styles.statusText}>{p.status}</Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value, accent, testID }: { label: string; value: any; accent?: boolean; testID?: string }) {
  return (
    <View style={[styles.kpi, accent && { backgroundColor: colors.brand, borderColor: colors.brand }]} testID={testID}>
      <Text style={[styles.kpiLabel, accent && { color: "rgba(255,255,255,0.85)" }]}>{label}</Text>
      <Text style={[styles.kpiValue, accent && { color: colors.onBrand }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700" },
  segmented: { flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  seg: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radii.pill },
  segActive: { backgroundColor: colors.brand },
  segText: { color: colors.onSurfaceTertiary, fontWeight: "600" },
  segTextActive: { color: colors.onBrand, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.xl },
  kpi: { width: "47%", backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  kpiLabel: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, fontWeight: "600" },
  kpiValue: { color: colors.onSurface, fontSize: 30, fontWeight: "800", marginTop: spacing.sm },
  section: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginBottom: spacing.md },
  promoRow: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  promoBar: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700" },
  promoTitle: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginTop: 2 },
  statRow: { flexDirection: "row", gap: spacing.lg, alignItems: "center", marginTop: spacing.md },
  stat: { alignItems: "center" },
  statValue: { color: colors.onSurface, fontSize: font.size.xl, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 10, fontWeight: "600", textTransform: "uppercase" },
  statusPill: { marginLeft: "auto", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.pill },
  statusActive: { backgroundColor: "rgba(16,185,129,0.2)", borderWidth: 1, borderColor: colors.success },
  statusComplete: { backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border },
  statusText: { color: colors.onSurface, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
});
