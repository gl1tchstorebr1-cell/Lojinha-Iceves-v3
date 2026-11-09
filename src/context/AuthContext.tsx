import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api, setApiUserId } from '../services/api';
import { initialUsers } from '../server/seedData';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isAdmin: boolean;
  isCashier: boolean;
  isStudent: boolean;
  isGuardian: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  switchPersona: (userId: string) => void;
  allDemoUsers: User[];
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
        // fallback
      }
    }
    // Default to Admin for immediate exploration
    const defaultUser = initialUsers[0];
    setApiUserId(defaultUser.id);
    return defaultUser;
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
    try {
      const res = await api.login(email, password);
      setUser(res.user);
      setApiUserId(res.user.id);
    } catch (err: any) {
      // If server check fails or offline, match demo user
      const matched = initialUsers.find(
        u => u.email.toLowerCase() === email.toLowerCase() || u.name.toLowerCase().includes(email.toLowerCase())
      );
      if (matched) {
        setUser(matched);
        setApiUserId(matched.id);
        return;
      }
      throw err;
    }
  };

  const logout = () => {
    setUser(null);
  };

  const switchPersona = (userId: string) => {
    const found = initialUsers.find(u => u.id === userId);
    if (found) {
      setUser(found);
      setApiUserId(found.id);
    }
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
        logout,
        switchPersona,
        allDemoUsers: initialUsers
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
