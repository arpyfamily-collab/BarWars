import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { colors, spacing, radii, font } from "@/src/theme";

export default function VerifyPhone() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh, user } = useAuth();
  const [phone, setPhone] = useState(user?.phone ?? "+1");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"enter" | "code">("enter");
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const s = await api<{ configured: boolean }>("/sms/status", { auth: false });
        setSmsConfigured(s.configured);
      } catch { setSmsConfigured(false); }
    })();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send() {
    setError(null); setInfo(null); setLoading(true);
    try {
      await api("/sms/otp/send", { method: "POST", body: { phone } });
      setStage("code"); setCooldown(60);
      setInfo("Code sent. Check your phone.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  async function verify() {
    setError(null); setInfo(null); setLoading(true);
    try {
      await api("/sms/otp/verify", { method: "POST", body: { phone, code } });
      await refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  function skip() { router.replace("/(tabs)"); }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: spacing.xl, paddingTop: insets.top + spacing.xxl }}>
        <View style={styles.iconWrap}>
          <Ionicons name="phone-portrait" size={36} color={colors.brand} />
        </View>
        <Text style={styles.eyebrow}>VERIFY YOUR PHONE</Text>
        <Text style={styles.title} testID="verify-phone-title">SMS alerts (optional)</Text>
        <Text style={styles.sub}>
          Get a text when a partner bar near you drops a new promo. We never share your number.
        </Text>

        {smsConfigured === false && (
          <View style={styles.warn} testID="sms-not-configured">
            <Ionicons name="information-circle" size={18} color={colors.warning} />
            <Text style={styles.warnText}>SMS is not configured yet on this server. You can skip for now.</Text>
          </View>
        )}

        {stage === "enter" ? (
          <>
            <Text style={styles.label}>Phone (E.164)</Text>
            <TextInput
              testID="phone-input"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+16625551234"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />
            <Text style={styles.hint}>Format: + country code + number, no spaces.</Text>

            <Pressable
              testID="send-otp-button"
              onPress={send}
              disabled={loading || smsConfigured === false}
              style={({ pressed }) => [styles.cta, { opacity: pressed || loading || smsConfigured === false ? 0.6 : 1 }]}
            >
              <Text style={styles.ctaText}>{loading ? "Sending..." : "Send verification code"}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              testID="otp-input"
              style={[styles.input, { letterSpacing: 8, textAlign: "center", fontSize: 24 }]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor={colors.muted}
              maxLength={6}
            />
            <Pressable
              testID="verify-otp-button"
              onPress={verify}
              disabled={loading || code.length !== 6}
              style={({ pressed }) => [styles.cta, { opacity: pressed || loading || code.length !== 6 ? 0.6 : 1 }]}
            >
              <Text style={styles.ctaText}>{loading ? "Verifying..." : "Verify"}</Text>
            </Pressable>

            <Pressable
              testID="resend-otp"
              onPress={send}
              disabled={cooldown > 0}
              style={{ alignItems: "center", marginTop: spacing.lg }}
            >
              <Text style={[styles.linkText, cooldown > 0 && { opacity: 0.5 }]}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </Text>
            </Pressable>
          </>
        )}

        {error && <Text style={styles.error} testID="verify-phone-error">{error}</Text>}
        {info && !error && <Text style={styles.info}>{info}</Text>}

        <Pressable testID="skip-phone" onPress={skip} style={{ alignItems: "center", marginTop: spacing.xxl }}>
          <Text style={styles.linkText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.borderStrong, marginBottom: spacing.lg },
  eyebrow: { color: colors.brand, fontSize: font.size.sm, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.onSurface, fontSize: font.size.display, fontWeight: "800", marginTop: spacing.sm },
  sub: { color: colors.onSurfaceTertiary, fontSize: font.size.lg, marginTop: spacing.sm, marginBottom: spacing.xl, lineHeight: 22 },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: "600" },
  input: {
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: font.size.lg,
  },
  hint: { color: colors.muted, fontSize: font.size.sm, marginTop: spacing.sm },
  warn: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(245,158,11,0.1)", padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.warning, marginBottom: spacing.lg },
  warnText: { color: colors.warning, flex: 1, fontSize: font.size.sm },
  cta: { marginTop: spacing.xl, backgroundColor: colors.brand, height: 56, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
  linkText: { color: colors.onSurfaceTertiary, fontSize: font.size.base },
  error: { color: colors.error, marginTop: spacing.md, fontSize: font.size.sm },
  info: { color: colors.success, marginTop: spacing.md, fontSize: font.size.sm },
});
