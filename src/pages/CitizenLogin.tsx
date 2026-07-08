import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { Shield, Globe, Lock, Mail, UserPlus, LogIn, AlertCircle } from 'lucide-react';
import { t } from '../i18n';

interface CitizenLoginProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  onAuthSuccess: (token: string, user: any) => void;
}

export default function CitizenLogin({ language, onLanguageChange, onAuthSuccess }: CitizenLoginProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isDemoMode = !auth.app.options.projectId || auth.app.options.projectId === 'undefined' || auth.app.options.projectId === 'demo-civicengine';
      if (isDemoMode) {
        localStorage.setItem('civicengine_token', 'mock_token_citizen');
        onAuthSuccess('mock_token_citizen', {
          uid: 'mock_citizen_uid',
          email: email || 'citizen@example.com',
          displayName: name || email.split('@')[0] || 'Chetna',
          role: 'citizen',
        });
        return;
      }

      if (mode === 'login') {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const token = await cred.user.getIdToken();
        localStorage.setItem('civicengine_token', token);
        onAuthSuccess(token, {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: cred.user.displayName || email.split('@')[0],
          role: 'citizen',
        });
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Setup initial custom claims / roles via server call if needed, or fallback local role
        const token = await cred.user.getIdToken();
        localStorage.setItem('civicengine_token', token);
        onAuthSuccess(token, {
          uid: cred.user.uid,
          email: cred.user.email || '',
          displayName: name || email.split('@')[0],
          role: 'citizen',
        });
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sandalwood-50 flex items-center justify-center p-6 selection:bg-sandalwood-200">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl border border-sandalwood-200 animate-in fade-in duration-300">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center shadow-lg">
            <Shield size={24} />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-black tracking-tight mb-1">
          {t(language, 'appName')}
        </h1>
        <p className="text-center text-xs font-bold text-sandalwood-600 mb-8 uppercase tracking-widest">
          {t(language, 'citizenPortal')}
        </p>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Globe size={14} className="text-sandalwood-600" />
              {t(language, 'preferredLanguage')}
            </label>
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="w-full px-4 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black cursor-pointer font-semibold"
            >
              <option value="en">English</option>
              <option value="hi">Hindi / हिन्दी</option>
              <option value="ta">Tamil / தமிழ்</option>
              <option value="kn">Kannada / ಕನ್ನಡ</option>
              <option value="te">Telugu / తెలుగు</option>
            </select>
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
                {t(language, 'name')}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black font-semibold"
                placeholder="E.g. Chetna Sharma"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Mail size={14} className="text-sandalwood-600" />
              {t(language, 'email')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black font-semibold"
              placeholder="username@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Lock size={14} className="text-sandalwood-600" />
              {t(language, 'password')}
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-sm text-black font-semibold"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-black text-white font-extrabold text-sm rounded-xl hover:bg-sandalwood-900 transition-all flex items-center justify-center gap-2 shadow-lg shadow-sandalwood-200 disabled:opacity-50 mt-6"
          >
            {loading ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : mode === 'login' ? (
              <>
                <LogIn size={16} />
                <span>{t(language, 'signIn')}</span>
              </>
            ) : (
              <>
                <UserPlus size={16} />
                <span>{t(language, 'signUp')}</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs font-bold">
          <span className="text-sandalwood-600">
            {mode === 'login' ? t(language, 'noAccount') : t(language, 'haveAccount')}{' '}
          </span>
          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-black hover:underline font-extrabold uppercase tracking-wide ml-1"
          >
            {mode === 'login' ? t(language, 'signUp') : t(language, 'signIn')}
          </button>
        </div>

        <div className="mt-8 border-t border-sandalwood-100 pt-4 text-center">
          <a
            href="/authority/login"
            className="text-[11px] font-bold text-sandalwood-600 hover:text-black uppercase tracking-wider transition-colors"
          >
            Are you a Ward Officer? Login Here &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}

// Simple loader helper
function RefreshCw(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || 24}
      height={props.size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M16 3h5v5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 21H3v-5" />
    </svg>
  );
}
