import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radii, font } from "@/src/theme";

type Bar = { id: string; name: string };
const EVENT_TYPES = ["trivia", "happy_hour", "live_music"];

export default function AdminCreate() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bars, setBars] = useState<Bar[]>([]);
  const [barId, setBarId] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [hours, setHours] = useState("4");
  const [eventType, setEventType] = useState("happy_hour");
  const [offerValue, setOfferValue] = useState("");
  const [radius, setRadius] = useState("2.5");
  const [maxRecipients, setMaxRecipients] = useState("200");
  const [imageUrl, setImageUrl] = useState("https://images.unsplash.com/photo-1546726747-421c6d69c929?w=800");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await api<Bar[]>("/bars");
      setBars(data);
      if (data[0]) setBarId(data[0].id);
    })();
  }, []);

  async function submit() {
    setError(null);
    if (!title || !desc || !barId || !offerValue) { setError("Please fill all required fields"); return; }
    setLoading(true);
    try {
      const start = new Date();
      const end = new Date(Date.now() + parseFloat(hours) * 3600 * 1000);
      await api("/promos", {
        method: "POST",
        body: {
          bar_id: barId, title, description: desc,
          start_time: start.toISOString(), end_time: end.toISOString(),
          offers: [{ type: "drink", value: offerValue }],
          max_recipients: parseInt(maxRecipients, 10) || 200,
          radius_miles: parseFloat(radius) || 2.5,
          event_type: eventType, is_alcohol: true, image_url: imageUrl,
        },
      });
      router.replace("/admin/analytics");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="admin-create-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>New Promo</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <Text style={styles.label}>Bar</Text>
        <View style={styles.pillRow}>
          {bars.map((b) => (
            <Pressable key={b.id} testID={`bar-pick-${b.id}`} onPress={() => setBarId(b.id)} style={[styles.pill, barId === b.id && styles.pillActive]}>
              <Text style={[styles.pillText, barId === b.id && styles.pillTextActive]}>{b.name}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Title *</Text>
        <TextInput testID="promo-title-input" style={styles.input} value={title} onChangeText={setTitle} placeholder="Trivia Night Happy Hour" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Description *</Text>
        <TextInput testID="promo-desc-input" style={[styles.input, { height: 90, textAlignVertical: "top" }]} value={desc} onChangeText={setDesc} multiline placeholder="2-for-1 craft beer..." placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Offer *</Text>
        <TextInput testID="promo-offer-input" style={styles.input} value={offerValue} onChangeText={setOfferValue} placeholder="2-for-1 craft beer" placeholderTextColor={colors.muted} />

        <Text style={styles.label}>Event type</Text>
        <View style={styles.pillRow}>
          {EVENT_TYPES.map((t) => (
            <Pressable key={t} testID={`event-${t}`} onPress={() => setEventType(t)} style={[styles.pill, eventType === t && styles.pillActive]}>
              <Text style={[styles.pillText, eventType === t && styles.pillTextActive]}>{t.replace("_", " ")}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.gridRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Hours active</Text>
            <TextInput testID="promo-hours" style={styles.input} value={hours} onChangeText={setHours} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Radius (mi)</Text>
            <TextInput testID="promo-radius" style={styles.input} value={radius} onChangeText={setRadius} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Max recip.</Text>
            <TextInput testID="promo-max" style={styles.input} value={maxRecipients} onChangeText={setMaxRecipients} keyboardType="number-pad" />
          </View>
        </View>

        <Text style={styles.label}>Image URL</Text>
        <TextInput testID="promo-image" style={styles.input} value={imageUrl} onChangeText={setImageUrl} placeholderTextColor={colors.muted} autoCapitalize="none" />

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable testID="publish-promo" disabled={loading} onPress={submit} style={({ pressed }) => [styles.cta, { opacity: pressed || loading ? 0.85 : 1 }]}>
          <Text style={styles.ctaText}>{loading ? "Publishing..." : "Publish Promo"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: font.size.lg, fontWeight: "700" },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600", marginTop: spacing.lg, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: font.size.base },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  pill: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  pillText: { color: colors.onSurfaceTertiary, fontWeight: "600", textTransform: "capitalize" },
  pillTextActive: { color: colors.onBrand, fontWeight: "700" },
  gridRow: { flexDirection: "row", gap: spacing.md },
  error: { color: colors.error, marginTop: spacing.md },
  ctaWrap: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: "rgba(10,17,31,0.95)", borderTopWidth: 1, borderTopColor: colors.border },
  cta: { backgroundColor: colors.brand, height: 56, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrand, fontSize: font.size.lg, fontWeight: "700" },
});
