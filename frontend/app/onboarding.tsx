import React, { useState } from "react";
import { View, Text, StyleSheet, Switch, Pressable, ImageBackground, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, spacing, radii, font } from "@/src/theme";

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [location, setLocation] = useState(true);
  const [age, setAge] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1570872626485-d8ffea69f463?w=1200" }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(10,17,31,0.6)", colors.surface]}
        locations={[0, 0.5, 0.85]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}>
        <View style={{ flex: 1 }} />
        <Text style={styles.eyebrow} testID="onboarding-eyebrow">OLE MISS NIGHTLIFE</Text>
        <Text style={styles.title} testID="onboarding-title">Promos that find you.</Text>
        <Text style={styles.subtitle}>
          Consent-first proximity promos from your favorite bars near campus. Your data stays yours.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Location-based promos</Text>
              <Text style={styles.rowSub}>Get offers from bars within your chosen radius.</Text>
            </View>
            <Switch
              testID="toggle-location"
              value={location}
              onValueChange={(v) => { setLocation(v); Haptics.selectionAsync(); }}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              thumbColor="#fff"
            />
          </View>
          <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>I am 21+</Text>
              <Text style={styles.rowSub}>Required to view alcohol-related offers.</Text>
            </View>
            <Switch
              testID="toggle-age"
              value={age}
              onValueChange={(v) => { setAge(v); Haptics.selectionAsync(); }}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Pressable
          testID="onboarding-continue"
          style={({ pressed }) => [styles.cta, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: "/sign-up", params: { location: location ? "1" : "0", age: age ? "1" : "0" } });
          }}
        >
          <Text style={styles.ctaText}>Get started</Text>
        </Pressable>

        <Pressable testID="onboarding-signin" onPress={() => router.push("/sign-in")} style={{ alignItems: "center", marginTop: spacing.lg }}>
          <Text style={styles.linkText}>Already have an account? <Text style={{ color: colors.brand, fontWeight: "700" }}>Sign in</Text></Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, fontSize: font.size.sm, letterSpacing: 2, fontWeight: "700", marginBottom: spacing.sm },
  title: { color: colors.onSurface, fontSize: font.size.display, fontWeight: "800", lineHeight: 38 },
  subtitle: { color: colors.onSurfaceTertiary, fontSize: font.size.lg, marginTop: spacing.md, lineHeight: 22 },
  card: {
    backgroundColor: "rgba(20,33,61,0.85)",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xxl,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md },
  rowTitle: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "600" },
  rowSub: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 2 },
  cta: {
    marginTop: spacing.xl,
    backgroundColor: colors.brand,
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
  linkText: { color: colors.onSurfaceTertiary, fontSize: font.size.base },
});
