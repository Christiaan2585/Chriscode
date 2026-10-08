import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../api/authService';
import { setAccessToken, setHoldUnauthorized, setUnauthorizedHandler, unreachableMessage } from '../api/client';
import { isNative } from '../utils/pairing';
import { isReachable, notifySessionResumed, subscribeReachable } from '../offline/connectivity';
import { clearOfflineLogin, offlineLoginExists, saveOfflineLogin, tryOfflineUnlock, updateOfflineUser } from '../offline/offlineLogin';
import { meta, secure, wipeOfflineData, wipeSavedCopy } from '../offline/store';
import { forgetSyncState } from '../offline/sync';
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
  // Phone only: unlocked with the PIN while the office PC could not be reached - it works from the saved copy
  // until the PC answers, then signs in again quietly with the PIN held (in memory only) here.
  const [offlineSession, setOfflineSession] = useState(false);
  const [offlineNote, setOfflineNote] = useState(false);
  const pinRef = useRef(null);

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

  // Phone only: the saved copy belongs to one person; someone else signing in starts it afresh.
  const checkOwner = useCallback(async (u) => {
    try {
      if ((await meta.get('owner')) !== u.id) {
        await wipeSavedCopy();
        await meta.set('owner', u.id);
      }
    } catch {
      // storage unavailable - nothing to protect
    }
  }, []);

  // `pin` is given when this sign-in came from typing the PIN: that is the moment the phone can learn to
  // check the PIN itself. A full password / Google sign-in forgets it, so the PIN is asked for once afterwards.
  const persistSession = useCallback((result, { pin } = {}) => {
    setAccessToken(result.access_token);
    localStorage.setItem(REMEMBER_TOKEN_KEY, result.remember_token);
    rememberUser(result.user);
    setUser(result.user);
    setOfflineNote(false);
    const phone = isNative();
    if (phone) checkOwner(result.user);
    if (phone && result.user.has_pin && pin) saveOfflineLogin(secure, pin, result.user).catch(() => {});
    if (phone && !pin && !result.fromPin) clearOfflineLogin(secure).catch(() => {});
    // An admin-set temporary password has to be replaced before anything else.
    if (result.user.must_change_password) setScreen('change-password');
    else if (!result.user.has_pin) setScreen('pin-setup');
    else if (phone && !pin && !result.fromPin) setScreen('unlock'); // type the PIN once so offline unlock can be set up
    else setScreen('app');
  }, []);

  const goToSignedOut = useCallback(() => {
    pinRef.current = null;
    setOfflineSession(false);
    setHoldUnauthorized(false);
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
        // Phone, signed in before, PIN check saved: let the PIN unlock the saved copy instead of a dead end.
        let usable = false;
        try {
          usable = isNative() && Boolean(rememberedToken()) && (await offlineLoginExists(secure));
        } catch {
          usable = false;
        }
        if (usable) {
          setOfflineNote(true);
          setScreen('unlock');
        } else {
          setError(unreachableMessage());
          setScreen('login');
        }
      }
    })();
  }, []);

  // Back online after an offline unlock: sign in again quietly with the PIN, so queued changes can go and the data can refresh.
  useEffect(() => {
    if (!offlineSession) return undefined;
    let cancelled = false;
    let busy = false;
    const resume = async () => {
      if (cancelled || busy || !isReachable() || !pinRef.current) return;
      busy = true;
      try {
        const pin = pinRef.current;
        const result = await authService.verifyPin(rememberedToken(), pin);
        if (cancelled) return;
        pinRef.current = null;
        setHoldUnauthorized(false);
        setOfflineSession(false);
        persistSession({ ...result, fromPin: true }, { pin });
        notifySessionResumed();
      } catch (err) {
        if (err.response && !cancelled) {
          // The PC refused the PIN the phone had accepted on its own (account removed or changed, phone signed out
          // there): nothing saved on this phone may keep opening - forget the offline check and the saved copy.
          if (err.response.status === 401 || err.response.status === 403) {
            clearOfflineLogin(secure).catch(() => {});
            wipeSavedCopy().catch(() => {});
          }
          goToSignedOut();
        }
      } finally {
        busy = false;
      }
    };
    const unsubscribe = subscribeReachable(resume);
    resume();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [offlineSession]);

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
    const updated = user ? { ...user, has_pin: true } : user;
    setUser(updated);
    if (isNative() && updated) saveOfflineLogin(secure, pin, updated).catch(() => {});
    setScreen('app');
  });

  // The office PC is not answering: the PIN can still be checked here, against what this phone saved.
  const unlockOffline = async (pin) => {
    const outcome = await tryOfflineUnlock(secure, pin).catch(() => ({ ok: false, disabled: true }));
    if (outcome.ok) {
      pinRef.current = pin;
      setHoldUnauthorized(true);
      setAccessToken(null);
      setUser(outcome.user);
      setOfflineNote(false);
      setOfflineSession(true);
      setScreen('app');
      return;
    }
    setError(outcome.expired
      ? "It has been too long since this phone checked in with the office PC. Connect to the office Wi-Fi and enter your PIN."
      : outcome.disabled
      ? "Can't reach the office PC, and unlocking without it isn't available. Connect to the office Wi-Fi and enter your PIN."
      : `Incorrect PIN - ${outcome.left} ${outcome.left === 1 ? 'try' : 'tries'} left`);
    throw new Error('offline unlock refused');
  };

  const verifyPin = async (pin) => {
    setError(null);
    const token = rememberedToken();
    if (!token) {
      setScreen('login');
      throw new Error('Please sign in again.');
    }
    // Already known to be out of reach: do not wait for the connection attempts to give up first.
    if (isNative() && !isReachable()) return unlockOffline(pin);
    try {
      const result = await authService.verifyPin(token, pin);
      persistSession({ ...result, fromPin: true }, { pin });
    } catch (err) {
      if (isNative() && !err.response) return unlockOffline(pin);
      const detail = err.response?.data?.detail;
      if (isNative() && detail === 'Please sign in again') {
        // This phone's sign-in was ended on the PC: the offline PIN check and the saved copy go with it.
        clearOfflineLogin(secure).catch(() => {});
        wipeSavedCopy().catch(() => {});
      }
      setError((typeof detail === 'string' ? detail : detail?.message) || 'Something went wrong. Please try again.');
      throw err;
    }
  };

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
    if (isNative()) {
      // Nothing of the office data stays on a phone that has signed out completely.
      forgetSyncState();
      wipeOfflineData().catch(() => {});
    }
    pinRef.current = null;
    setOfflineSession(false);
    setHoldUnauthorized(false);
    setRememberedUser(null);
    setAccessToken(null);
    setUser(null);
    setScreen('login');
  }, []);

  const refreshMe = useCallback(async () => {
    const me = await authService.me();
    setUser(me);
    if (rememberedToken()) rememberUser(me); // a new name or photo shows on the lock screen too
    if (isNative()) updateOfflineUser(secure, me).catch(() => {});
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
      offlineSession,
      offlineNote,
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
    [screen, user, rememberedUser, googleEnabled, error, twoStepRequired, offlineSession, offlineNote]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
