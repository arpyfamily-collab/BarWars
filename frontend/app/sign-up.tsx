import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, spacing, radii, font } from "@/src/theme";

export default function SignUp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, updateMe } = useAuth();
  const params = useLocalSearchParams<{ location?: string; age?: string }>();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name || undefined);
      // Apply onboarding choices
      await updateMe({
        location_permission: params.location === "1",
        age_verified: params.age === "1",
        opt_in_status: params.location === "1",
      } as any);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}>
        <Text style={styles.eyebrow}>JOIN THE GROVE</Text>
        <Text style={styles.title} testID="signup-title">Create account</Text>
        <Text style={styles.sub}>Discover proximity promos near Ole Miss.</Text>

        <Text style={styles.label}>Name</Text>
        <TextInput testID="signup-name" style={styles.input} placeholder="Your name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
        <Text style={styles.label}>Email</Text>
        <TextInput testID="signup-email" style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="you@olemiss.edu" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} />
        <Text style={styles.label}>Password</Text>
        <TextInput testID="signup-password" style={styles.input} secureTextEntry placeholder="At least 8 characters" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} />

        {error && <Text style={styles.error} testID="signup-error">{error}</Text>}

        <Pressable testID="signup-submit" onPress={submit} disabled={loading} style={({ pressed }) => [styles.cta, { opacity: pressed || loading ? 0.85 : 1 }]}>
          <Text style={styles.ctaText}>{loading ? "Creating..." : "Create account"}</Text>
        </Pressable>

        <Pressable testID="signup-to-signin" onPress={() => router.push("/sign-in")} style={{ alignItems: "center", marginTop: spacing.lg }}>
          <Text style={styles.linkText}>Already have an account? <Text style={{ color: colors.brand, fontWeight: "700" }}>Sign in</Text></Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brand, fontSize: font.size.sm, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.onSurface, fontSize: font.size.display, fontWeight: "800", marginTop: spacing.sm },
  sub: { color: colors.onSurfaceTertiary, fontSize: font.size.lg, marginTop: spacing.sm, marginBottom: spacing.lg },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: font.size.lg,
  },
  cta: { marginTop: spacing.xl, backgroundColor: colors.brand, height: 56, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
  linkText: { color: colors.onSurfaceTertiary, fontSize: font.size.base },
  error: { color: colors.error, marginTop: spacing.md, fontSize: font.size.sm },
});
