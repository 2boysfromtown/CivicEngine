import React, { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Shield, Lock, Mail, LogIn, AlertCircle, Award } from 'lucide-react';
import { t } from '../i18n';

interface AuthorityLoginProps {
  language: string;
  onAuthSuccess: (token: string, user: any) => void;
}

export default function AuthorityLogin({ language, onAuthSuccess }: AuthorityLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const isDemoMode = !auth.app.options.projectId || auth.app.options.projectId === 'undefined' || auth.app.options.projectId === 'demo-civicengine';
      if (isDemoMode) {
        localStorage.setItem('civicengine_token', 'mock_token_authority');
        onAuthSuccess('mock_token_authority', {
          uid: 'mock_officer_uid',
          email: email || 'officer@municipal.gov.in',
          displayName: 'Ward Officer',
          role: 'authority',
          ward: 'Ward 4',
          wardId: 'ward_004',
          department: 'Roads & Highways',
        });
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);
      const tokenResult = await cred.user.getIdTokenResult(true);

      // Verify the custom claim role is 'authority' or 'admin'
      const role = tokenResult.claims.role;
      if (role !== 'authority' && role !== 'admin') {
        // Sign out user immediately since they don't belong here
        await signOut(auth);
        throw new Error('Access denied. This portal requires authorized government credentials.');
      }

      const token = tokenResult.token;
      localStorage.setItem('civicengine_token', token);
      onAuthSuccess(token, {
        uid: cred.user.uid,
        email: cred.user.email || '',
        displayName: cred.user.displayName || 'Ward Officer',
        role: role as any,
        ward: tokenResult.claims.ward,
        wardId: tokenResult.claims.wardId,
        department: tokenResult.claims.department,
      });
    } catch (err: any) {
      setError(err.message || 'Government authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center p-6 selection:bg-blue-200">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl border border-blue-200 animate-in fade-in duration-300">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-900 text-white flex items-center justify-center shadow-lg shadow-blue-100">
            <Award size={24} />
          </div>
        </div>

        <h1 className="text-2xl font-extrabold text-center text-blue-950 tracking-tight mb-1">
          {t(language, 'appName')}
        </h1>
        <p className="text-center text-xs font-black text-blue-800 mb-8 uppercase tracking-widest flex items-center justify-center gap-1.5">
          <Shield size={14} />
          {t(language, 'authorityPortal')}
        </p>

        {error && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 font-bold">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Mail size={14} className="text-blue-700" />
              Official Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-blue-50/50 border border-blue-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-950 text-sm text-black font-semibold"
              placeholder="officer@municipal.gov.in"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Lock size={14} className="text-blue-700" />
              Security Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-blue-50/50 border border-blue-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-950 text-sm text-black font-semibold"
              placeholder="••••••••"
            />
          </div>

          <div className="text-right text-xs">
            <button type="button" className="text-blue-700 hover:text-blue-950 font-bold">
              {t(language, 'forgotPassword')}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50 mt-6"
          >
            {loading ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : (
              <>
                <LogIn size={16} />
                <span>Officer Secure Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 border-t border-blue-100 pt-4 text-center">
          <a
            href="/"
            className="text-[11px] font-bold text-blue-700 hover:text-blue-950 uppercase tracking-wider transition-colors"
          >
            &larr; Return to Public Citizen Portal
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
