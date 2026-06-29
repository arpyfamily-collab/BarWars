import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ImageBackground, RefreshControl, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, spacing, radii, font } from "@/src/theme";

const OXFORD = { lat: 34.365, lon: -89.5384 };
const EVENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "trivia", label: "Trivia" },
  { id: "live_music", label: "Live Music" },
  { id: "happy_hour", label: "Happy Hour" },
];

type Promo = {
  id: string; bar_id: string; bar_name: string; title: string; description: string;
  start_time: string; end_time: string; offers: { type: string; value: string }[];
  status: string; distance_miles?: number | null; image_url?: string; event_type: string;
};

export default function FeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [promos, setPromos] = useState<Promo[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState(OXFORD);

  const fetchLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }
    } catch {/* fallback to Oxford */}
  }, []);

  const fetchPromos = useCallback(async () => {
    const radius = user?.preferences?.radius_miles ?? 5;
    const params = new URLSearchParams({
      lat: String(coords.lat), lon: String(coords.lon), radius_miles: String(radius),
    });
    if (filter !== "all") params.append("event_type", filter);
    const data = await api<Promo[]>(`/promos?${params.toString()}`);
    setPromos(data);
  }, [coords, filter, user]);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  useFocusEffect(useCallback(() => {
    (async () => { setLoading(true); try { await fetchPromos(); } catch {} setLoading(false); })();
  }, [fetchPromos]));

  async function onRefresh() {
    setRefreshing(true);
    try { await fetchPromos(); } catch {}
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.location}>Oxford, MS · Ole Miss</Text>
          <Text style={styles.headerTitle} testID="feed-title">Tonight's Promos</Text>
        </View>
        <View style={styles.headerRight}>
          <Ionicons name="location" size={16} color={colors.brand} />
          <Text style={styles.headerRightText}>{user?.preferences?.radius_miles ?? 5}mi</Text>
        </View>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {EVENT_FILTERS.map((f) => (
            <Pressable
              key={f.id}
              testID={`chip-${f.id}`}
              onPress={() => setFilter(f.id)}
              style={[styles.chip, filter === f.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl tintColor={colors.brand} refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : promos.length === 0 ? (
          <View style={styles.empty} testID="feed-empty">
            <Ionicons name="wine-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No promos nearby</Text>
            <Text style={styles.emptySub}>Try increasing your radius from Profile → Preferences.</Text>
          </View>
        ) : (
          promos.map((p) => (
            <Pressable
              key={p.id}
              testID={`promo-card-${p.id}`}
              onPress={() => router.push(`/promo/${p.id}`)}
              style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
            >
              <ImageBackground source={{ uri: p.image_url }} style={styles.cardImage} imageStyle={{ borderRadius: radii.lg }}>
                <LinearGradient
                  colors={["transparent", "rgba(10,17,31,0.2)", "rgba(10,17,31,0.95)"]}
                  locations={[0, 0.45, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cardBadgeWrap}>
                  <View style={styles.cardBadge}>
                    <Text style={styles.cardBadgeText}>{p.event_type.replace("_", " ").toUpperCase()}</Text>
                  </View>
                  {p.distance_miles != null && (
                    <View style={styles.distancePill}>
                      <Ionicons name="navigate" size={11} color={colors.onBrand} />
                      <Text style={styles.distancePillText}>{p.distance_miles} mi</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.barName}>{p.bar_name}</Text>
                  <Text style={styles.promoTitle} numberOfLines={2}>{p.title}</Text>
                  {p.offers[0] && <Text style={styles.offer}>· {p.offers[0].value}</Text>}
                </View>
              </ImageBackground>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", backgroundColor: colors.surface },
  location: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1 },
  headerTitle: { color: colors.onSurface, fontSize: font.size.xxl, fontWeight: "800", marginTop: 4 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border },
  headerRightText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  chipsWrap: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, fontWeight: "600" },
  chipTextActive: { color: colors.onBrand, fontWeight: "700" },
  card: { height: 230, marginBottom: spacing.lg, borderRadius: radii.lg, overflow: "hidden", backgroundColor: colors.surfaceSecondary },
  cardImage: { flex: 1, justifyContent: "flex-end" },
  cardBadgeWrap: { position: "absolute", top: spacing.md, left: spacing.md, right: spacing.md, flexDirection: "row", justifyContent: "space-between" },
  cardBadge: { backgroundColor: "rgba(206,17,38,0.95)", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.sm },
  cardBadgeText: { color: colors.onBrand, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  distancePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(10,17,31,0.7)", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill },
  distancePillText: { color: colors.onSurface, fontSize: 11, fontWeight: "700" },
  cardBody: { padding: spacing.lg },
  barName: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 0.5 },
  promoTitle: { color: colors.onSurface, fontSize: font.size.xl, fontWeight: "800", marginTop: 4 },
  offer: { color: colors.onSurfaceTertiary, fontSize: font.size.base, marginTop: 4 },
  empty: { alignItems: "center", marginTop: 80, paddingHorizontal: spacing.xl },
  emptyTitle: { color: colors.onSurface, fontSize: font.size.xl, fontWeight: "700", marginTop: spacing.lg },
  emptySub: { color: colors.onSurfaceTertiary, fontSize: font.size.base, textAlign: "center", marginTop: spacing.sm },
});
