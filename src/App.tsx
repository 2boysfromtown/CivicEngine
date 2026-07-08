import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import VoiceReporter from './components/VoiceReporter';
import AuthorityDashboard from './components/Dashboard';
import CitizenDashboard from './components/CitizenDashboard';
import CitizenLogin from './pages/CitizenLogin';
import AuthorityLogin from './pages/AuthorityLogin';
import ConsentBanner from './components/ConsentBanner';
import { Shield, User as UserIcon, LogOut, Globe } from 'lucide-react';
import { t, SUPPORTED_LANGUAGES } from './i18n';

interface UserSession {
  uid: string;
  email: string;
  displayName: string;
  role: 'citizen' | 'authority' | 'admin';
  ward?: string;
  wardId?: string;
  department?: string;
}

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState(() => localStorage.getItem('civicengine_lang') || 'en');
  const [consentGranted, setConsentGranted] = useState(false);

  useEffect(() => {
    // Check if there is a mock token in localStorage first for local demo session persistence
    const localToken = localStorage.getItem('civicengine_token');
    if (localToken === 'mock_token_citizen') {
      setUser({
        uid: 'mock_citizen_uid',
        email: 'citizen@example.com',
        displayName: 'Mock Citizen',
        role: 'citizen',
      });
      setLoading(false);
      return;
    } else if (localToken === 'mock_token_authority') {
      setUser({
        uid: 'mock_officer_uid',
        email: 'officer@municipal.gov.in',
        displayName: 'Ward Officer',
        role: 'authority',
        ward: 'Ward 4',
        wardId: 'ward_004',
        department: 'Roads & Highways',
      });
      setLoading(false);
      return;
    }

    // Listen for Firebase Auth changes
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idTokenResult = await fbUser.getIdTokenResult(true);
          const role = (idTokenResult.claims.role as any) || 'citizen';
          const token = idTokenResult.token;
          
          localStorage.setItem('civicengine_token', token);
          
          setUser({
            uid: fbUser.uid,
            email: fbUser.email || '',
            displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
            role,
            ward: idTokenResult.claims.ward as string,
            wardId: idTokenResult.claims.wardId as string,
            department: idTokenResult.claims.department as string,
          });
        } catch (e) {
          console.error("Error setting up user session:", e);
          setUser(null);
        }
      } else {
        localStorage.removeItem('civicengine_token');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem('civicengine_lang', lang);
  };

  const handleAuthSuccess = (token: string, sessionUser: UserSession) => {
    setUser(sessionUser);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('civicengine_token');
      setUser(null);
    } catch (e) {
      console.error("Error signing out:", e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sandalwood-50 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-bold text-sandalwood-700 tracking-wider">SECURE CONNECTION...</span>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* PUBLIC CITIZEN LOGIN */}
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <CitizenLogin
                language={language}
                onLanguageChange={handleLanguageChange}
                onAuthSuccess={handleAuthSuccess}
              />
            )
          }
        />

        {/* SECURE AUTHORITY LOGIN */}
        <Route
          path="/authority/login"
          element={
            user?.role === 'authority' || user?.role === 'admin' ? (
              <Navigate to="/authority" replace />
            ) : (
              <AuthorityLogin language={language} onAuthSuccess={handleAuthSuccess} />
            )
          }
        />

        {/* CITIZEN PORTAL */}
        <Route
          path="/"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : user.role !== 'citizen' ? (
              <Navigate to="/authority" replace />
            ) : (
              <div className="min-h-screen bg-sandalwood-50 font-sans selection:bg-sandalwood-300 flex flex-col">
                <nav className="border-b border-sandalwood-200 bg-white sticky top-0 z-[1010]">
                  <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
                        <Shield className="text-white" size={16} />
                      </div>
                      <span className="font-extrabold text-black tracking-tight text-lg">CivicEngine</span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Language Selection */}
                      <div className="flex items-center gap-1.5 text-xs font-bold text-sandalwood-700 bg-sandalwood-50 px-2.5 py-1.5 rounded-full border border-sandalwood-200">
                        <Globe size={14} className="text-sandalwood-600" />
                        <select
                          value={language}
                          onChange={(e) => handleLanguageChange(e.target.value)}
                          className="bg-transparent text-xs font-bold focus:outline-none border-none pr-1 cursor-pointer text-black"
                        >
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code} className="text-black">
                              {lang.nativeName}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Display name */}
                      <div className="flex items-center gap-2 text-xs font-extrabold text-black bg-sandalwood-100 px-3 py-1.5 rounded-full border border-sandalwood-200 uppercase tracking-wider">
                        <UserIcon size={12} />
                        {user.displayName}
                      </div>

                      {/* Logout */}
                      <button
                        onClick={handleLogout}
                        className="text-sandalwood-600 hover:text-black transition-colors"
                        title={t(language, 'logout')}
                      >
                        <LogOut size={20} />
                      </button>
                    </div>
                  </div>
                </nav>

                <main className="flex-1 max-w-7xl mx-auto w-full p-6 pb-28">
                  <div className="animate-in fade-in duration-500">
                    <CitizenDashboard language={language} />
                  </div>
                </main>

                <ConsentBanner
                  language={language}
                  onConsentGranted={() => setConsentGranted(true)}
                />
              </div>
            )
          }
        />

        {/* AUTHORITY PORTAL */}
        <Route
          path="/authority"
          element={
            !user ? (
              <Navigate to="/authority/login" replace />
            ) : user.role === 'citizen' ? (
              <Navigate to="/" replace />
            ) : (
              <div className="min-h-screen bg-blue-50/30 font-sans selection:bg-blue-200 flex flex-col">
                <nav className="border-b border-blue-200 bg-white sticky top-0 z-[1010]">
                  <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-900 flex items-center justify-center">
                        <Shield className="text-white" size={16} />
                      </div>
                      <span className="font-black text-blue-950 tracking-tight text-lg">
                        CivicEngine <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded ml-1 uppercase">Officer</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      {/* Officer Display */}
                      <div className="flex items-center gap-2 text-xs font-extrabold text-blue-900 bg-blue-50 px-3.5 py-1.5 rounded-full border border-blue-200 uppercase tracking-wider">
                        <UserIcon size={12} />
                        {user.displayName}
                        {user.ward && (
                          <span className="text-[10px] font-black text-blue-800 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded ml-1.5">
                            {user.ward}
                          </span>
                        )}
                      </div>

                      {/* Logout */}
                      <button
                        onClick={handleLogout}
                        className="text-blue-700 hover:text-blue-950 transition-colors"
                        title={t(language, 'logout')}
                      >
                        <LogOut size={20} />
                      </button>
                    </div>
                  </div>
                </nav>

                <main className="flex-1 max-w-7xl mx-auto w-full p-6">
                  <div className="animate-in fade-in duration-500">
                    <AuthorityDashboard language={language} />
                  </div>
                </main>
              </div>
            )
          }
        />

        {/* CATCH ALL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
