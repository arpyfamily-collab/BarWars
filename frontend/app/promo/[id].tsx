import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, spacing, radii, font } from "@/src/theme";

type Promo = {
  id: string; bar_id: string; bar_name: string; title: string; description: string;
  start_time: string; end_time: string; offers: { type: string; value: string }[];
  status: string; image_url?: string; is_alcohol: boolean; distance_miles?: number | null;
};

export default function PromoDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [promo, setPromo] = useState<Promo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Promo>(`/promos/${id}?lat=34.365&lon=-89.5384`);
      setPromo(data);
      // log view engagement
      api(`/engagements`, { method: "POST", body: { promo_id: id, action: "view" } }).catch(() => {});
    } catch (e: any) { setError(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function format(d?: string) { return d ? new Date(d).toLocaleString() : ""; }

  if (!promo) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <ImageBackground source={{ uri: promo.image_url }} style={styles.hero}>
          <LinearGradient colors={["rgba(10,17,31,0.4)", "transparent", "rgba(10,17,31,0.95)"]} style={StyleSheet.absoluteFill} />
          <Pressable testID="promo-back" style={[styles.backBtn, { top: insets.top + spacing.sm }]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
          </Pressable>
          <View style={styles.heroBody}>
            <Text style={styles.barName}>{promo.bar_name}</Text>
            <Text style={styles.title} testID="promo-title">{promo.title}</Text>
          </View>
        </ImageBackground>

        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <View style={styles.metaRow}>
            <View style={styles.metaPill}><Ionicons name="time" size={14} color={colors.brand} /><Text style={styles.metaText}>{format(promo.start_time)}</Text></View>
            {promo.distance_miles != null && <View style={styles.metaPill}><Ionicons name="navigate" size={14} color={colors.brand} /><Text style={styles.metaText}>{promo.distance_miles} mi</Text></View>}
          </View>

          <Text style={styles.description}>{promo.description}</Text>

          <View style={styles.offerBox}>
            <Text style={styles.offerLabel}>OFFERS</Text>
            {promo.offers.map((o, i) => (
              <View key={i} style={styles.offerRow}>
                <Ionicons name="gift" size={18} color={colors.brand} />
                <Text style={styles.offerText}>{o.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.offerBox}>
            <Text style={styles.offerLabel}>VALID UNTIL</Text>
            <Text style={styles.offerText}>{format(promo.end_time)}</Text>
          </View>

          {promo.is_alcohol && !user?.age_verified && (
            <View style={styles.warn}>
              <Ionicons name="warning" size={18} color={colors.warning} />
              <Text style={styles.warnText}>Age verification required. Enable 21+ in Profile.</Text>
            </View>
          )}
          {error && <Text style={{ color: colors.error }}>{error}</Text>}
        </View>
      </ScrollView>

      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          testID="promo-redeem-button"
          onPress={() => router.push(`/qr/${promo.id}`)}
          disabled={promo.is_alcohol && !user?.age_verified}
          style={({ pressed }) => [styles.cta, { opacity: pressed || (promo.is_alcohol && !user?.age_verified) ? 0.6 : 1 }]}
        >
          <Ionicons name="qr-code" size={20} color={colors.onBrand} />
          <Text style={styles.ctaText}>Generate redemption QR</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 320, justifyContent: "flex-end" },
  backBtn: { position: "absolute", left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(10,17,31,0.7)", alignItems: "center", justifyContent: "center" },
  heroBody: { padding: spacing.lg },
  barName: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: font.size.display, fontWeight: "800", marginTop: spacing.sm },
  metaRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  metaPill: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surfaceSecondary, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  metaText: { color: colors.onSurface, fontSize: font.size.sm, fontWeight: "600" },
  description: { color: colors.onSurfaceSecondary, fontSize: font.size.lg, lineHeight: 24 },
  offerBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  offerLabel: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1 },
  offerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  offerText: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "600" },
  warn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(245,158,11,0.1)", padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.warning },
  warnText: { color: colors.warning, flex: 1 },
  ctaWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: "rgba(10,17,31,0.95)", borderTopWidth: 1, borderTopColor: colors.border },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, height: 56, borderRadius: radii.pill },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
});
