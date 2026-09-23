import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../api/authService';
import { setAccessToken, setUnauthorizedHandler } from '../api/client';
import { signInWithGoogle, isElectron } from '../utils/googleLogin';

const REMEMBER_TOKEN_KEY = 'sandveld_remember_token';
const REMEMBERED_USER_KEY = 'sandveld_remembered_user';

// Screens the app can be on, in the order a brand-new install walks through
// them: setup (no accounts exist yet) -> login (full sign-in) -> pin-setup
// (first time only, right after a full sign-in) -> app. A machine that has
// signed in before skips straight to 'unlock' on the next launch instead of
// 'login' - that's the "remember the previous login" behaviour: everything
// about who you are is remembered, only the 5-digit PIN is asked again.
const AuthContext = createContext(null);

function readRememberedUser() {
  try {
    const raw = localStorage.getItem(REMEMBERED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [screen, setScreen] = useState('loading');
  const [user, setUser] = useState(null);
  const [rememberedUser, setRememberedUser] = useState(readRememberedUser);
  const [googleClientId, setGoogleClientId] = useState(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [error, setError] = useState(null);

  const rememberedToken = () => localStorage.getItem(REMEMBER_TOKEN_KEY);

  const persistSession = useCallback((result) => {
    setAccessToken(result.access_token);
    localStorage.setItem(REMEMBER_TOKEN_KEY, result.remember_token);
    const remembered = { name: result.user.name, email: result.user.email, avatar_url: result.user.avatar_url };
    localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(remembered));
    setRememberedUser(remembered);
    setUser(result.user);
    setScreen(result.user.has_pin ? 'app' : 'pin-setup');
  }, []);

  const goToSignedOut = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setScreen(rememberedToken() ? 'unlock' : 'login');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(goToSignedOut);
  }, [goToSignedOut]);

  useEffect(() => {
    (async () => {
      try {
        const status = await authService.status();
        setGoogleEnabled(status.google_enabled);
        setGoogleClientId(status.google_client_id);
        if (status.setup_required) {
          setScreen('setup');
        } else if (rememberedToken()) {
          setScreen('unlock');
        } else {
          setScreen('login');
        }
      } catch {
        setError('Could not reach the backend. Is it running?');
        setScreen('login');
      }
    })();
  }, []);

  const withErrorHandling = (fn) => async (...args) => {
    setError(null);
    try {
      return await fn(...args);
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Please try again.');
      throw err;
    }
  };

  const setupFirstAccount = withErrorHandling(async ({ name, email, password }) => {
    const result = await authService.setupFirstAccount({ name, email, password });
    persistSession(result);
  });

  const login = withErrorHandling(async (email, password) => {
    const result = await authService.login(email, password);
    persistSession(result);
  });

  const googleSignIn = withErrorHandling(async () => {
    if (!googleClientId) throw new Error('Google sign-in is not configured yet.');
    const { code, codeVerifier, redirectUri } = await signInWithGoogle(googleClientId);
    const result = await authService.googleCallback(code, codeVerifier, redirectUri);
    persistSession(result);
  });

  const setupPin = withErrorHandling(async (pin) => {
    await authService.setupPin(pin);
    setUser((u) => (u ? { ...u, has_pin: true } : u));
    setScreen('app');
  });

  const verifyPin = withErrorHandling(async (pin) => {
    const token = rememberedToken();
    if (!token) {
      setScreen('login');
      throw new Error('Please sign in again.');
    }
    const result = await authService.verifyPin(token, pin);
    persistSession(result);
  });

  // "Lock" the app for the current session without forgetting the device -
  // next launch (or clicking Unlock again) only needs the PIN, same as now.
  const lock = useCallback(() => {
    goToSignedOut();
  }, [goToSignedOut]);

  // "Not you?" / full sign-out: forgets this device entirely, next launch
  // needs a full password or Google sign-in again.
  const forgetDevice = useCallback(async () => {
    const token = rememberedToken();
    if (token) {
      try {
        await authService.forgetDevice(token);
      } catch {
        // best-effort - still clear locally even if the backend call fails
      }
    }
    localStorage.removeItem(REMEMBER_TOKEN_KEY);
    localStorage.removeItem(REMEMBERED_USER_KEY);
    setRememberedUser(null);
    setAccessToken(null);
    setUser(null);
    setScreen('login');
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await authService.me();
    setUser(me);
    return me;
  }, []);

  const value = useMemo(
    () => ({
      screen,
      user,
      rememberedUser,
      googleEnabled,
      isElectron: isElectron(),
      error,
      clearError: () => setError(null),
      setupFirstAccount,
      login,
      googleSignIn,
      setupPin,
      verifyPin,
      lock,
      forgetDevice,
      refreshMe,
    }),
    [screen, user, rememberedUser, googleEnabled, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
