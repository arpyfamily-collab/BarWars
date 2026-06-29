import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api/client";
import { colors, spacing, radii, font } from "@/src/theme";

type QR = { code: string; promo_id: string; user_id: string; valid_until: string; is_redeemed: boolean };

export default function QRScreen() {
  const { promoId } = useLocalSearchParams<{ promoId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [qr, setQr] = useState<QR | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  const [redeemed, setRedeemed] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<QR>(`/promos/${promoId}/qr`, { method: "POST" });
        setQr(data);
        setRedeemed(data.is_redeemed);
      } catch (e: any) { setError(e.message); }
    })();
  }, [promoId]);

  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => {
      const diff = new Date(qr.valid_until).getTime() - Date.now();
      if (diff <= 0) { setCountdown("Expired"); return; }
      const h = Math.floor(diff / 3.6e6);
      const m = Math.floor((diff % 3.6e6) / 6e4);
      const s = Math.floor((diff % 6e4) / 1e3);
      setCountdown(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [qr]);

  async function selfRedeem() {
    if (!qr) return;
    setRedeeming(true);
    try {
      await api(`/qrcodes/${qr.code}/redeem`, { method: "POST" });
      setRedeemed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { setError(e.message); }
    setRedeeming(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="qr-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Redemption QR</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.eyebrow}>SHOW TO STAFF</Text>
        <Text style={styles.title}>{redeemed ? "Already redeemed" : "Scan at the bar"}</Text>

        <View style={styles.qrFrame} testID="qr-frame">
          {qr ? (
            <View style={[styles.qrPad, redeemed && { opacity: 0.3 }]}>
              <QRCode value={qr.code} size={220} backgroundColor="#FFFFFF" color="#0A111F" />
            </View>
          ) : error ? (
            <Text style={[styles.statusText, { color: colors.error }]} testID="qr-error">{error}</Text>
          ) : (
            <ActivityIndicator color={colors.brand} />
          )}
        </View>

        {qr && (
          <>
            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>CODE</Text>
              <Text style={styles.code} testID="qr-code">{qr.code}</Text>
            </View>
            <View style={styles.statusRow}>
              <Ionicons name={redeemed ? "checkmark-circle" : "time"} size={18} color={redeemed ? colors.success : colors.brand} />
              <Text style={styles.statusText}>
                {redeemed ? "Redeemed" : `Expires in ${countdown}`}
              </Text>
            </View>
          </>
        )}

        {!redeemed && qr && (
          <Pressable
            testID="qr-mark-redeemed"
            disabled={redeeming}
            onPress={selfRedeem}
            style={({ pressed }) => [styles.cta, { opacity: pressed || redeeming ? 0.85 : 1 }]}
          >
            <Text style={styles.ctaText}>{redeeming ? "Redeeming..." : "Staff: Tap to redeem"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  eyebrow: { color: colors.brand, letterSpacing: 2, fontWeight: "800", fontSize: font.size.sm },
  title: { color: colors.onSurface, fontSize: font.size.xxl, fontWeight: "800", marginTop: spacing.sm, marginBottom: spacing.xl },
  qrFrame: { padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderStrong },
  qrPad: { padding: spacing.lg, backgroundColor: colors.surfaceInverse, borderRadius: radii.md },
  codeRow: { marginTop: spacing.xl, alignItems: "center" },
  codeLabel: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 2 },
  code: { color: colors.onSurface, fontSize: font.size.xxl, fontWeight: "800", letterSpacing: 4, marginTop: spacing.xs },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill },
  statusText: { color: colors.onSurface, fontWeight: "600" },
  cta: { marginTop: spacing.xl, backgroundColor: colors.brand, paddingHorizontal: spacing.xl, height: 56, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
});
