import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, spacing, radii, font } from "@/src/theme";

export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}>
        <Text style={styles.eyebrow}>WELCOME BACK</Text>
        <Text style={styles.title} testID="signin-title">Sign in</Text>
        <Text style={styles.sub}>Use your email and password.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          testID="signin-email"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@olemiss.edu"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="signin-password"
          style={styles.input}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
        />

        {error && <Text style={styles.error} testID="signin-error">{error}</Text>}

        <Pressable testID="signin-submit" onPress={submit} disabled={loading} style={({ pressed }) => [styles.cta, { opacity: pressed || loading ? 0.85 : 1 }]}>
          <Text style={styles.ctaText}>{loading ? "Signing in..." : "Sign in"}</Text>
        </Pressable>

        <Pressable testID="signin-to-signup" onPress={() => router.push("/sign-up")} style={{ alignItems: "center", marginTop: spacing.lg }}>
          <Text style={styles.linkText}>New here? <Text style={{ color: colors.brand, fontWeight: "700" }}>Create account</Text></Text>
        </Pressable>

        <View style={styles.hint}>
          <Text style={styles.hintTitle}>Demo accounts</Text>
          <Text style={styles.hintText}>Admin: admin@olemiss.app / Admin123!</Text>
          <Text style={styles.hintText}>Student: student@olemiss.app / Student123!</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, fontSize: font.size.sm, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.onSurface, fontSize: font.size.display, fontWeight: "800", marginTop: spacing.sm },
  sub: { color: colors.onSurfaceTertiary, fontSize: font.size.lg, marginTop: spacing.sm, marginBottom: spacing.xl },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: font.size.lg,
  },
  cta: { marginTop: spacing.xl, backgroundColor: colors.brand, height: 56, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
  linkText: { color: colors.onSurfaceTertiary, fontSize: font.size.base },
  error: { color: colors.error, marginTop: spacing.md, fontSize: font.size.sm },
  hint: { marginTop: spacing.xxl, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  hintTitle: { color: colors.onSurface, fontWeight: "700", marginBottom: spacing.sm },
  hintText: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginVertical: 2 },
});
