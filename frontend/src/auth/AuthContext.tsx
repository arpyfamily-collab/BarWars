import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, getToken } from "../api/client";

export type Preferences = {
  radius_miles: number;
  event_types: string[];
  channels: string[];
};

export type User = {
  id: string;
  email: string;
  name?: string;
  role: "user" | "bar_admin";
  age_verified: boolean;
  location_permission: boolean;
  opt_in_status: boolean;
  preferences: Preferences;
  loyalty_points: number;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  updateMe: (patch: Partial<User> & { preferences?: Preferences }) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const u = await api<User>("/auth/me");
      setUser(u);
    } catch {
      setUser(null);
      await clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (t) {
        await refresh();
      }
      setLoading(false);
    })();
  }, [refresh]);

  async function signIn(email: string, password: string) {
    const res = await api<{ access_token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    await setToken(res.access_token);
    setUser(res.user);
  }

  async function signUp(email: string, password: string, name?: string) {
    const res = await api<{ access_token: string; user: User }>("/auth/register", {
      method: "POST",
      body: { email, password, name },
      auth: false,
    });
    await setToken(res.access_token);
    setUser(res.user);
  }

  async function signOut() {
    await clearToken();
    setUser(null);
  }

  async function updateMe(patch: any) {
    const u = await api<User>("/users/me", { method: "PATCH", body: patch });
    setUser(u);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, refresh, updateMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
