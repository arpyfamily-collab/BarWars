import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: Platform.OS === "ios" ? "rgba(10,17,31,0.7)" : colors.surfaceSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarBackground: () =>
          Platform.OS === "ios" ? <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} /> : null,
        tabBarIcon: ({ color, size, focused }) => {
          const map: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
            index: ["flame", "flame-outline"],
            bars: ["beer", "beer-outline"],
            tickets: ["qr-code", "qr-code-outline"],
            profile: ["person", "person-outline"],
          };
          const [solid, outline] = map[route.name] || ["ellipse", "ellipse-outline"];
          return <Ionicons name={focused ? solid : outline} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Feed" }} />
      <Tabs.Screen name="bars" options={{ title: "Bars" }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
