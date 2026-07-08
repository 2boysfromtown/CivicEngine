/**
 * Firebase Client SDK — CivicEngine
 * Region: asia-south1 (Mumbai) — DPDP Act 2023 compliant
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const metaEnv = (import.meta as any).env || {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY || 'AIzaSyDUMMY_KEY_FOR_LOCAL_HACKATHON_DEMO',
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN || 'demo-civicengine.firebaseapp.com',
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID || 'demo-civicengine',
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || 'demo-civicengine.appspot.com',
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: metaEnv.VITE_FIREBASE_APP_ID || '1:1234567890:web:1234567890abcdef',
};

// Prevent duplicate app init (HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Connect to emulators in development
if (metaEnv.DEV && metaEnv.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectStorageEmulator(storage, 'localhost', 9199);
}

export default app;
