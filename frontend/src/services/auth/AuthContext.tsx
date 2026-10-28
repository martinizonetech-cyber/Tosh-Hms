import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Department, PortalRole } from '../../types/domain';
import { getAccessToken, getRefreshToken, onAuthExpired, requestJson, setAccessToken, setRefreshToken } from '../api/httpClient';
import { DATA_MODE } from '../repositories/mode';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: PortalRole;
  department?: Department | null;
  mustChangePassword?: boolean;
}

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  refreshToken?: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  role: PortalRole;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(DATA_MODE === 'api');
  const navigate = useNavigate();

  // Try restoring session via existing token or POST /auth/refresh (cookie) then GET /auth/me in API mode
  useEffect(() => {
    if (DATA_MODE !== 'api') {
      const demoRole = (sessionStorage.getItem('carehub-demo-role') as PortalRole) || 'reception';
      setUser({
        id: 'demo-user',
        email: `${demoRole}@demo.tosh`,
        displayName: demoRole === 'reception' ? 'Priya Sharma' : demoRole === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash',
        role: demoRole,
        department: demoRole === 'reception' ? null : (demoRole as Department),
        mustChangePassword: false,
      });
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const restoreSession = async () => {
      try {
        // Step 1: Check if an access token is already saved in session storage
        const existingToken = getAccessToken();
        if (existingToken) {
          try {
            const me = await requestJson<AuthUser>('/auth/me');
            if (isMounted) {
              setUser(me);
              setIsLoading(false);
              return;
            }
          } catch {
            // Access token expired, fall through to refresh
          }
        }

        // If on public routes and no prior token exists, don't probe /auth/refresh to avoid harmless 401 log
        const isPublicPath =
          window.location.pathname === '/' ||
          window.location.pathname === '' ||
          window.location.pathname === '/landing' ||
          window.location.pathname === '/login';

        if (!existingToken && isPublicPath) {
          if (isMounted) {
            setUser(null);
            setIsLoading(false);
          }
          return;
        }

        // Step 2: POST /auth/refresh using fallback body refresh token + cookie
        const storedRefreshToken = getRefreshToken();
        const refreshRes = await requestJson<{ accessToken: string; refreshToken?: string; user: AuthUser }>('/auth/refresh', {
          method: 'POST',
          body: storedRefreshToken ? JSON.stringify({ refreshToken: storedRefreshToken }) : undefined,
        });
        setAccessToken(refreshRes.accessToken);
        if (refreshRes.refreshToken) {
          setRefreshToken(refreshRes.refreshToken);
        }

        // Step 3: GET /auth/me to verify user profile
        const me = await requestJson<AuthUser>('/auth/me');
        if (isMounted) setUser(me);
      } catch {
        setAccessToken(null);
        setRefreshToken(null);
        if (isMounted) setUser(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const unsubscribe = onAuthExpired(() => {
      setUser(null);
      navigate('/login', { replace: true });
    });

    restoreSession();
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [navigate]);

  const login = async (email: string, password: string): Promise<AuthUser> => {
    if (DATA_MODE === 'mock') {
      const role: PortalRole = email.includes('skin') ? 'skin' : email.includes('ortho') ? 'orthopaedics' : 'reception';
      sessionStorage.setItem('carehub-demo-role', role);
      const mockUser: AuthUser = {
        id: 'demo-user',
        email,
        displayName: role === 'reception' ? 'Priya Sharma' : role === 'skin' ? 'Dr. Sangamitra' : 'Dr. Sundarprakash',
        role,
        department: role === 'reception' ? null : (role as Department),
      };
      setUser(mockUser);
      return mockUser;
    }

    const response = await requestJson<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });

    setAccessToken(response.accessToken);
    if (response.refreshToken) {
      setRefreshToken(response.refreshToken);
    }
    setUser(response.user);
    return response.user;
  };

  const logout = async (): Promise<void> => {
    if (DATA_MODE === 'api') {
      try {
        const storedRefreshToken = getRefreshToken();
        await requestJson('/auth/logout', {
          method: 'POST',
          body: storedRefreshToken ? JSON.stringify({ refreshToken: storedRefreshToken }) : undefined,
        });
      } catch {
        // ignore logout network errors
      }
      setAccessToken(null);
      setRefreshToken(null);
    }
    sessionStorage.removeItem('carehub-demo-role');
    setUser(null);
    navigate('/login');
  };

  const role = user?.role ?? 'reception';

  return (
    <AuthContext.Provider value={{ user, setUser, role, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import { ForcedChangePasswordModal } from '../../features/auth/ForcedChangePasswordModal';

export function RouteGuard({ children }: PropsWithChildren) {
  const { user, isLoading, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    const isPublic =
      location.pathname === '/' ||
      location.pathname === '/landing' ||
      location.pathname === '/login';

    // If logged in staff visits /login, send them straight to their clinical workspace
    if (location.pathname === '/login' && user) {
      const targetPath =
        role === 'reception'
          ? '/reception/dashboard'
          : role === 'skin'
            ? '/skin/dashboard'
            : '/ortho/dashboard';
      navigate(targetPath, { replace: true });
      return;
    }

    if (isPublic) {
      return;
    }

    if (!user) {
      navigate('/login', { replace: true });
      return;
    }

    if (DATA_MODE === 'api') {
      // Role-based portal protection
      if (role === 'reception' && !location.pathname.startsWith('/reception')) {
        navigate('/reception/dashboard', { replace: true });
      } else if (role === 'skin' && !location.pathname.startsWith('/skin')) {
        navigate('/skin/dashboard', { replace: true });
      } else if (role === 'orthopaedics' && !location.pathname.startsWith('/ortho')) {
        navigate('/ortho/dashboard', { replace: true });
      }
    }
  }, [user, isLoading, role, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#177E89' }}>
          <p style={{ marginTop: 12, fontWeight: 500 }}>Connecting to Tosh Clinic...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ForcedChangePasswordModal />
      {children}
    </>
  );
}
