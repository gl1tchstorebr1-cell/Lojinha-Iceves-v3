import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api, setApiUserId } from '../services/api';
import { supabase } from '../services/supabaseClient';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAdmin: boolean;
  isCashier: boolean;
  isStudent: boolean;
  isGuardian: boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (userData: { email: string; password: string; name: string; role?: UserRole; phone?: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('campus_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setApiUserId(parsed.id);
        return parsed;
      } catch (e) {
        localStorage.removeItem('campus_user');
      }
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('campus_user', JSON.stringify(user));
      setApiUserId(user.id);
    } else {
      localStorage.removeItem('campus_user');
      setApiUserId('');
    }
  }, [user]);

  const login = async (email: string, password?: string) => {
    const cleanEmail = email.trim();
    const cleanPass = password?.trim() || '';

    if (cleanEmail.includes('@') && cleanPass) {
      try {
        const { data: supaData, error: supaErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass,
        });

        if (supaData?.session?.user) {
          console.info('[Supabase Auth] Autenticado via Supabase com sucesso:', supaData.user.email);
        } else if (supaErr) {
          console.warn('[Supabase Auth] Informação da conexão Supabase:', supaErr.message);
        }
      } catch (err: any) {
        console.warn('[Supabase Auth] Tentando via banco do sistema:', err?.message);
      }
    }

    const res = await api.login(cleanEmail, cleanPass);
    setUser(res.user);
    setApiUserId(res.user.id);
  };

  const register = async (userData: { email: string; password: string; name: string; role?: UserRole; phone?: string }) => {
    const cleanEmail = userData.email.trim();
    const cleanPass = userData.password.trim();

    try {
      const { data: supaData, error: supaErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPass,
        options: {
          data: {
            name: userData.name.trim(),
            role: userData.role || 'STUDENT',
          }
        }
      });
      if (supaErr) {
        console.warn('[Supabase Auth SignUp]:', supaErr.message);
      } else if (supaData?.user) {
        console.info('[Supabase Auth SignUp] Conta provisionada no Supabase:', supaData.user.id);
      }
    } catch (err: any) {
      console.warn('[Supabase Auth] Falha no signup remoto:', err?.message);
    }

    const res = await api.register(userData);
    setUser(res.user);
    setApiUserId(res.user.id);
  };

  const logout = () => {
    try {
      supabase.auth.signOut().catch(() => {});
    } catch (e) {
      // ignore
    }
    setUser(null);
    localStorage.removeItem('campus_user');
    setApiUserId('');
  };

  const role = user?.role || null;
  const isAdmin = role === 'ADMIN';
  const isCashier = role === 'CASHIER' || role === 'ADMIN';
  const isStudent = role === 'STUDENT';
  const isGuardian = role === 'GUARDIAN';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin,
        isCashier,
        isStudent,
        isGuardian,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider');
  }
  return context;
}
