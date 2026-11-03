import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';

export interface User {
  id: string;
  name: string;
  email: string;
  accountType: 'mei' | 'pessoa_fisica';
  workspaceId?: string;
}

export interface Entity {
  id: string;
  kind: 'pf' | 'pj';
  name: string;
  cnpj?: string | null;
  legalName?: string | null;
  openedOn?: string | null;
  activity?: 'comercio' | 'servicos' | 'misto' | null;
  isMei: boolean;
  profileComplete: boolean;
}

export interface WorkspaceOverview {
  workspace: {
    id: string;
    name: string;
    plan: string;
    createdAt: string;
  };
  role: string;
  entities: Entity[];
  defaultEntityIds: {
    pf: string;
    pj?: string;
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  workspace: WorkspaceOverview | null;
  loading: boolean;
  activeEntityId: string | undefined;
  setActiveEntityId: (id: string | undefined) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, accountType: 'mei' | 'pessoa_fisica') => Promise<void>;
  logout: () => void;
  refreshWorkspace: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('meister_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('meister_token'));
  const [workspace, setWorkspace] = useState<WorkspaceOverview | null>(null);
  const [activeEntityId, setActiveEntityId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await api.get('/workspace');
      setWorkspace(res.data);
      if (!activeEntityId && res.data.entities.length > 0) {
        // Default to PJ if MEI, otherwise PF
        const pj = res.data.entities.find((e: Entity) => e.kind === 'pj');
        setActiveEntityId(pj ? pj.id : res.data.entities[0].id);
      }
    } catch {
      // Ignored if unauthenticated
    }
  }, [activeEntityId]);

  useEffect(() => {
    if (token) {
      fetchWorkspace().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, fetchWorkspace]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/login', { email, password });
    const { token: receivedToken, user: receivedUser } = res.data;
    localStorage.setItem('meister_token', receivedToken);
    localStorage.setItem('meister_user', JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
    await fetchWorkspace();
  };

  const register = async (name: string, email: string, password: string, accountType: 'mei' | 'pessoa_fisica') => {
    await api.post('/register', { name, email, password, accountType });
    await login(email, password);
  };

  const logout = () => {
    localStorage.removeItem('meister_token');
    localStorage.removeItem('meister_user');
    setToken(null);
    setUser(null);
    setWorkspace(null);
    window.location.href = '/login';
  };

  const refreshWorkspace = async () => {
    await fetchWorkspace();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        workspace,
        loading,
        activeEntityId,
        setActiveEntityId,
        login,
        register,
        logout,
        refreshWorkspace,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
