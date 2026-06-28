import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Admin {
  id: string;
  username: string;
  name: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  admin: Admin | null;
  token: string | null;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('antijudol_token'));
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const stored = localStorage.getItem('antijudol_admin');
    return stored ? JSON.parse(stored) : null;
  });

  const isAuthenticated = !!token && !!admin;

  const login = (newToken: string, newAdmin: Admin) => {
    localStorage.setItem('antijudol_token', newToken);
    localStorage.setItem('antijudol_admin', JSON.stringify(newAdmin));
    setToken(newToken);
    setAdmin(newAdmin);
  };

  const logout = () => {
    localStorage.removeItem('antijudol_token');
    localStorage.removeItem('antijudol_admin');
    setToken(null);
    setAdmin(null);
  };

  // Auto-logout jika token expired (opsional: parse JWT exp)
  useEffect(() => {
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && Date.now() / 1000 > payload.exp) {
        logout();
      }
    } catch {
      // Token tidak valid
      logout();
    }
  }, [token]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, admin, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
