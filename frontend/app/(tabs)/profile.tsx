import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/src/auth/AuthContext";
import { api } from "@/src/api/client";
import { colors, spacing, radii, font } from "@/src/theme";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut, updateMe } = useAuth();
  const [radius, setRadius] = useState(String(user?.preferences?.radius_miles ?? 2.5));
  const [smsOn, setSmsOn] = useState(user?.preferences?.channels.includes("sms") ?? false);
  const [pushOn, setPushOn] = useState(user?.preferences?.channels.includes("push") ?? true);
  const [smsMsg, setSmsMsg] = useState<string | null>(null);

  async function savePrefs() {
    const channels: string[] = [];
    if (pushOn) channels.push("push");
    if (smsOn) channels.push("sms");
    await updateMe({
      preferences: {
        radius_miles: parseFloat(radius) || 2.5,
        event_types: user?.preferences?.event_types ?? ["trivia", "live_music", "happy_hour"],
        channels,
      },
    } as any);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: insets.top + spacing.lg, paddingBottom: 100 }}>
        <View style={styles.headerBlock}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name?.[0] || user?.email?.[0] || "?").toUpperCase()}</Text>
          </View>
          <Text style={styles.name} testID="profile-name">{user?.name ?? user?.email}</Text>
          <Text style={styles.role}>{user?.role === "bar_admin" ? "Bar Admin" : "Member"}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Phone</Text>
          {user?.phone_verified ? (
            <View>
              <View style={styles.row}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={[styles.rowText, { marginLeft: spacing.sm }]} testID="profile-phone">{user?.phone}</Text>
              </View>
              <Pressable
                testID="send-test-sms"
                onPress={async () => {
                  setSmsMsg(null);
                  try {
                    await api("/sms/test", { method: "POST" });
                    setSmsMsg("Test SMS sent.");
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (e: any) { setSmsMsg(e.message || "SMS failed"); }
                }}
                style={[styles.saveBtn, { marginTop: spacing.md }]}
              >
                <Text style={styles.saveBtnText}>Send test SMS</Text>
              </Pressable>
              {smsMsg && <Text style={[styles.rowText, { color: colors.brand, marginTop: spacing.sm }]} testID="sms-result">{smsMsg}</Text>}
            </View>
          ) : (
            <Pressable testID="verify-phone-cta" style={styles.row} onPress={() => router.push("/verify-phone")}>
              <Ionicons name="phone-portrait" size={22} color={colors.brand} />
              <Text style={styles.rowText}>Verify phone for SMS alerts</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {user?.role === "bar_admin" && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin</Text>
            <Pressable testID="admin-create-promo" style={styles.row} onPress={() => router.push("/admin/create")}>
              <Ionicons name="add-circle" size={22} color={colors.brand} />
              <Text style={styles.rowText}>Create new promo</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
            <Pressable testID="admin-analytics" style={styles.row} onPress={() => router.push("/admin/analytics")}>
              <Ionicons name="stats-chart" size={22} color={colors.brand} />
              <Text style={styles.rowText}>Analytics dashboard</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.row}>
            <Text style={styles.rowText}>Radius (mi)</Text>
            <TextInput
              testID="profile-radius-input"
              value={radius}
              onChangeText={setRadius}
              keyboardType="decimal-pad"
              style={styles.smallInput}
              placeholderTextColor={colors.muted}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowText}>Push notifications</Text>
            <Switch testID="toggle-push" value={pushOn} onValueChange={setPushOn} trackColor={{ true: colors.brand, false: colors.surfaceTertiary }} thumbColor="#fff" />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowText}>SMS alerts</Text>
            <Switch testID="toggle-sms" value={smsOn} onValueChange={setSmsOn} trackColor={{ true: colors.brand, false: colors.surfaceTertiary }} thumbColor="#fff" />
          </View>
          <Pressable testID="save-prefs" onPress={savePrefs} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save preferences</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy & Consent</Text>
          <View style={styles.row}>
            <Text style={styles.rowText}>Age verified (21+)</Text>
            <Switch
              testID="toggle-age-verified"
              value={user?.age_verified ?? false}
              onValueChange={(v) => updateMe({ age_verified: v } as any)}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowText}>Location permission</Text>
            <Switch
              testID="toggle-location-perm"
              value={user?.location_permission ?? false}
              onValueChange={(v) => updateMe({ location_permission: v } as any)}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowText}>Opt-in for promos</Text>
            <Switch
              testID="toggle-opt-in"
              value={user?.opt_in_status ?? false}
              onValueChange={(v) => updateMe({ opt_in_status: v } as any)}
              trackColor={{ true: colors.brand, false: colors.surfaceTertiary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <Pressable testID="signout-button" onPress={async () => { await signOut(); router.replace("/onboarding"); }} style={styles.signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { alignItems: "center", marginBottom: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.onBrand, fontSize: 32, fontWeight: "800" },
  name: { color: colors.onSurface, fontSize: font.size.xl, fontWeight: "700", marginTop: spacing.md },
  role: { color: colors.brand, fontSize: font.size.sm, fontWeight: "600", marginTop: 4, letterSpacing: 1 },
  section: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { color: colors.brand, fontSize: font.size.sm, fontWeight: "700", letterSpacing: 1, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { color: colors.onSurface, fontSize: font.size.base, flex: 1 },
  smallInput: { color: colors.onSurface, backgroundColor: colors.surfaceTertiary, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: 6, minWidth: 70, textAlign: "center" },
  saveBtn: { marginTop: spacing.md, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radii.pill, alignItems: "center" },
  saveBtnText: { color: colors.onBrand, fontWeight: "700" },
  signOut: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.error },
  signOutText: { color: colors.error, fontWeight: "700" },
});
