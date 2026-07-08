import React, { useState, useEffect } from 'react';
import { Shield, MapPin, Mic, Camera } from 'lucide-react';
import { t } from '../i18n';

interface ConsentBannerProps {
  language: string;
  onConsentGranted: () => void;
}

export default function ConsentBanner({ language, onConsentGranted }: ConsentBannerProps) {
  const [show, setShow] = useState(false);
  const [gpsConsent, setGpsConsent] = useState(false);
  const [micConsent, setMicConsent] = useState(false);

  useEffect(() => {
    const hasConsented = localStorage.getItem('civicengine_consent_granted') === 'true';
    if (!hasConsented) {
      setShow(true);
    } else {
      onConsentGranted();
    }
  }, [onConsentGranted]);

  const handleAcceptAll = () => {
    localStorage.setItem('civicengine_consent_granted', 'true');
    localStorage.setItem('civicengine_gps_consent', 'true');
    localStorage.setItem('civicengine_mic_consent', 'true');
    setGpsConsent(true);
    setMicConsent(true);
    setShow(false);
    onConsentGranted();
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-sandalwood-200 shadow-2xl z-50 p-6 animate-in slide-in-from-bottom duration-300">
      <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 text-red-700 font-bold">
            <Shield size={20} className="animate-pulse" />
            <h3 className="text-base font-bold tracking-tight">Consent & Privacy Notice (DPDP Act 2023)</h3>
          </div>
          <p className="text-sm text-sandalwood-700 leading-relaxed">
            To report grievances, CivicEngine requires your explicit consent to capture and process your **GPS Location** (for routing to the correct ward), **Microphone** (for voice reports), and **Camera** (for visual proof). All data is encrypted at rest in the Mumbai region (`asia-south1`) and processed in accordance with India's Digital Personal Data Protection Act, 2023.
          </p>
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-sandalwood-600 mt-2">
            <span className="flex items-center gap-1"><MapPin size={14} /> GPS Geo-location</span>
            <span className="flex items-center gap-1"><Mic size={14} /> Voice intake</span>
            <span className="flex items-center gap-1"><Camera size={14} /> Camera upload</span>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <button
            onClick={() => setShow(false)}
            className="px-4 py-2 text-sm font-semibold text-sandalwood-700 hover:text-black hover:bg-sandalwood-100 rounded-lg transition-all"
          >
            Review Later
          </button>
          <button
            onClick={handleAcceptAll}
            className="px-6 py-2.5 bg-red-700 text-white font-bold text-sm rounded-lg hover:bg-red-800 shadow-lg shadow-red-100 transition-all w-full md:w-auto text-center"
          >
            I Agree & Give Consent
          </button>
        </div>
      </div>
    </div>
  );
}
