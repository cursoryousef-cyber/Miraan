import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { hasPermission, RBACAction, RBACScope } from '../utils/rbac';

export interface UserOrg {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isPrimary?: boolean;
  parentId?: string | null;
  parentNameAr?: string | null;
}

export interface UserProfile {
  id: string;
  personId: string;
  nameAr: string;
  nameEn?: string;
  nationalId?: string | null;
  phone?: string | null;
  isActive?: boolean;
  email: string;
  roles?: string[];
  permissions?: string[];
  capabilities?: string[];
  activeOrganization: UserOrg;
  availableOrganizations: UserOrg[];
}

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  primaryRole: string;
  login: (data: { user: UserProfile; tokens: { accessToken: string; refreshToken: string } }) => void;
  logout: () => void;
  switchOrganization: (orgId: string) => Promise<void>;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
  /** Whether the session holds a capability in the active context. */
  hasCapability: (capability: string) => boolean;
  /** Whether the session holds at least one of the capabilities. */
  hasAnyCapability: (capabilities: string[]) => boolean;
  /** @deprecated Role-derived guesswork — use hasCapability. */
  updateUser: (data: Partial<UserProfile>) => void;
  can: (action: RBACAction, scope: RBACScope) => boolean;
}

const STORAGE_KEY = 'user_profile';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function extractPrimaryRole(user: UserProfile | null): string {
  if (!user?.roles || user.roles.length === 0) return '';
  return user.roles[0];
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleAuthLogout = () => {
      setUser(null);
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'access_token' && !e.newValue) {
        setUser(null);
      }
    };
    window.addEventListener('auth:logout', handleAuthLogout);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const primaryRole = extractPrimaryRole(user);

  const login = (data: { user: UserProfile; tokens: { accessToken: string; refreshToken: string } }) => {
    localStorage.setItem('access_token', data.tokens.accessToken);
    localStorage.setItem('refresh_token', data.tokens.refreshToken);
    localStorage.setItem('active_org_id', data.user.activeOrganization.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user));
    setUser(data.user);
  };

  const logout = () => {
    localStorage.clear();
    setUser(null);
  };

  const switchOrganization = async (orgId: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/switch-org', { organizationId: orgId });
      const { activeOrganization, tokens, roles, permissions, capabilities } = res.data;

      localStorage.setItem('access_token', tokens.accessToken);
      localStorage.setItem('refresh_token', tokens.refreshToken);
      localStorage.setItem('active_org_id', activeOrganization.id);

      if (user) {
        const updatedUser: UserProfile = {
          ...user,
          activeOrganization,
          roles: roles || user.roles,
          permissions: permissions || user.permissions,
          // Replaced wholesale, never merged: capabilities belong to the context
          // just entered, and carrying the previous context's forward would grant
          // powers the backend will refuse.
          capabilities: capabilities ?? [],
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const hasRole = (role: string): boolean => {
    return user?.roles?.includes(role) ?? false;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some((r) => user?.roles?.includes(r) ?? false);
  };

  const hasCapability = (capability: string): boolean => {
    return user?.capabilities?.includes(capability) ?? false;
  };

  const hasAnyCapability = (capabilities: string[]): boolean => {
    return capabilities.some((c) => user?.capabilities?.includes(c) ?? false);
  };

  const updateUser = (data: Partial<UserProfile>) => {
    if (user) {
      const updatedUser: UserProfile = { ...user, ...data };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  const can = (action: RBACAction, scope: RBACScope): boolean => {
    return hasPermission(user, action, scope);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        primaryRole,
        login,
        logout,
        switchOrganization,
        hasRole,
        hasAnyRole,
        hasCapability,
        hasAnyCapability,
        updateUser,
        can,
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
