"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: number;
  email: string;
  username: string;
  avatar_url: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  login: (token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();

  const fetchUser = async (authToken: string) => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/users/me", {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        setUser(await res.json());
      } else {
        logout(); 
      }
    } catch (e) {
      console.error("Failed to fetch user profile");
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("cogito_token");
    if (savedToken) {
      setToken(savedToken);
      fetchUser(savedToken);
    }
    setIsLoaded(true);
  }, []);

  const login = (newToken: string) => {
    localStorage.setItem("cogito_token", newToken);
    setToken(newToken);
    fetchUser(newToken); 
    router.push("/");
  };

  const logout = () => {
    localStorage.removeItem("cogito_token");
    setToken(null);
    setUser(null);
    router.push("/login");
  };

  if (!isLoaded) return null;

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
