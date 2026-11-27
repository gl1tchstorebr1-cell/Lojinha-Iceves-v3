import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { User, UserRole } from '../types';
import { api, setApiAuthToken, setApiUnauthorizedHandler } from '../services/api';
import { supabase } from '../services/supabaseClient';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAdmin: boolean;
  isManager: boolean;
  canManage: boolean;
  isCashier: boolean;
  isStockist: boolean;
  isViewer: boolean;
  isStudent: boolean;
  isGuardian: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: { email: string; password: string; name: string; role?: UserRole; phone?: string }) => Promise<void>;
  setupInitialAdmin: (password: string, confirmPassword: string, email?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Sessão estritamente mantida em memória: nunca faz auto-login como administrador
  // e nunca persiste credenciais/tokens em localStorage ou sessionStorage.
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Limpa chaves legadas de auto-login de versões anteriores do navegador
    try {
      localStorage.removeItem('campus_user');
      sessionStorage.removeItem('campus_logged_out');
    } catch {
      // ignore
    }

    setApiUnauthorizedHandler(() => {
      setApiAuthToken(null);
      setUser(null);
    });

    return () => {
      setApiUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const cleanEmail = email.trim();
    const cleanPass = password.trim();

    const res = await api.login(cleanEmail, cleanPass);
    setApiAuthToken(res.token);
    setUser(res.user);
  }, []);

  const setupInitialAdmin = useCallback(async (password: string, confirmPassword: string, email?: string) => {
    const res = await api.setupInitialAdmin(password, confirmPassword, email);
    setApiAuthToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(
    async (userData: { email: string; password: string; name: string; role?: UserRole; phone?: string }) => {
      const res = await api.register(userData);
      setApiAuthToken(res.token);
      setUser(res.user);
    },
    []
  );

  const logout = useCallback(() => {
    void api.logout();
    try {
      supabase.auth.signOut().catch(() => {});
    } catch {
      // ignore
    }
    setApiAuthToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const role = user?.role || null;
    const isAdmin = role === 'ADMIN';
    const isManager = role === 'MANAGER';
    const canManage = role === 'ADMIN' || role === 'MANAGER';
    const isCashier = role === 'CASHIER' || role === 'MANAGER' || role === 'ADMIN';
    const isStockist = role === 'STOCKIST' || role === 'MANAGER' || role === 'ADMIN';
    const isViewer = role === 'VIEWER';
    const isStudent = role === 'STUDENT';
    const isGuardian = role === 'GUARDIAN';

    return {
      user,
      role,
      isAdmin,
      isManager,
      canManage,
      isCashier,
      isStockist,
      isViewer,
      isStudent,
      isGuardian,
      login,
      register,
      setupInitialAdmin,
      logout,
    };
  }, [user, login, register, setupInitialAdmin, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider');
  }
  return context;
}
