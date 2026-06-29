import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, spacing, radii, font } from "@/src/theme";

type Loyalty = { points: number; tier: string; redemptions: number };
type Promo = { id: string; title: string; bar_name: string; end_time: string; image_url?: string };

export default function TicketsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [saved, setSaved] = useState<Promo[]>([]);

  const load = useCallback(async () => {
    try {
      const [l, allPromos] = await Promise.all([
        api<Loyalty>("/users/me/loyalty"),
        api<Promo[]>("/promos?lat=34.365&lon=-89.5384&radius_miles=10"),
      ]);
      setLoyalty(l);
      setSaved(allPromos.slice(0, 5));
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); refresh(); }, [load, refresh]));

  async function redeemReward() {
    try {
      await api("/users/me/loyalty/redeem", { method: "POST" });
      await load();
      await refresh();
    } catch (e: any) {
      // simple inline error not needed - button disabled below
    }
  }

  const points = loyalty?.points ?? user?.loyalty_points ?? 0;
  const progress = Math.min(100, (points % 100));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={[styles.hero, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.eyebrow}>REBEL REWARDS</Text>
          <Text style={styles.heroTitle} testID="tickets-title">My Tickets</Text>

          <View style={styles.loyaltyCard} testID="loyalty-card">
            <View style={styles.loyaltyRow}>
              <View>
                <Text style={styles.tier}>{loyalty?.tier ?? "Bronze"} Tier</Text>
                <Text style={styles.points} testID="loyalty-points">{points} <Text style={styles.pointsSuffix}>pts</Text></Text>
              </View>
              <View style={styles.redeemWrap}>
                <Pressable
                  testID="redeem-reward-button"
                  onPress={redeemReward}
                  disabled={points < 100}
                  style={[styles.redeemBtn, points < 100 && { opacity: 0.4 }]}
                >
                  <Text style={styles.redeemBtnText}>Redeem 100pts</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{100 - progress} pts to next reward</Text>
          </View>
        </View>

        <View style={{ padding: spacing.lg }}>
          <Text style={styles.section}>Active offers</Text>
          {saved.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="qr-code-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyText}>No active tickets yet</Text>
            </View>
          ) : saved.map((p) => (
            <Pressable
              key={p.id}
              testID={`ticket-row-${p.id}`}
              style={styles.ticketRow}
              onPress={() => router.push(`/qr/${p.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketBar}>{p.bar_name}</Text>
                <Text style={styles.ticketTitle} numberOfLines={1}>{p.title}</Text>
              </View>
              <View style={styles.qrIconWrap}>
                <Ionicons name="qr-code" size={28} color={colors.brand} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg },
  eyebrow: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1 },
  heroTitle: { color: colors.onSurface, fontSize: font.size.xxl, fontWeight: "800", marginTop: 4 },
  loyaltyCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  loyaltyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  tier: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1 },
  points: { color: colors.onSurface, fontSize: 42, fontWeight: "800", marginTop: 2 },
  pointsSuffix: { color: colors.muted, fontSize: font.size.base, fontWeight: "600" },
  redeemWrap: { justifyContent: "center" },
  redeemBtn: { backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.pill },
  redeemBtnText: { color: colors.onBrand, fontWeight: "700", fontSize: font.size.sm },
  progressTrack: { marginTop: spacing.lg, height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: radii.pill, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.brand },
  progressLabel: { marginTop: spacing.sm, color: colors.onSurfaceTertiary, fontSize: font.size.sm },
  section: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700", marginBottom: spacing.md },
  empty: { alignItems: "center", marginTop: 40 },
  emptyText: { color: colors.onSurfaceTertiary, marginTop: spacing.md },
  ticketRow: { flexDirection: "row", padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, alignItems: "center" },
  ticketBar: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  ticketTitle: { color: colors.onSurface, fontWeight: "700", fontSize: font.size.lg, marginTop: 2 },
  qrIconWrap: { width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
});
