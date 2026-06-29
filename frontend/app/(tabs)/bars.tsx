import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii, font } from "@/src/theme";

type Bar = { id: string; name: string; description: string; campus_area: string; image_url?: string; rating: number; distance_miles?: number | null };

export default function BarsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [bars, setBars] = useState<Bar[]>([]);

  useFocusEffect(useCallback(() => {
    (async () => {
      try {
        const data = await api<Bar[]>(`/bars?lat=34.365&lon=-89.5384`);
        setBars(data);
      } catch {}
    })();
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: insets.top + spacing.md, paddingBottom: spacing.md }}>
        <Text style={styles.eyebrow}>NEAR THE SQUARE</Text>
        <Text style={styles.title} testID="bars-title">Partner Bars</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {bars.map((b) => (
          <Pressable
            key={b.id}
            testID={`bar-card-${b.id}`}
            onPress={() => router.push({ pathname: "/(tabs)", params: { bar: b.id } })}
            style={styles.row}
          >
            <Image source={{ uri: b.image_url }} style={styles.thumb} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.barName}>{b.name}</Text>
              <Text style={styles.barDesc} numberOfLines={2}>{b.description}</Text>
              <View style={styles.meta}>
                <View style={styles.metaPill}>
                  <Ionicons name="star" size={11} color="#F59E0B" />
                  <Text style={styles.metaText}>{b.rating.toFixed(1)}</Text>
                </View>
                {b.distance_miles != null && (
                  <View style={styles.metaPill}>
                    <Ionicons name="navigate" size={11} color={colors.brand} />
                    <Text style={styles.metaText}>{b.distance_miles} mi</Text>
                  </View>
                )}
                <View style={styles.metaPill}>
                  <Ionicons name="location" size={11} color={colors.muted} />
                  <Text style={styles.metaText}>{b.campus_area}</Text>
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1 },
  title: { color: colors.onSurface, fontSize: font.size.xxl, fontWeight: "800", marginTop: 4 },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  thumb: { width: 80, height: 80, borderRadius: radii.md, backgroundColor: colors.surfaceTertiary },
  barName: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700" },
  barDesc: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 4 },
  meta: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, flexWrap: "wrap" },
  metaPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  metaText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "600" },
});
