import React, { useEffect, useRef, useState } from 'react';
import { Lock, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';

const CARD = 'w-full max-w-sm bg-white rounded-2xl shadow-lg border border-slate-200 p-8';
const SHELL = 'app-bg min-h-screen flex items-center justify-center bg-slate-50 px-4';
const INPUT = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500';
const BUTTON = 'w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-700 text-white font-medium py-2.5 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const GOOGLE_BUTTON = 'w-full flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium py-2.5 hover:bg-slate-50 disabled:opacity-50 transition-colors';

function LogoHeader() {
  return (
    <div className="flex justify-center mb-4">
      <img src={logo} alt="Sandveld Vee Dienste" className="w-20 h-20 rounded-full shadow-md" />
    </div>
  );
}

function ErrorBanner({ error }) {
  if (!error) return null;
  return <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>;
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-4z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 16.3 3 9.6 7.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45c5.5 0 10.5-2.1 14.3-5.5l-6.6-5.6C29.6 35.4 27 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.6 5.1C9.5 40.6 16.2 45 24 45z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.6 35.9 45 30.5 45 24c0-1.4-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function GoogleButton() {
  const { googleSignIn, googleEnabled, isElectron } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!googleEnabled) return null;
  if (!isElectron) return null;

  return (
    <button
      type="button"
      className={GOOGLE_BUTTON}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await googleSignIn();
        } catch {
          // error is already surfaced via context
        } finally {
          setBusy(false);
        }
      }}
    >
      <GoogleG /> {busy ? 'Waiting for Google...' : 'Continue with Google'}
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 my-5 text-xs text-slate-400">
      <div className="flex-1 h-px bg-slate-200" /> or <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function SetupScreen() {
  const { setupFirstAccount, error, clearError, googleEnabled } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await setupFirstAccount(form);
    } catch {
      // surfaced via error state
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={SHELL}>
      <div className="w-full max-w-sm">
        <LogoHeader />
        <div className={CARD}>
        <div className="flex items-center gap-2 mb-1 text-emerald-800">
          <UserPlus size={22} />
          <h1 className="text-xl font-bold">Welcome to Sandveld Vee Dienste</h1>
        </div>
        <p className="text-sm text-slate-500 mb-5">This is a new install - create the first (admin) account to get started.</p>
        <ErrorBanner error={error} />
        <GoogleButton />
        {googleEnabled && <Divider />}
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <label className="text-xs font-medium text-slate-600">Full name</label>
            <input className={INPUT} required value={form.name} onChange={(e) => { clearError(); setForm({ ...form, name: e.target.value }); }} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input type="email" className={INPUT} required value={form.email} onChange={(e) => { clearError(); setForm({ ...form, email: e.target.value }); }} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Password</label>
            <input type="password" className={INPUT} required minLength={8} value={form.password} onChange={(e) => { clearError(); setForm({ ...form, password: e.target.value }); }} />
          </div>
          <button type="submit" className={BUTTON} disabled={busy}>
            <UserPlus size={16} /> {busy ? 'Creating account...' : 'Create admin account'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const { login, error, clearError, googleEnabled } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(form.email, form.password);
    } catch {
      // surfaced via error state
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={SHELL}>
      <div className="w-full max-w-sm">
        <LogoHeader />
        <div className={CARD}>
        <div className="flex items-center gap-2 mb-1 text-emerald-800">
          <LogIn size={22} />
          <h1 className="text-xl font-bold">Sign in</h1>
        </div>
        <p className="text-sm text-slate-500 mb-5">Sandveld Vee Dienste</p>
        <ErrorBanner error={error} />
        <GoogleButton />
        {googleEnabled && <Divider />}
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <label className="text-xs font-medium text-slate-600">Email</label>
            <input type="email" className={INPUT} required value={form.email} onChange={(e) => { clearError(); setForm({ ...form, email: e.target.value }); }} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Password</label>
            <input type="password" className={INPUT} required value={form.password} onChange={(e) => { clearError(); setForm({ ...form, password: e.target.value }); }} />
          </div>
          <button type="submit" className={BUTTON} disabled={busy}>
            <LogIn size={16} /> {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

function PinDots({ length, filled }) {
  return (
    <div className="flex justify-center gap-3 my-2">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-4 h-4 rounded-full border-2 ${i < filled ? 'bg-emerald-700 border-emerald-700' : 'border-slate-300'}`}
        />
      ))}
    </div>
  );
}

// Shared numeric keypad + hidden input used by both the "set your PIN" and
// "enter your PIN" screens, so digits can be typed on a real keyboard too.
function usePinInput(length, onComplete) {
  const [pin, setPin] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (pin.length === length) {
      onComplete(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const reset = () => setPin('');

  const inputEl = (
    <input
      ref={inputRef}
      className="opacity-0 absolute w-0 h-0"
      inputMode="numeric"
      value={pin}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, length);
        setPin(digits);
      }}
      autoFocus
    />
  );

  const append = (digit) => setPin((p) => (p.length < length ? p + digit : p));
  const backspace = () => setPin((p) => p.slice(0, -1));

  return { pin, setPin, reset, inputEl, inputRef, append, backspace };
}

function Keypad({ onDigit, onBackspace }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-4 select-none">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button
          key={d}
          type="button"
          className="rounded-lg border border-slate-200 py-3 text-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
          onClick={() => onDigit(d)}
        >
          {d}
        </button>
      ))}
      <div />
      <button
        type="button"
        className="rounded-lg border border-slate-200 py-3 text-lg font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100"
        onClick={() => onDigit('0')}
      >
        0
      </button>
      <button
        type="button"
        className="rounded-lg border border-slate-200 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 active:bg-slate-100"
        onClick={onBackspace}
      >
        ⌫
      </button>
    </div>
  );
}

function SetupPinScreen() {
  const { setupPin, error, clearError, user } = useAuth();
  const [stage, setStage] = useState('enter'); // 'enter' -> 'confirm'
  const [firstPin, setFirstPin] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const { pin, reset, inputEl, inputRef, append, backspace } = usePinInput(5, async (value) => {
    if (stage === 'enter') {
      setFirstPin(value);
      setStage('confirm');
      setMismatch(false);
      reset();
      return;
    }
    if (value !== firstPin) {
      setStage('enter');
      setFirstPin('');
      setMismatch(true);
      reset();
      return;
    }
    setBusy(true);
    try {
      await setupPin(value);
    } catch {
      setStage('enter');
      setFirstPin('');
      reset();
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className={SHELL} onClick={() => inputRef.current?.focus()}>
      <div className="w-full max-w-sm">
        <LogoHeader />
        <div className={CARD}>
        <div className="flex items-center gap-2 mb-1 text-emerald-800">
          <ShieldCheck size={22} />
          <h1 className="text-xl font-bold">Set up a 5-digit PIN</h1>
        </div>
        <p className="text-sm text-slate-500 mb-1">
          Hi {user?.name?.split(' ')[0]}. This PIN is what you'll use to quickly get back into the app on this
          computer, without typing your password every time.
        </p>
        <p className="text-xs text-slate-400 mb-5">{stage === 'enter' ? 'Choose a 5-digit PIN' : 'Enter it again to confirm'}</p>
        <ErrorBanner error={mismatch ? 'PINs did not match - try again' : error} />
        <PinDots length={5} filled={pin.length} />
        {inputEl}
        <Keypad onDigit={append} onBackspace={backspace} />
        {busy && <p className="text-center text-xs text-slate-400 mt-2">Saving...</p>}
        </div>
      </div>
    </div>
  );
}

function UnlockScreen() {
  const { verifyPin, rememberedUser, forgetDevice, error, clearError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [lockMsg, setLockMsg] = useState(null);
  const { pin, reset, inputEl, inputRef, append, backspace } = usePinInput(5, async (value) => {
    setBusy(true);
    setLockMsg(null);
    try {
      await verifyPin(value);
    } catch (err) {
      if (err.response?.status === 429) {
        setLockMsg(err.response.data.detail);
      }
      reset();
    } finally {
      setBusy(false);
    }
  });

  const initials = (rememberedUser?.name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={SHELL} onClick={() => inputRef.current?.focus()}>
      <div className={CARD}>
        <div className="flex flex-col items-center mb-4">
          {rememberedUser?.avatar_url ? (
            <img src={rememberedUser.avatar_url} alt="" className="w-16 h-16 rounded-full mb-3" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xl font-bold mb-3">
              {initials}
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-800 font-semibold">
            <Lock size={16} /> Welcome back, {rememberedUser?.name?.split(' ')[0] || 'there'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Enter your 5-digit PIN to continue</p>
        </div>
        <ErrorBanner error={lockMsg || error} />
        <PinDots length={5} filled={pin.length} />
        {inputEl}
        <Keypad onDigit={append} onBackspace={backspace} />
        {busy && <p className="text-center text-xs text-slate-400 mt-2">Checking...</p>}
        <button
          type="button"
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-6"
          onClick={() => { clearError(); forgetDevice(); }}
        >
          Not you? Sign in as someone else
        </button>
      </div>
    </div>
  );
}

const SCREENS = {
  setup: SetupScreen,
  login: LoginScreen,
  'pin-setup': SetupPinScreen,
  unlock: UnlockScreen,
};

export default function AuthGate({ children }) {
  const { screen } = useAuth();

  if (screen === 'loading') {
    return (
      <div className={SHELL}>
        <p className="text-sm text-slate-400">Loading...</p>
      </div>
    );
  }

  const Screen = SCREENS[screen];
  if (Screen) return <Screen />;

  return children;
}
