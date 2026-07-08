import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Phone, PhoneOff, Volume2, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { t } from '../i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert PCM Float32Array to 16-bit PCM little-endian base64
function pcmToBase64(pcmData: Float32Array) {
  const buffer = new ArrayBuffer(pcmData.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < pcmData.length; i++) {
    let s = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function LiveOperator({
  language = 'en',
  location,
  onLiveReportSubmitted,
}: {
  language?: string;
  location?: [number, number] | null;
  onLiveReportSubmitted?: (issue: any) => void;
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [errorText, setErrorText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const startLiveSession = async () => {
    setIsConnecting(true);
    setErrorText('');
    try {
      const token = localStorage.getItem('civicengine_token') || '';
      const lat = location ? location[0] : 12.687;
      const lng = location ? location[1] : 78.615;
      
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      let wsUrl = '';
      if (backendUrl) {
        const host = backendUrl.replace(/^(https?|wss?):\/\//, '');
        const isSecure = backendUrl.startsWith('https') || window.location.protocol === 'https:';
        wsUrl = `${isSecure ? 'wss' : 'ws'}://${host}/live?language=${language}&token=${token}&lat=${lat}&lng=${lng}`;
      } else {
        wsUrl = `wss://${window.location.host}/live?language=${language}&token=${token}&lat=${lat}&lng=${lng}`;
        if (window.location.protocol === 'http:') {
          wsUrl = `ws://${window.location.host}/live?language=${language}&token=${token}&lat=${lat}&lng=${lng}`;
        }
      }

      wsRef.current = new WebSocket(wsUrl);

      const inputAudioCtx = new AudioContext({ sampleRate: 16000 });
      const outputAudioCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inputAudioCtx;
      outputAudioCtxRef.current = outputAudioCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = inputAudioCtx.createMediaStreamSource(stream);

      // Load PCM AudioWorklet
      await inputAudioCtx.audioWorklet.addModule('/worklets/pcm-processor.js');
      const workletNode = new AudioWorkletNode(inputAudioCtx, 'pcm-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const f32Data = event.data;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const base64 = pcmToBase64(f32Data);
          wsRef.current.send(JSON.stringify({ audio: base64 }));
        }
      };

      source.connect(workletNode);
      workletNode.connect(inputAudioCtx.destination);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
      };

      wsRef.current.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) {
          playAudioChunk(outputAudioCtx, msg.audio);
        }
        if (msg.interrupted) {
          nextStartTimeRef.current = 0;
        }
        if (msg.event === 'report_submitted') {
          setReportSubmitted(true);
          if (onLiveReportSubmitted && msg.issue) {
            onLiveReportSubmitted(msg.issue);
          }
          setTimeout(() => {
            stopLiveSession();
          }, 6000);
        }
      };

      wsRef.current.onerror = (e) => {
        console.error('WebSocket connection error:', e);
        setErrorText('Connection interrupted. Please try again.');
        stopLiveSession();
      };

      wsRef.current.onclose = () => {
        stopLiveSession();
      };
    } catch (err: any) {
      console.error('Error starting live session:', err);
      setErrorText(err.message || 'Microphone access denied or connection failed.');
      setIsConnecting(false);
      setIsConnected(false);
    }
  };

  const playAudioChunk = (ctx: AudioContext, base64: string) => {
    try {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const buffer = bytes.buffer;
      const dataView = new DataView(buffer);
      const numSamples = buffer.byteLength / 2;
      const audioBuffer = ctx.createBuffer(1, numSamples, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < numSamples; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        channelData[i] = int16 / 32768.0;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      if (nextStartTimeRef.current < ctx.currentTime) {
        nextStartTimeRef.current = ctx.currentTime;
      }
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
    } catch (e) {
      console.error('Audio chunk playback error:', e);
    }
  };

  const stopLiveSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    // Stop recording and mic stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close();
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close();
      outputAudioCtxRef.current = null;
    }
    nextStartTimeRef.current = 0;
    setIsConnected(false);
    setIsConnecting(false);
    setReportSubmitted(false);
  };

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  return (
    <div className="bg-sandalwood-100 rounded-2xl p-6 border border-sandalwood-200 text-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center">
        <Volume2 size={200} className="text-sandalwood-500" />
      </div>

      <h3 className="text-base font-black text-black mb-2 relative z-10">{t(language, 'liveAssistant')}</h3>
      <p className="text-xs text-sandalwood-700 mb-6 relative z-10 font-semibold">{t(language, 'voiceReportDesc')}</p>

      {reportSubmitted && (
        <div className="absolute inset-0 bg-green-600 text-white flex flex-col items-center justify-center z-20 animate-in fade-in duration-500 rounded-2xl p-6">
          <CheckCircle2 size={48} className="mb-4 animate-bounce" />
          <h3 className="text-lg font-black mb-2">{t(language, 'reportLogged')}</h3>
          <p className="text-xs font-bold text-green-100">{t(language, 'reportLoggedDesc')}</p>
        </div>
      )}

      {errorText && (
        <div className="p-2 mb-3 bg-red-50 border border-red-200 text-[10px] text-red-700 font-extrabold rounded-lg relative z-10">
          {errorText}
        </div>
      )}

      <div className="flex justify-center items-center relative z-10 h-24">
        {!isConnected && !isConnecting && (
          <button
            onClick={startLiveSession}
            className="flex items-center gap-2 bg-black hover:bg-sandalwood-900 text-white px-6 py-3 rounded-full font-black text-xs shadow-lg hover:scale-105 transition-all uppercase tracking-wider"
          >
            <Mic size={16} /> {t(language, 'connectCall')}
          </button>
        )}

        {isConnecting && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={32} className="animate-spin text-black" />
            <span className="text-[10px] font-black uppercase tracking-widest text-black">{t(language, 'connecting')}</span>
          </div>
        )}

        {isConnected && (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={stopLiveSession}
              className="flex items-center justify-center w-16 h-16 bg-red-700 text-white rounded-full shadow-lg hover:bg-red-800 hover:scale-105 transition-all relative"
            >
              <div className="absolute inset-0 border-4 border-red-650 rounded-full animate-ping opacity-35" />
              <PhoneOff size={28} />
            </button>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-black animate-pulse">
              {t(language, 'callInProgress')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
