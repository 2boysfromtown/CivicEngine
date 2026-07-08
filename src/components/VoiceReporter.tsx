import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, CheckCircle2, Globe, Camera, ArrowRight, Send, MessageSquare, PhoneCall } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import LiveOperator from './LiveOperator';
import { t } from '../i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Client-side image compression helper
async function compressImage(file: File, maxW = 1024, maxH = 1024, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxW) {
            height = Math.round((height * maxW) / width);
            width = maxW;
          }
        } else {
          if (height > maxH) {
            width = Math.round((width * maxH) / height);
            height = maxH;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function VoiceReporter({
  language = 'en',
  location,
  onReportSubmitted,
}: {
  language?: string;
  location?: [number, number] | null;
  onReportSubmitted?: () => void;
}) {
  const [mode, setMode] = useState<'step' | 'live' | 'manual'>('step');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Issue, 2: Photo, 3: Uploading, 4: Success
  const [textDesc, setTextDesc] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [duplicateTrackingNumber, setDuplicateTrackingNumber] = useState('');

  // Manual post state
  const [manualCategory, setManualCategory] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [manualSeverity, setManualSeverity] = useState(3);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualSuccess, setManualSuccess] = useState(false);
  const [manualImage, setManualImage] = useState<File | null>(null);

  // Live operator post-call image state
  const [liveReportIssue, setLiveReportIssue] = useState<any | null>(null);
  const [liveImage, setLiveImage] = useState<File | null>(null);
  const [liveImageSubmitting, setLiveImageSubmitting] = useState(false);
  const [liveImageSuccess, setLiveImageSuccess] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up recording tracks on unmount or mode switch
  const cleanupTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupTracks();
    };
  }, []);

  useEffect(() => {
    // Stop recording and release mic when switching tab
    if (isRecording) {
      stopRecording();
    }
    cleanupTracks();
  }, [mode]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCategory || !manualSummary.trim()) return;

    setManualSubmitting(true);
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const formData = new FormData();
      formData.append('category', manualCategory);
      formData.append('executive_summary', manualSummary);
      formData.append('severity_score', manualSeverity.toString());
      formData.append('latitude', (location ? location[0] : 12.687).toString());
      formData.append('longitude', (location ? location[1] : 78.615).toString());
      
      if (manualImage) {
        const compressed = await compressImage(manualImage);
        formData.append('image', compressed);
      }

      // Read ward details from token/claims if local detection isn't passed, or fallback
      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) throw new Error('Submission failed');
      const data = await response.json();

      if (data.isDuplicate) {
        setIsDuplicate(true);
        setDuplicateTrackingNumber(data.trackingNumber || data.id);
      } else {
        setIsDuplicate(false);
        setDuplicateTrackingNumber('');
      }

      setManualSuccess(true);
      if (onReportSubmitted) {
        onReportSubmitted();
      }

      setTimeout(() => {
        setManualCategory('');
        setManualSummary('');
        setManualSeverity(3);
        setManualImage(null);
        setManualSuccess(false);
        setIsDuplicate(false);
        setDuplicateTrackingNumber('');
      }, 5500);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to submit post. Please try again.');
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleLiveImageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveReportIssue || !liveImage) return;

    setLiveImageSubmitting(true);
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const formData = new FormData();
      const compressed = await compressImage(liveImage);
      formData.append('image', compressed);

      const response = await fetch(`/api/issues/${liveReportIssue.id || liveReportIssue.issue_id}/photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) throw new Error('Photo attachment failed');

      setLiveImageSuccess(true);
      if (onReportSubmitted) {
        onReportSubmitted();
      }

      setTimeout(() => {
        setLiveReportIssue(null);
        setLiveImage(null);
        setLiveImageSuccess(false);
      }, 4500);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to upload visual evidence. Please try again.');
    } finally {
      setLiveImageSubmitting(false);
    }
  };

  const startRecording = async () => {
    try {
      setAudioBlob(null);
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        cleanupTracks();
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setIsTranscribing(true);

        try {
          const token = localStorage.getItem('civicengine_token') || '';
          const fd = new FormData();
          fd.append('audio', blob, 'report.webm');
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          const data = await res.json();
          if (data.transcription) {
            setTextDesc((prev) => (prev ? prev + ' ' + data.transcription : data.transcription).trim());
          }
        } catch (err) {
          console.error('Transcription failed:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const submitReport = async () => {
    setStep(3);
    const token = localStorage.getItem('civicengine_token') || '';
    const formData = new FormData();
    if (audioBlob) formData.append('audio', audioBlob, 'report.webm');
    
    if (imageFile) {
      const compressed = await compressImage(imageFile);
      formData.append('image', compressed);
    }
    
    if (textDesc) formData.append('text', textDesc);
    formData.append('language', language);

    // Call detect ward client-side first to pass clean location metadata
    let wardData = { ward: 'Unknown', wardId: 'unknown', municipality: 'Unknown', district: 'Unknown', state: 'India' };
    const lat = location ? location[0] : 12.687;
    const lng = location ? location[1] : 78.615;

    try {
      const wRes = await fetch('/api/detect-ward', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      if (wRes.ok) {
        wardData = await wRes.json();
      }
    } catch (e) {
      console.warn("Could not pre-detect ward:", e);
    }

    formData.append('lat', lat.toString());
    formData.append('lng', lng.toString());
    formData.append('ward', wardData.ward);
    formData.append('wardId', wardData.wardId);
    formData.append('municipality', wardData.municipality);
    formData.append('district', wardData.district);
    formData.append('state', wardData.state);

    try {
      const res = await fetch('/api/process-civic-report', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error('Submission failed');
      const data = await res.json();
      
      if (data.isDuplicate) {
        setIsDuplicate(true);
        setDuplicateTrackingNumber(data.trackingNumber);
      } else {
        setIsDuplicate(false);
        setDuplicateTrackingNumber('');
      }

      setStep(4);
      if (onReportSubmitted) onReportSubmitted();

      setTimeout(() => {
        setStep(1);
        setAudioBlob(null);
        setImageFile(null);
        setTextDesc('');
        setIsDuplicate(false);
        setDuplicateTrackingNumber('');
      }, 5500);
    } catch (err) {
      console.error('Network execution failure:', err);
      alert('Failed to submit report. Please try again.');
      setStep(2);
    }
  };

  const resetForm = () => {
    setStep(1);
    setTextDesc('');
    setAudioBlob(null);
    setImageFile(null);
  };

  return (
    <div className="p-8 max-w-md mx-auto bg-white text-black rounded-2xl shadow-xl border border-sandalwood-200 flex flex-col relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Mic size={120} />
      </div>

      <div className="flex items-center justify-between mb-6 z-10">
        <div className="bg-sandalwood-100 text-sandalwood-800 text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 uppercase tracking-wide border border-sandalwood-200">
          <Globe size={12} /> {language.toUpperCase()}
        </div>
        <div className="flex bg-sandalwood-100 p-1 rounded-full w-full gap-1">
          <button
            onClick={() => setMode('step')}
            className={cn(
              'flex-1 py-1.5 rounded-full text-[10px] font-bold transition-colors flex items-center justify-center gap-1',
              mode === 'step' ? 'bg-white text-black shadow' : 'text-sandalwood-600 hover:text-black'
            )}
          >
            <MessageSquare size={12} /> {t(language, 'aiForm')}
          </button>
          <button
            onClick={() => setMode('live')}
            className={cn(
              'flex-1 py-1.5 rounded-full text-[10px] font-bold transition-colors flex items-center justify-center gap-1',
              mode === 'live' ? 'bg-white text-black shadow' : 'text-sandalwood-600 hover:text-black'
            )}
          >
            <PhoneCall size={12} /> {t(language, 'aiLive')}
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              'flex-1 py-1.5 rounded-full text-[10px] font-bold transition-colors flex items-center justify-center gap-1',
              mode === 'manual' ? 'bg-white text-black shadow' : 'text-sandalwood-600 hover:text-black'
            )}
          >
            <Send size={12} /> {t(language, 'quickPost')}
          </button>
        </div>
      </div>

      {mode === 'live' && (
        <div className="space-y-4">
          <LiveOperator
            language={language}
            location={location}
            onLiveReportSubmitted={(issue) => {
              if (issue.isDuplicate) {
                setIsDuplicate(true);
                setDuplicateTrackingNumber(issue.trackingNumber);
                setStep(4);
                setMode('step'); // Switch to step mode temporarily to show the step 4 success screen
                if (onReportSubmitted) onReportSubmitted();
                setTimeout(() => {
                  setStep(1);
                  setMode('live'); // Switch back to live voice assistant tab
                  setIsDuplicate(false);
                  setDuplicateTrackingNumber('');
                }, 6000);
              } else {
                setLiveReportIssue(issue);
              }
            }}
          />

          {liveReportIssue && (
            <div className="p-4 bg-sandalwood-50 border border-sandalwood-200 rounded-xl mt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h4 className="text-sm font-bold text-black flex items-center gap-1.5 mb-1">
                <Camera size={16} /> {t(language, 'addVisualEvidence')}
              </h4>
              <p className="text-xs text-sandalwood-700 font-medium mb-3">
                {t(language, 'liveReportSuccess')}
              </p>

              {liveImageSuccess ? (
                <div className="flex flex-col items-center justify-center py-4 bg-white border border-sandalwood-200 rounded-lg">
                  <CheckCircle2 size={28} className="text-black mb-1.5 animate-bounce" />
                  <p className="text-xs font-bold text-black">{t(language, 'photoVerified')}</p>
                </div>
              ) : (
                <form onSubmit={handleLiveImageSubmit} className="space-y-3">
                  <div
                    onClick={() => {
                      const fileInput = document.getElementById('live-photo-input');
                      if (fileInput) fileInput.click();
                    }}
                    className={cn(
                      'border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white text-center',
                      liveImage ? 'border-black bg-sandalwood-100' : 'border-sandalwood-300 hover:bg-sandalwood-50 hover:border-sandalwood-400'
                    )}
                  >
                    {liveImage ? (
                      <span className="text-xs font-bold text-black truncate max-w-[200px]">{liveImage.name}</span>
                    ) : (
                      <span className="text-xs text-sandalwood-850 font-semibold flex items-center gap-1 justify-center">
                        <Camera size={14} /> Tap to snap or browse
                      </span>
                    )}
                    <input
                      id="live-photo-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setLiveImage(e.target.files[0]);
                        }
                      }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLiveReportIssue(null);
                        // Trigger dashboard refresh even when skipped
                        if (onReportSubmitted) onReportSubmitted();
                      }}
                      className="flex-1 py-1.5 bg-white border border-sandalwood-300 text-xs font-bold text-black rounded-lg hover:bg-sandalwood-50 transition-colors"
                    >
                      {t(language, 'skip')}
                    </button>
                    <button
                      type="submit"
                      disabled={!liveImage || liveImageSubmitting}
                      className="flex-1 py-1.5 bg-black text-white text-xs font-bold rounded-lg hover:bg-sandalwood-900 transition-colors shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {liveImageSubmitting ? (
                        <>
                          <Loader2 size={12} className="animate-spin text-white" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Send size={12} />
                          <span>{t(language, 'verifyAndAdd')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'step' && step === 1 && (
        <div className="z-10 animate-in fade-in slide-in-from-right-4 duration-300">
          <h3 className="text-xl font-black mb-2 tracking-tight">{t(language, 'step1')}</h3>
          <p className="text-xs text-sandalwood-700 mb-6 font-semibold">{t(language, 'step1Desc')}</p>

          <textarea
            value={textDesc}
            onChange={(e) => setTextDesc(e.target.value)}
            placeholder={t(language, 'placeholder')}
            className="w-full h-32 p-4 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black resize-none text-xs text-black mb-4 leading-relaxed font-semibold"
          />

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className={cn(
                    'h-12 w-12 rounded-full flex items-center justify-center font-semibold transition-all shadow-md hover:scale-105',
                    audioBlob ? 'bg-sandalwood-200 text-black' : 'bg-black text-white'
                  )}
                  aria-label={t(language, 'record')}
                  type="button"
                >
                  <Mic size={20} />
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="h-12 w-12 rounded-full bg-white flex items-center justify-center font-semibold transition-all border-2 border-black hover:scale-105 relative"
                  aria-label={t(language, 'stop')}
                  type="button"
                >
                  <div className="absolute inset-0 rounded-full border-2 border-black animate-ping opacity-20" />
                  <Square size={16} className="text-black animate-pulse" fill="currentColor" />
                </button>
              )}
              {isRecording && <span className="text-xs font-bold text-red-600 animate-pulse">Recording...</span>}
              {isTranscribing && (
                <span className="text-xs font-bold text-sandalwood-600 animate-pulse flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin text-black" /> Transcribing...
                </span>
              )}
              {!isRecording && !isTranscribing && audioBlob && <span className="text-xs font-bold text-sandalwood-650">Audio recorded</span>}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!textDesc && !audioBlob}
            className="w-full py-3 bg-black text-white font-extrabold text-sm rounded-xl hover:bg-sandalwood-900 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>{t(language, 'next')}</span> <ArrowRight size={18} />
          </button>
        </div>
      )}

      {mode === 'step' && step === 2 && (
        <div className="z-10 animate-in fade-in slide-in-from-right-4 duration-300">
          <h3 className="text-xl font-black mb-2 tracking-tight">{t(language, 'step2')}</h3>
          <p className="text-xs text-sandalwood-700 mb-6 font-semibold">{t(language, 'step2Desc')}</p>

          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors mb-6',
              imageFile ? 'border-black bg-sandalwood-100' : 'border-sandalwood-300 bg-sandalwood-50 hover:bg-sandalwood-100 hover:border-sandalwood-400'
            )}
          >
            {imageFile ? (
              <>
                <CheckCircle2 size={32} className="text-black mb-2 animate-bounce" />
                <span className="text-xs font-bold text-black max-w-[250px] truncate">{imageFile.name}</span>
              </>
            ) : (
              <>
                <Camera size={32} className="text-sandalwood-600 mb-2" />
                <span className="text-xs font-bold text-sandalwood-800">Tap to browse or capture</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-3 bg-white border border-sandalwood-300 text-black font-extrabold text-sm rounded-xl hover:bg-sandalwood-50 transition-colors"
            >
              {t(language, 'back')}
            </button>
            <button
              onClick={submitReport}
              className="flex-1 py-3 bg-black text-white font-extrabold text-sm rounded-xl hover:bg-sandalwood-900 transition-colors shadow-md flex items-center justify-center gap-2"
            >
              <span>{t(language, 'submit')}</span> <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {mode === 'step' && step === 3 && (
        <div className="z-10 flex flex-col items-center justify-center py-12 animate-in fade-in duration-300">
          <Loader2 size={48} className="animate-spin text-black mb-4" />
          <h3 className="text-base font-bold text-black mb-2 text-center">{t(language, 'analyzing')}</h3>
          <p className="text-xs text-sandalwood-600 text-center font-medium">{t(language, 'waitReview')}</p>
        </div>
      )}

      {mode === 'step' && step === 4 && (
        <div className="z-10 flex flex-col items-center justify-center py-10 animate-in fade-in scale-in-95 duration-500">
          <CheckCircle2 size={64} className="text-black mb-4 animate-pulse" />
          {isDuplicate ? (
            <>
              <h3 className="text-base font-black text-black mb-2 tracking-tight text-center">Duplicate Identified</h3>
              <p className="text-xs text-sandalwood-700 mb-8 text-center font-bold">
                An active report matches your grievance in this ward! Your upvote has been automatically registered to boost priority. Tracking No: <span className="font-extrabold underline">{duplicateTrackingNumber}</span>
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-black text-black mb-2 tracking-tight text-center">{t(language, 'success')}</h3>
              <p className="text-xs text-sandalwood-700 mb-8 text-center font-bold">{t(language, 'reportSuccessDesc')}</p>
            </>
          )}
          <button
            onClick={resetForm}
            className="w-full py-3 bg-black text-white font-extrabold text-sm rounded-xl hover:bg-sandalwood-900 transition-colors shadow-md"
          >
            {t(language, 'again')}
          </button>
        </div>
      )}

      {mode === 'manual' && (
        <div className="z-10 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">
          <h3 className="text-base font-black tracking-tight text-black mb-1 flex items-center gap-2">
            <Send size={16} className="text-sandalwood-600" /> {t(language, 'manualPost')}
          </h3>
          <p className="text-xs text-sandalwood-700 font-semibold mb-4">{t(language, 'manualPostDesc')}</p>

          {manualSuccess ? (
            <div className="flex flex-col items-center justify-center py-12 animate-in fade-in scale-in-95 duration-500">
              <CheckCircle2 size={56} className="text-black mb-3 animate-bounce" />
              {isDuplicate ? (
                <>
                  <h4 className="text-base font-black text-black mb-1 text-center">Duplicate Identified</h4>
                  <p className="text-xs text-sandalwood-600 text-center font-bold leading-relaxed">
                    This issue was already reported. Your upvote has been registered to elevate urgency! Tracking No: <span className="font-extrabold underline">{duplicateTrackingNumber}</span>
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-base font-black text-black mb-1 text-center">{t(language, 'reportLogged')}</h4>
                  <p className="text-xs text-sandalwood-650 text-center font-bold">{t(language, 'reportLoggedFeed')}</p>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
                  {t(language, 'category')}
                </label>
                <select
                  required
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-xs font-extrabold text-black cursor-pointer"
                >
                  <option value="">-- {t(language, 'selectCategory')} --</option>
                  <option value="ROADS">🚗 Roads / Potholes</option>
                  <option value="WATER_SUPPLY">💧 Water Supply</option>
                  <option value="SANITATION">🧹 Sanitation / Trash</option>
                  <option value="ELECTRICITY">⚡ Electricity / Streetlights</option>
                  <option value="PUBLIC_SAFETY">🛡️ Public Safety</option>
                  <option value="OTHER">📁 Other Issue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1">
                  {t(language, 'summary')}
                </label>
                <textarea
                  required
                  value={manualSummary}
                  onChange={(e) => setManualSummary(e.target.value)}
                  placeholder="Describe the issue clearly..."
                  className="w-full h-24 p-3.5 bg-sandalwood-50 border border-sandalwood-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-black text-xs resize-none text-black leading-relaxed font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-black uppercase tracking-wider mb-2 flex justify-between">
                  <span>{t(language, 'severityLevel')}</span>
                  <span className="font-mono font-black bg-black text-white px-2 py-0.5 rounded text-[10px]">
                    {manualSeverity} / 5
                  </span>
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setManualSeverity(level)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg text-xs font-black transition-all border',
                        manualSeverity === level
                          ? 'bg-black text-white border-black'
                          : 'bg-sandalwood-50 text-black border-sandalwood-200 hover:border-black'
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-black uppercase tracking-wider mb-1 flex justify-between">
                  <span>📸 Add Photo (Optional)</span>
                </label>
                <div
                  onClick={() => {
                    const fileInput = document.getElementById('manual-photo-input');
                    if (fileInput) fileInput.click();
                  }}
                  className={cn(
                    'border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer transition-colors text-center bg-sandalwood-50',
                    manualImage ? 'border-black bg-sandalwood-100' : 'border-sandalwood-200 hover:bg-sandalwood-100 hover:border-sandalwood-300'
                  )}
                >
                  {manualImage ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={16} className="text-black animate-pulse" />
                      <span className="text-xs font-bold text-black truncate max-w-[200px]">{manualImage.name}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-sandalwood-800 font-semibold flex items-center gap-1 justify-center">
                      <Camera size={14} /> Tap to snap or browse
                    </span>
                  )}
                  <input
                    id="manual-photo-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setManualImage(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={manualSubmitting || !manualCategory || !manualSummary.trim()}
                className="w-full py-3 bg-black text-white text-xs font-extrabold rounded-xl hover:bg-sandalwood-900 transition-colors shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {manualSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-white" />
                    <span>{t(language, 'analyzingPosting')}</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>{t(language, 'submitPost')}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
