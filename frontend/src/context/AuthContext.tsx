"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api, registerTokenProvider } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string | null;
  is_admin?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applyToken = (token: string | null) => {
    registerTokenProvider(() => Promise.resolve(token));
  };

  // Restore session from localStorage on mount
  useEffect(() => {
    const token = window.localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    applyToken(token);
    api
      .me()
      .then((me) => setUser(me))
      .catch(() => {
        window.localStorage.removeItem("token");
        applyToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password);
    window.localStorage.setItem("token", data.access_token);
    applyToken(data.access_token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, fullName?: string) => {
    const data = await api.register(email, password, fullName);
    window.localStorage.setItem("token", data.access_token);
    applyToken(data.access_token);
    setUser(data.user);
  };

  const logout = () => {
    window.localStorage.removeItem("token");
    applyToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

