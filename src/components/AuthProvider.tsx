import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../lib/firebase.ts';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { isSessionUser, type SessionUser } from '../lib/shared-types.ts';

interface AuthContextType {
  user: SessionUser | null;
  loading: boolean;
  token: string | null;
  setSecureSession: (token: string, user: SessionUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  token: null,
  setSecureSession: () => {},
  logout: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Load custom secure session on mount if exists
  useEffect(() => {
    const savedToken = sessionStorage.getItem('secure_token');
    const savedUserJson = sessionStorage.getItem('secure_user');
    
    if (savedToken && savedUserJson) {
      try {
        const savedUser: unknown = JSON.parse(savedUserJson);
        if (!isSessionUser(savedUser)) {
          throw new Error('Saved session user has an invalid shape');
        }
        setUser(savedUser);
        setToken(savedToken);
        setLoading(false);
        return;
      } catch (e) {
        console.error("Failed to parse saved user", e);
        sessionStorage.removeItem('secure_token');
        sessionStorage.removeItem('secure_user');
      }
    }

    // Fallback to Firebase auth if no custom secure session
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (sessionStorage.getItem('secure_token')) {
        // Custom token was set during this mount
        return;
      }

      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          setUser({ uid: currentUser.uid, email: currentUser.email || undefined });
          
          // Register/sync user with backend
          await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`
            }
          });
        } catch (err) {
          console.error("Failed to sync user with backend", err);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const setSecureSession = (newToken: string, newUser: SessionUser) => {
    sessionStorage.setItem('secure_token', newToken);
    sessionStorage.setItem('secure_user', JSON.stringify(newUser));
    setUser(newUser);
    setToken(newToken);
  };

  const logout = async () => {
    sessionStorage.removeItem('secure_token');
    sessionStorage.removeItem('secure_user');
    setUser(null);
    setToken(null);
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Failed to sign out of Firebase", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, token, setSecureSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
