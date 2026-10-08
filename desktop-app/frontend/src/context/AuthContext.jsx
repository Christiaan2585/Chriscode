import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../api/authService';
import { setAccessToken, setUnauthorizedHandler, unreachableMessage } from '../api/client';
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
  const [twoStepRequired, setTwoStepRequired] = useState(false); // the password was right; the app's 6-digit code is next

  const rememberedToken = () => localStorage.getItem(REMEMBER_TOKEN_KEY);

  // What the lock screen shows before anyone has signed in: name and photo.
  const rememberUser = useCallback((u) => {
    const remembered = { name: u.name, email: u.email, avatar_url: u.avatar_url };
    try {
      localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(remembered));
    } catch {
      // Storage full or blocked - the lock screen falls back to initials.
    }
    setRememberedUser(remembered);
  }, []);

  const persistSession = useCallback((result) => {
    setAccessToken(result.access_token);
    localStorage.setItem(REMEMBER_TOKEN_KEY, result.remember_token);
    rememberUser(result.user);
    setUser(result.user);
    // An admin-set temporary password has to be replaced before anything else.
    setScreen(result.user.must_change_password ? 'change-password' : result.user.has_pin ? 'app' : 'pin-setup');
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
        setError(unreachableMessage());
        setScreen('login');
      }
    })();
  }, []);

  const withErrorHandling = (fn) => async (...args) => {
    setError(null);
    try {
      return await fn(...args);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError((typeof detail === 'string' ? detail : detail?.message) || 'Something went wrong. Please try again.');
      throw err;
    }
  };

  const setupFirstAccount = withErrorHandling(async ({ name, email, password }) => {
    const result = await authService.setupFirstAccount({ name, email, password });
    persistSession(result);
  });

  const login = async (email, password, code) => {
    setError(null);
    try {
      const result = await authService.login(email, password, code);
      setTwoStepRequired(false);
      persistSession(result);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === 'object' && detail.code === 'two_step_required') {
        setTwoStepRequired(true); // not a failure: just ask for the code
      } else {
        setError((typeof detail === 'string' ? detail : detail?.message) || 'Something went wrong. Please try again.');
      }
      throw err;
    }
  };

  // Changing the password signs every other computer and phone out; this one
  // gets fresh tokens and carries on.
  const changePassword = async (currentPassword, newPassword) => {
    const result = await authService.changePassword(currentPassword, newPassword);
    persistSession(result);
  };

  // Signs this account out on every computer and phone, this one included.
  const signOutEverywhere = async () => {
    await authService.signOutEverywhere();
    await forgetDevice();
  };

  const googleSignIn = withErrorHandling(async () => {
    if (!googleClientId) throw new Error('Google sign-in is not configured yet.');
    const { code, codeVerifier, redirectUri, nonce } = await signInWithGoogle(googleClientId);
    const result = await authService.googleCallback(code, codeVerifier, redirectUri, nonce);
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
    if (rememberedToken()) rememberUser(me); // a new name or photo shows on the lock screen too
    return me;
  }, [rememberUser]);

  const value = useMemo(
    () => ({
      screen,
      user,
      rememberedUser,
      googleEnabled,
      isElectron: isElectron(),
      error,
      twoStepRequired,
      cancelTwoStep: () => { setTwoStepRequired(false); setError(null); },
      clearError: () => setError(null),
      changePassword,
      signOutEverywhere,
      setupFirstAccount,
      login,
      googleSignIn,
      setupPin,
      verifyPin,
      lock,
      forgetDevice,
      refreshMe,
    }),
    [screen, user, rememberedUser, googleEnabled, error, twoStepRequired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
