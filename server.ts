/**
 * CivicEngine Server — Google Cloud Edition
 * ─────────────────────────────────────────────────────────────────
 * • Firebase Admin Auth (JWT validation, role enforcement)
 * • Firestore (asia-south1, persistent storage)
 * • Cloud Storage (images/audio instead of base64)
 * • Ward detection: OSM Overpass + Google Geocoding fallback
 * • Fixed priority algorithm with real deltaT
 * • Rate limiting, helmet, CORS, input validation
 * • Full authority endpoints: status workflow, assign, feedback, export
 * • Project CRUD with feedback
 * • Secure WebSocket with auth
 */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import https from 'https';
import { GoogleGenAI, ThinkingLevel, Modality, LiveServerMessage, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import * as turf from '@turf/turf';
import { geohashForLocation } from 'geofire-common';

// ─── Firebase Admin (conditional — requires FIREBASE_PROJECT_ID) ─────────────
let db: any = null;
let adminAuth: any = null;
let storageBucket: any = null;

async function initFirebase() {
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.warn('⚠️  FIREBASE_PROJECT_ID not set — running in local mode (in-memory store)');
    return;
  }
  try {
    const admin = await import('firebase-admin');
    let credential: any;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = admin.credential.cert(sa);
    } else {
      credential = admin.credential.applicationDefault();
    }
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential,
        storageBucket: process.env.CLOUD_STORAGE_BUCKET,
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    db = admin.firestore();
    adminAuth = admin.auth();
    storageBucket = admin.storage().bucket();
    console.log('✅ Firebase Admin initialized (Firestore + Auth + Storage)');
  } catch (e) {
    console.error('Firebase Admin init failed — falling back to local mode:', e);
  }
}

// ─── In-memory fallback (when Firebase not configured) ────────────────────────
let localIssues: any[] = [
  {
    id: 'CE-SAMPLE-001',
    trackingNumber: 'CE/2026/07/00001',
    category: 'WATER_SUPPLY',
    status: 'OPEN',
    severity: 4,
    priorityScore: 8.0,
    upvotes: 42,
    upvotedBy: [],
    summary: 'Major fracture in underground water main causing street flooding.',
    isVerified: true,
    isSpam: false,
    coordinates: { latitude: 12.684, longitude: 78.621 },
    geohash: 'tdrjj',
    ward: 'Ward 4',
    wardId: 'ward_004',
    municipality: 'Sample Municipal Corporation',
    district: 'Sample District',
    state: 'Tamil Nadu',
    reportedBy: 'sample_user',
    reportedByName: 'Sample Citizen',
    feedback: [],
    statusHistory: [],
    createdAt: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let localProjects: any[] = [
  {
    id: 'PROJ-OVERBRIDGE-W4',
    title: 'Ward 4 Overbridge Construction',
    description: 'Construction of a new overbridge to ease traffic congestion at the main junction. This project involves the construction of a 4-lane overbridge spanning 200 meters, with pedestrian walkways on both sides. Expected to reduce peak-hour congestion by 40%.',
    department: 'Roads & Highways',
    ward: 'Ward 4',
    wardId: 'ward_004',
    municipality: 'Sample Municipal Corporation',
    allocatedBudget: '₹4.2 Crores',
    targetCompletionDate: '2026-12-15',
    status: 'IN_PROGRESS',
    positiveVotes: 120,
    negativeVotes: 45,
    votedUsers: {},
    feedback: [],
    createdByUid: 'authority_user',
    createdByName: 'Ward Authority',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];
let issueCounter = 1;

// ─── Tracking Number Generator ────────────────────────────────────────────────
async function generateTrackingNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  if (db) {
    try {
      const counterRef = db.collection('counters').doc(`issues-${year}-${month}`);
      const seq = await db.runTransaction(async (tx: any) => {
        const doc = await tx.get(counterRef);
        const next = (doc.data()?.count || 0) + 1;
        tx.set(counterRef, { count: next }, { merge: true });
        return next;
      });
      return `CE/${year}/${month}/${String(seq).padStart(5, '0')}`;
    } catch { /* fall through */ }
  }
  return `CE/${year}/${month}/${String(++issueCounter).padStart(5, '0')}`;
}

// ─── Priority Score (FIXED — real deltaT) ─────────────────────────────────────
function calculatePriorityScore(severity: number, upvotes: number, createdAt: string): number {
  const Sg = Math.max(1, Math.min(5, severity));
  const Vc = Math.max(0, upvotes);
  const deltaT = (Date.now() - new Date(createdAt).getTime()) / 3_600_000; // hours
  const Ws = 2.0, Wv = 1.5, Wt = 1.0;
  return (Ws * Sg) + (Wv * Math.log(Vc + 1)) + (Wt * (deltaT / 24));
}

// ─── Express Setup ────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Vite HMR needs relaxed CSP in dev
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.VITE_FIREBASE_AUTH_DOMAIN || ''].filter(Boolean)
    : true,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiters
const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many reports. Please wait a minute before submitting again.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many AI requests. Please slow down.' },
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
});
app.use('/api/', generalLimiter);

// Multer with limits and MIME validation
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

// ─── Input Validators ─────────────────────────────────────────────────────────
const VALID_CATEGORIES = ['ROADS', 'WATER_SUPPLY', 'SANITATION', 'ELECTRICITY', 'PUBLIC_SAFETY', 'OTHER'];
const VALID_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED', 'REOPENED'];

function validateCategory(cat: string): string {
  return VALID_CATEGORIES.includes(cat) ? cat : 'OTHER';
}
function clampSeverity(s: any): number {
  const n = parseInt(String(s), 10);
  return isNaN(n) ? 3 : Math.max(1, Math.min(5, n));
}
function validateCoords(lat: any, lng: any): { lat: number; lng: number; valid: boolean } {
  const la = parseFloat(String(lat));
  const lo = parseFloat(String(lng));
  const valid = !isNaN(la) && !isNaN(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180 && !(la === 0 && lo === 0);
  return { lat: la, lng: lo, valid };
}
function sanitizeText(text: string, maxLen = 2000): string {
  return String(text || '').replace(/[<>]/g, '').trim().slice(0, maxLen);
}
function newIssueId(): string {
  return `CE-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

// ─── Firebase Auth Middleware ─────────────────────────────────────────────────
async function requireAuth(req: any, res: any, next: any) {
  if (!adminAuth) {
    // Local mode: accept any user identity from header or parse custom mock tokens
    let role = req.headers['x-user-role'] || 'citizen';
    let uid = req.headers['x-user-id'] || 'local_user';
    let displayName = req.headers['x-user-name'] || 'Local User';
    let ward = 'Ward 4';
    let wardId = 'ward_004';
    let department = 'Roads & Highways';

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      if (token === 'mock_token_authority') {
        uid = 'mock_officer_uid';
        role = 'authority';
        displayName = 'Ward Officer';
      } else if (token === 'mock_token_citizen') {
        uid = 'mock_citizen_uid';
        role = 'citizen';
        displayName = 'Mock Citizen';
      }
    }

    req.user = {
      uid,
      role,
      displayName,
      ward,
      wardId,
      department,
    };
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      role: decoded.role || 'citizen',
      displayName: decoded.name || decoded.email || decoded.uid,
      ward: decoded.ward,
      wardId: decoded.wardId,
      department: decoded.department,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (req.user?.role !== role && req.user?.role !== 'admin') {
      return res.status(403).json({ error: `Access denied. Requires ${role} role.` });
    }
    next();
  };
}

// ─── Cloud Storage Upload ─────────────────────────────────────────────────────
async function uploadToStorage(buffer: Buffer, issueId: string, type: 'image' | 'audio', mimetype: string): Promise<string> {
  if (!storageBucket) {
    // Return a data URI fallback in local mode
    return `data:${mimetype};base64,${buffer.toString('base64')}`;
  }
  const ext = mimetype.split('/')[1]?.split(';')[0] || (type === 'image' ? 'jpg' : 'webm');
  const filePath = `issues/${issueId}/${type}.${ext}`;
  const file = storageBucket.file(filePath);
  await file.save(buffer, { contentType: mimetype, public: true });
  return `https://storage.googleapis.com/${storageBucket.name}/${filePath}`;
}

// ─── Firestore Helpers ────────────────────────────────────────────────────────
async function getIssues(filters: { wardId?: string; status?: string } = {}): Promise<any[]> {
  if (!db) {
    let result = localIssues;
    if (filters.wardId) result = result.filter(i => i.wardId === filters.wardId);
    if (filters.status) result = result.filter(i => i.status === filters.status);
    return result.sort((a, b) => b.priorityScore - a.priorityScore);
  }
  let q: any = db.collection('issues').orderBy('priorityScore', 'desc').limit(100);
  if (filters.wardId) q = db.collection('issues').where('wardId', '==', filters.wardId).orderBy('priorityScore', 'desc').limit(100);
  const snap = await q.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

async function getIssueById(id: string): Promise<any | null> {
  if (!db) return localIssues.find(i => i.id === id) || null;
  const doc = await db.collection('issues').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function saveIssue(issue: any): Promise<void> {
  if (!db) {
    const idx = localIssues.findIndex(i => i.id === issue.id);
    if (idx >= 0) localIssues[idx] = issue;
    else localIssues.unshift(issue);
    return;
  }
  const { id, ...data } = issue;
  await db.collection('issues').doc(id).set(data, { merge: true });
}

async function getProjects(wardId?: string): Promise<any[]> {
  if (!db) {
    if (wardId) return localProjects.filter(p => p.wardId === wardId);
    return localProjects;
  }
  let q: any = db.collection('projects').orderBy('createdAt', 'desc').limit(50);
  if (wardId) q = db.collection('projects').where('wardId', '==', wardId).limit(50);
  const snap = await q.get();
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
}

async function getProjectById(id: string): Promise<any | null> {
  if (!db) return localProjects.find(p => p.id === id) || null;
  const doc = await db.collection('projects').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function saveProject(project: any): Promise<void> {
  if (!db) {
    const idx = localProjects.findIndex(p => p.id === project.id);
    if (idx >= 0) localProjects[idx] = project;
    else localProjects.unshift(project);
    return;
  }
  const { id, ...data } = project;
  await db.collection('projects').doc(id).set(data, { merge: true });
}

async function writeAuditLog(entry: any): Promise<void> {
  if (!db) return; // Skip audit log in local mode
  await db.collection('auditLog').add({ ...entry, timestamp: new Date().toISOString() });
}

// ─── Ward Detection ───────────────────────────────────────────────────────────
// Ward boundaries cache (loaded from DataMeet or OSM)
let wardBoundariesCache: any[] | null = null;

async function loadWardBoundaries(): Promise<any[]> {
  if (wardBoundariesCache) return wardBoundariesCache;
  // In production, load from Firestore 'wards' collection
  if (db) {
    try {
      const snap = await db.collection('wards').get();
      if (!snap.empty) {
        wardBoundariesCache = snap.docs.map((d: any) => d.data());
        return wardBoundariesCache!;
      }
    } catch { /* fall through to OSM */ }
  }
  return []; // Empty — will fall through to OSM
}

async function detectWardFromOSM(lat: number, lng: number): Promise<any> {
  return new Promise((resolve) => {
    const query = encodeURIComponent(
      `[out:json][timeout:10];is_in(${lat},${lng})->.a;relation(pivot.a)["boundary"="administrative"]["admin_level"="10"];out tags;`
    );
    const url = `https://overpass-api.de/api/interpreter?data=${query}`;
    const req = https.get(url, { headers: { 'User-Agent': 'CivicEngine/1.0 (civic-grievance-portal)' } }, (resp) => {
      let data = '';
      resp.on('data', (chunk) => data += chunk);
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const element = json.elements?.[0];
          if (element?.tags?.name) {
            resolve({
              ward: element.tags.name,
              wardId: `osm_${element.id}`,
              municipality: element.tags['is_in:municipality'] || element.tags['addr:city'] || 'Unknown Municipality',
              municipalityId: 'osm_municipality',
              district: element.tags['is_in:district'] || 'Unknown District',
              state: element.tags['is_in:state'] || 'India',
              source: 'osm',
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

async function detectWardFromGoogle(lat: number, lng: number): Promise<any> {
  if (!process.env.GOOGLE_MAPS_API_KEY) return null;
  return new Promise((resolve) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
    const req = https.get(url, (resp) => {
      let data = '';
      resp.on('data', (chunk) => data += chunk);
      resp.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.results?.[0];
          if (!result) return resolve(null);
          const comps = result.address_components || [];
          const getComp = (...types: string[]) =>
            comps.find((c: any) => types.some(t => c.types.includes(t)))?.long_name || '';
          resolve({
            ward: getComp('sublocality_level_2', 'sublocality_level_1', 'neighborhood') || 'Unknown Ward',
            wardId: `google_${lat.toFixed(3)}_${lng.toFixed(3)}`,
            municipality: getComp('locality') || 'Unknown Municipality',
            municipalityId: 'google_municipality',
            district: getComp('administrative_area_level_2') || 'Unknown District',
            state: getComp('administrative_area_level_1') || 'India',
            source: 'google',
          });
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

async function detectWard(lat: number, lng: number): Promise<any> {
  // 1. Try cached ward boundaries (DataMeet GeoJSON point-in-polygon)
  const boundaries = await loadWardBoundaries();
  if (boundaries.length > 0) {
    const point = turf.point([lng, lat]);
    for (const ward of boundaries) {
      if (ward.boundary && turf.booleanPointInPolygon(point, ward.boundary)) {
        return { ...ward, source: 'datameet' };
      }
    }
  }
  // 2. OSM Overpass API
  const osmResult = await detectWardFromOSM(lat, lng);
  if (osmResult) return osmResult;
  // 3. Google Geocoding fallback
  const googleResult = await detectWardFromGoogle(lat, lng);
  if (googleResult) return googleResult;
  // 4. Unknown
  return {
    ward: 'Unknown Ward',
    wardId: `coord_${lat.toFixed(3)}_${lng.toFixed(3)}`,
    municipality: 'Unknown Municipality',
    municipalityId: 'unknown',
    district: 'Unknown District',
    state: 'India',
    source: 'unknown',
  };
}

// ─── AI Client ────────────────────────────────────────────────────────────────
let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY environment variable is required');
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'CivicEngine/1.0' } },
    });
  }
  return ai;
}

function cleanJson(raw: string): string {
  return raw.replace(/^```json\s*/g, '').replace(/^```\s*/g, '').replace(/```$/g, '').trim();
}

// ─── System Instruction ───────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `
SYSTEM INSTRUCTION: Senior Civic Data Architect & Real-Time Multimodal Analyst

ROLE AND OBJECTIVE:
You are an advanced, hyper-objective civic intelligence agent deployed between local citizens and municipal authorities. Process citizen communications (live audio feeds, uploaded audio, images, geolocation) to verify legitimacy, extract structural context, resolve regional Indian languages/dialects, and output machine-readable JSON. Filter spam, exaggerations, and irrelevant content.

FUNCTIONAL CAPABILITIES:
1. Dynamic Audio Processing & Translation: Transcribe from any Indian regional language (Tamil, Hindi, Kannada, Telugu, etc.) including code-switched English. Translate the core meaning to precise English.
2. Multimodal Visual Verification: Analyze images for legitimate municipal problems (potholes, garbage heaps, broken streetlights, water stagnation, damaged public property). Flag as spam: selfies, memes, unrelated graphics, no infrastructure failure.
3. Structural Severity Grading: Assign Severity Rating 1–5 based on visual evidence and descriptive gravity.
4. Duplicate Issue Checking: Look at the list of "Active Ward Issues" provided in the prompt. Compare the new report with these active issues. If it describes the exact same issue at the same place, set "is_duplicate_of_issue_id" to the ID of that duplicate issue. Otherwise, set it to null.

CONVERSATIONAL PROTOCOL (LIVE SESSIONS):
- Ask short, polite follow-up questions in the speaker's language if vital parameters are missing.
- Speak like an efficient, empathetic local emergency operator — not an AI assistant. Responses under 20 words.

OUTPUT SCHEMA SPECIFICATION:
Emit a single JSON object. No markdown formatting.
{
  "is_legitimate_civic_issue": boolean,
  "spam_reason": "string or null",
  "is_duplicate_of_issue_id": "string or null",
  "auto_generated_tags": ["string"],
  "landmark_gps_match": boolean,
  "extracted_parameters": {
    "category": "ROADS"|"WATER_SUPPLY"|"SANITATION"|"ELECTRICITY"|"PUBLIC_SAFETY"|"OTHER",
    "raw_transcription_native": "string",
    "translated_summary_english": "string",
    "visual_evidence_analysis": "string",
    "landmark_or_location_clues": "string"
  },
  "metrics": {
    "severity_rating": integer (1-5),
    "safety_hazard_present": boolean,
    "safety_hazard_details": "string or null",
    "estimated_affected_population_density": "LOW"|"MEDIUM"|"HIGH"
  },
  "project_criticism": {
    "is_criticism_of_existing_work": boolean,
    "associated_project_name_if_mentioned": "string or null",
    "sentiment_score": float (-1.0 to 1.0)
  },
  "requires_live_followup": boolean
}
CRITICAL: Never assume coordinates. If is_legitimate_civic_issue=false, nullify metrics.
`;

// ═══════════════════════════════════════════════════════════════════════════════
//  API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Ward Detection ─────────────────────────────────────────────────────────────
app.post('/api/detect-ward', requireAuth, async (req: any, res: any) => {
  try {
    const { latitude, longitude } = req.body;
    const { lat, lng, valid } = validateCoords(latitude, longitude);
    if (!valid) return res.status(400).json({ error: 'Valid coordinates required' });
    const wardInfo = await detectWard(lat, lng);
    const geohash = geohashForLocation([lat, lng]);
    // Cache result in Firestore
    if (db && wardInfo.source !== 'cache') {
      try {
        await db.collection('wards').doc(wardInfo.wardId).set({
          ...wardInfo,
          geohash,
          cachedAt: new Date().toISOString(),
        }, { merge: true });
      } catch { /* non-critical */ }
    }
    res.json({ ...wardInfo, coordinates: { latitude: lat, longitude: lng }, geohash });
  } catch (error: any) {
    console.error('Ward detection error:', error);
    res.status(500).json({ error: 'Ward detection failed' });
  }
});

// ─── High-Scalability Asynchronous AI Processing Queue ───────────────────────
interface QueueJob {
  issueId: string;
  lat: number;
  lng: number;
  textDesc: string;
  imageUrl?: string;
  audioUrl?: string;
  wardInfo: {
    ward: string;
    wardId: string;
    municipality: string;
    district: string;
    state: string;
  };
  user: {
    uid: string;
    displayName: string;
    role: string;
  };
  retryCount: number;
  isManualPost?: boolean;
  manualCategory?: string;
  manualSeverity?: number;
}

const aiQueue: QueueJob[] = [];
let isProcessingQueue = false;

async function getPartFromUrl(url?: string): Promise<any> {
  if (!url) return null;
  if (url.startsWith('data:')) {
    const parts = url.split(',');
    const mimeType = parts[0].split(':')[1].split(';')[0];
    const base64 = parts[1];
    return { inlineData: { data: base64, mimeType } };
  }
  if (storageBucket && url.includes(storageBucket.name)) {
    try {
      const path = url.split(`${storageBucket.name}/`)[1]?.split('?')[0]; // strip query parameters
      if (path) {
        const file = storageBucket.file(path);
        const [buffer] = await file.download();
        const [metadata] = await file.getMetadata();
        return { inlineData: { data: buffer.toString('base64'), mimeType: metadata.contentType } };
      }
    } catch (e) {
      console.error('Error downloading GCS asset for Gemini queue:', e);
    }
  }
  return null;
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (aiQueue.length > 0) {
    const job = aiQueue[0];
    try {
      await processJob(job);
      aiQueue.shift(); // remove if successful
    } catch (e: any) {
      console.error(`[Queue Error] Job failed for issue ${job.issueId}:`, e);
      const errMsg = String(e?.message || e);
      if (e?.status === 429 || errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Quota exceeded')) {
        console.warn('[Queue Rate Limit] Gemini quota exceeded. Backing off for 15 seconds...');
        await new Promise(r => setTimeout(r, 15000));
      } else {
        job.retryCount++;
        if (job.retryCount >= 3) {
          console.error(`[Queue Final Failure] Max retries reached for issue ${job.issueId}. Triaging to fallback...`);
          await fallbackProcessIssue(job);
          aiQueue.shift();
        } else {
          // Re-queue to tail
          aiQueue.shift();
          aiQueue.push(job);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  }
  isProcessingQueue = false;
}

async function processJob(job: QueueJob) {
  console.log(`[Queue Runner] Processing AI Analysis for ${job.issueId} (Manual Post: ${!!job.isManualPost})...`);
  const activeIssues = await getIssues({ wardId: job.wardInfo.wardId });
  const activeWardIssuesSnippet = activeIssues
    .filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
    .map(i => ({
      id: i.id,
      trackingNumber: i.trackingNumber,
      category: i.category,
      summary: i.summary,
      landmarkClues: i.landmarkClues || ''
    }))
    .slice(0, 15);

  const parts: any[] = [];
  
  const imagePart = await getPartFromUrl(job.imageUrl);
  if (imagePart) parts.push(imagePart);
  
  const audioPart = await getPartFromUrl(job.audioUrl);
  if (audioPart) parts.push(audioPart);

  let userPrompt = '';
  if (job.isManualPost) {
    userPrompt = `Analyze this manual civic report. Coordinates: lat ${job.lat}, lng ${job.lng}.
User description: "${job.textDesc}"
User Category: "${job.manualCategory}"
User Severity (1-5): ${job.manualSeverity}

Determine if this is a legitimate civic/municipal issue or spam.
Compare this new report with the following list of active issues in the same ward to detect duplicate submissions. If the new report describes the exact same physical issue at the same location, set "is_duplicate_of_issue_id" to the matching issue's ID. Otherwise, set it to null.

Active Ward Issues:
${JSON.stringify(activeWardIssuesSnippet, null, 2)}

Reply ONLY with JSON:
{
  "is_legitimate_civic_issue": boolean,
  "spam_reason": "string or null",
  "is_duplicate_of_issue_id": "string or null",
  "adjusted_category": "ROADS"|"WATER_SUPPLY"|"SANITATION"|"ELECTRICITY"|"PUBLIC_SAFETY"|"OTHER",
  "adjusted_severity_score": number (1-5),
  "visual_analysis_summary": "string describing visual evidence or text details",
  "auto_generated_tags": ["string"],
  "safety_hazard_present": boolean,
  "safety_hazard_details": "string or null",
  "landmark_gps_match": boolean
}`;
  } else {
    userPrompt = `Analyze this civic report. Coordinates: lat ${job.lat}, lng ${job.lng}.`;
    if (job.textDesc) userPrompt += ` User description: "${job.textDesc}"`;
    userPrompt += `\n\nCompare this new report with the following list of active issues in the same ward to detect duplicate submissions. If the new report is describing the exact same physical issue (e.g. the same pothole, same garbage pile, same broken light) at the same location, set "is_duplicate_of_issue_id" to the matching issue's ID. Otherwise, set it to null.\n\nActive Ward Issues:\n${JSON.stringify(activeWardIssuesSnippet, null, 2)}`;
  }
  
  parts.push({ text: userPrompt });

  const response = await getAI().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts }],
    config: { 
      systemInstruction: job.isManualPost ? undefined : SYSTEM_INSTRUCTION, 
      responseMimeType: 'application/json' 
    },
  });

  const parsed = JSON.parse(cleanJson(response.text || '{}'));
  const placeholderIssue = await getIssueById(job.issueId);
  if (!placeholderIssue) return;

  if (parsed.is_legitimate_civic_issue) {
    const duplicateId = parsed.is_duplicate_of_issue_id;
    if (duplicateId && duplicateId !== job.issueId) {
      const existingIssue = await getIssueById(duplicateId);
      if (existingIssue) {
        if (!existingIssue.upvotedBy) existingIssue.upvotedBy = [];
        const hasVoted = existingIssue.upvotedBy.includes(job.user.uid);
        if (!hasVoted) {
          existingIssue.upvotedBy.push(job.user.uid);
          existingIssue.upvotes = (existingIssue.upvotes || 0) + 1;
        }
        existingIssue.priorityScore = calculatePriorityScore(existingIssue.severity, existingIssue.upvotes, existingIssue.createdAt);
        existingIssue.updatedAt = new Date().toISOString();

        const newFeedback = {
          id: crypto.randomUUID(),
          uid: job.user.uid,
          displayName: job.user.displayName,
          role: 'citizen',
          text: `[System Update] Another citizen reported this same issue (Reference: ${placeholderIssue.trackingNumber}). Auto-upvoted.`,
          createdAt: new Date().toISOString()
        };
        if (!existingIssue.feedback) existingIssue.feedback = [];
        existingIssue.feedback.push(newFeedback);

        await saveIssue(existingIssue);
        await writeAuditLog({
          actorUid: job.user.uid,
          actorRole: job.user.role,
          action: 'DUPLICATE_UPVOTE',
          entityType: 'issue',
          entityId: existingIssue.id,
          after: { upvotes: existingIssue.upvotes }
        });

        // Mark placeholder as duplicate
        placeholderIssue.status = 'REJECTED';
        placeholderIssue.isSpam = true;
        placeholderIssue.spamReason = `Merged as duplicate of report ${existingIssue.trackingNumber}`;
        placeholderIssue.aiStatus = 'DUPLICATE';
        placeholderIssue.tags = ['#Duplicate'];
        placeholderIssue.updatedAt = new Date().toISOString();
        await saveIssue(placeholderIssue);
        return;
      }
    }

    const Sg = clampSeverity(job.isManualPost ? (parsed.adjusted_severity_score || job.manualSeverity) : parsed.metrics?.severity_rating);
    placeholderIssue.category = validateCategory(job.isManualPost ? (parsed.adjusted_category || job.manualCategory) : (parsed.extracted_parameters?.category || 'OTHER'));
    placeholderIssue.severity = Sg;
    placeholderIssue.priorityScore = calculatePriorityScore(Sg, 0, placeholderIssue.createdAt);
    placeholderIssue.summary = sanitizeText(job.isManualPost ? (placeholderIssue.summary) : (parsed.extracted_parameters?.translated_summary_english || job.textDesc || 'No summary'));
    placeholderIssue.rawTranscription = sanitizeText(parsed.extracted_parameters?.raw_transcription_native || '');
    placeholderIssue.visualAnalysis = sanitizeText(job.isManualPost ? (parsed.visual_analysis_summary || '') : (parsed.extracted_parameters?.visual_evidence_analysis || ''));
    placeholderIssue.landmarkClues = sanitizeText(parsed.extracted_parameters?.landmark_or_location_clues || '');
    placeholderIssue.tags = parsed.auto_generated_tags || [];
    placeholderIssue.safetyHazardPresent = !!(job.isManualPost ? parsed.safety_hazard_present : parsed.metrics?.safety_hazard_present);
    placeholderIssue.safetyHazardDetails = (job.isManualPost ? parsed.safety_hazard_details : parsed.metrics?.safety_hazard_details) || null;
    placeholderIssue.landmarkGpsMatch = !!parsed.landmark_gps_match;
    placeholderIssue.aiStatus = 'COMPLETED';
    placeholderIssue.updatedAt = new Date().toISOString();

    await saveIssue(placeholderIssue);
    await writeAuditLog({ actorUid: job.user.uid, actorRole: job.user.role, action: 'AI_COMPLETED', entityType: 'issue', entityId: job.issueId, after: { status: 'OPEN', severity: Sg } });
  } else {
    // Spam/Legitimacy rejection
    placeholderIssue.status = 'REJECTED';
    placeholderIssue.isSpam = true;
    placeholderIssue.spamReason = parsed.spam_reason || 'Flagged as illegitimate by AI engine.';
    placeholderIssue.aiStatus = 'SPAM';
    placeholderIssue.tags = ['#Spam'];
    placeholderIssue.updatedAt = new Date().toISOString();
    await saveIssue(placeholderIssue);
    await writeAuditLog({ actorUid: job.user.uid, actorRole: job.user.role, action: 'AI_REJECTED', entityType: 'issue', entityId: job.issueId, after: { status: 'REJECTED' } });
  }
}

async function fallbackProcessIssue(job: QueueJob) {
  const text = job.textDesc.toLowerCase();
  let category = 'OTHER';
  if (text.includes('pothole') || text.includes('road') || text.includes('street')) category = 'ROADS';
  else if (text.includes('water') || text.includes('leak') || text.includes('pipe')) category = 'WATER_SUPPLY';
  else if (text.includes('garbage') || text.includes('sewer') || text.includes('drain')) category = 'SANITATION';
  else if (text.includes('wire') || text.includes('power') || text.includes('electricity') || text.includes('light')) category = 'ELECTRICITY';
  else if (text.includes('hazard') || text.includes('danger') || text.includes('unsafe')) category = 'PUBLIC_SAFETY';

  const issue = await getIssueById(job.issueId);
  if (issue) {
    issue.aiStatus = 'FAILED';
    issue.category = category;
    issue.tags = ['#FallbackTriage'];
    issue.safetyHazardPresent = text.includes('danger') || text.includes('shock') || text.includes('wire') || text.includes('hazard');
    issue.safetyHazardDetails = issue.safetyHazardPresent ? 'Safety warning detected via regex pre-parser' : null;
    issue.updatedAt = new Date().toISOString();
    await saveIssue(issue);
  }
}

app.post('/api/process-civic-report',
  requireAuth,
  reportLimiter,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'image', maxCount: 1 }]),
  async (req: any, res: any) => {
    try {
      const { lat: rawLat, lng: rawLng, text, wardId, ward, municipality, district, state } = req.body;
      const textDesc = sanitizeText(text);
      const files = req.files as { [k: string]: Express.Multer.File[] };
      const audioFile = files?.['audio']?.[0];
      const imageFile = files?.['image']?.[0];
      if (!audioFile && !imageFile && !textDesc) {
        return res.status(400).json({ error: 'Please provide audio, image, or text description.' });
      }
      const coordResult = validateCoords(rawLat, rawLng);
      const lat = coordResult.valid ? coordResult.lat : 12.687;
      const lng = coordResult.valid ? coordResult.lng : 78.615;

      // 1. Resolve ward first so we can assign correct metadata
      let wardInfo = {
        ward: ward || 'Unknown',
        wardId: wardId || 'unknown',
        municipality: municipality || 'Unknown',
        district: district || 'Unknown',
        state: state || 'India'
      };
      if (wardInfo.wardId === 'unknown' || !wardInfo.wardId) {
        try {
          const resolved = await detectWard(lat, lng);
          if (resolved) wardInfo = resolved;
        } catch (e) {
          console.warn('Pre-resolution of ward failed:', e);
        }
      }

      const issueId = newIssueId();
      const trackingNumber = await generateTrackingNumber();
      const now = new Date().toISOString();
      const geohash = geohashForLocation([lat, lng]);

      // Preserving assets immediately
      let imageUrl: string | undefined;
      if (imageFile) {
        imageUrl = await uploadToStorage(imageFile.buffer, issueId, 'image', imageFile.mimetype);
      }
      let audioUrl: string | undefined;
      if (audioFile) {
        audioUrl = await uploadToStorage(audioFile.buffer, issueId, 'audio', audioFile.mimetype);
      }

      // Create placeholder issue immediately
      const newIssue: any = {
        id: issueId,
        trackingNumber,
        category: 'OTHER',
        status: 'OPEN',
        severity: 3,
        priorityScore: calculatePriorityScore(3, 0, now),
        summary: textDesc || 'Voice report queued for transcription...',
        rawTranscription: '',
        visualAnalysis: '',
        landmarkClues: '',
        isVerified: true,
        isSpam: false,
        spamReason: null,
        coordinates: { latitude: lat, longitude: lng },
        geohash,
        ward: wardInfo.ward,
        wardId: wardInfo.wardId,
        municipality: wardInfo.municipality,
        district: wardInfo.district,
        state: wardInfo.state,
        imageUrl,
        audioUrl,
        reportedBy: req.user.uid,
        reportedByName: req.user.displayName,
        upvotes: 0,
        upvotedBy: [],
        feedback: [],
        statusHistory: [],
        createdAt: now,
        updatedAt: now,
        tags: ['#AI_Queued'],
        safetyHazardPresent: false,
        safetyHazardDetails: null,
        landmarkGpsMatch: true,
        aiStatus: 'PENDING'
      };

      await saveIssue(newIssue);
      await writeAuditLog({ actorUid: req.user.uid, actorRole: req.user.role, action: 'CREATED_QUEUED', entityType: 'issue', entityId: issueId, after: { status: 'OPEN', aiStatus: 'PENDING' } });

      // Enqueue job for async execution
      aiQueue.push({
        issueId,
        lat,
        lng,
        textDesc,
        imageUrl,
        audioUrl,
        wardInfo,
        user: {
          uid: req.user.uid,
          displayName: req.user.displayName,
          role: req.user.role
        },
        retryCount: 0
      });

      // Fire queue runner in background
      processQueue();

      res.json({
        success: true,
        isDuplicate: false,
        isQueued: true,
        issue: newIssue,
        trackingNumber
      });
    } catch (error: any) {
      console.error('Error processing report:', error);
      res.status(500).json({ error: 'Failed to process report. Please try again.' });
    }
  }
);

// ── Get Issues ─────────────────────────────────────────────────────────────────
app.get('/api/issues', requireAuth, async (req: any, res: any) => {
  try {
    const { wardId, status } = req.query;
    const issues = await getIssues({ wardId: wardId as string, status: status as string });
    res.json(issues);
  } catch (error: any) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

app.post('/api/issues',
  requireAuth,
  reportLimiter,
  upload.single('image'),
  async (req: any, res: any) => {
    try {
      const { category, executive_summary, severity_score, latitude, longitude, wardId, ward, municipality, district, state } = req.body;
      let Sg = clampSeverity(severity_score);
      let cat = validateCategory(category);
      const summary = sanitizeText(executive_summary);
      const coordResult = validateCoords(latitude, longitude);
      const lat = coordResult.valid ? coordResult.lat : 12.687 + (Math.random() - 0.5) * 0.01;
      const lng = coordResult.valid ? coordResult.lng : 78.615 + (Math.random() - 0.5) * 0.01;
      const uploadedFile = req.file;

      const issueId = newIssueId();
      const trackingNumber = await generateTrackingNumber();
      const now = new Date().toISOString();
      const geohash = geohashForLocation([lat, lng]);

      // 1. Resolve ward first so we can assign correct metadata
      let wardInfo = {
        ward: ward || 'Unknown Ward',
        wardId: wardId || 'unknown',
        municipality: municipality || 'Unknown Municipality',
        district: district || 'Unknown District',
        state: state || 'India'
      };
      if (wardInfo.wardId === 'unknown' || !wardInfo.wardId) {
        try {
          const resolved = await detectWard(lat, lng);
          if (resolved) wardInfo = resolved;
        } catch (e) {
          console.warn('Pre-resolution of ward failed in manual post:', e);
        }
      }

      let imageUrl: string | undefined;
      if (uploadedFile) {
        imageUrl = await uploadToStorage(uploadedFile.buffer, issueId, 'image', uploadedFile.mimetype);
      }

      // Create placeholder issue immediately
      const newIssue: any = {
        id: issueId,
        trackingNumber,
        category: cat,
        status: 'OPEN',
        severity: Sg,
        priorityScore: calculatePriorityScore(Sg, 0, now),
        summary,
        visualAnalysis: '',
        isVerified: true,
        isSpam: false,
        spamReason: null,
        coordinates: { latitude: lat, longitude: lng },
        geohash,
        ward: wardInfo.ward,
        wardId: wardInfo.wardId,
        municipality: wardInfo.municipality,
        district: wardInfo.district,
        state: wardInfo.state,
        imageUrl,
        reportedBy: req.user.uid,
        reportedByName: req.user.displayName,
        upvotes: 0,
        upvotedBy: [],
        feedback: [],
        statusHistory: [],
        createdAt: now,
        updatedAt: now,
        tags: ['#AI_Queued'],
        safetyHazardPresent: false,
        safetyHazardDetails: null,
        landmarkGpsMatch: true,
        aiStatus: 'PENDING'
      };

      await saveIssue(newIssue);
      await writeAuditLog({ actorUid: req.user.uid, actorRole: req.user.role, action: 'CREATED_QUEUED', entityType: 'issue', entityId: issueId, after: { status: 'OPEN', aiStatus: 'PENDING' } });

      // Enqueue job for async execution
      aiQueue.push({
        issueId,
        lat,
        lng,
        textDesc: summary,
        imageUrl,
        wardInfo,
        user: {
          uid: req.user.uid,
          displayName: req.user.displayName,
          role: req.user.role
        },
        retryCount: 0,
        isManualPost: true,
        manualCategory: cat,
        manualSeverity: Sg
      });

      // Fire queue runner in background
      processQueue();

      // Return placeholder instantly to keep E2E tests and UX running fast
      res.status(201).json(newIssue);
    } catch (error: any) {
      console.error('Quick post error:', error);
      res.status(500).json({ error: 'Failed to submit report. Please try again.' });
    }
  }
);

// ── Post-Live Call Photo Attachment ────────────────────────────────────────────
app.post('/api/issues/:id/photo', requireAuth, upload.single('image'), async (req: any, res: any) => {
  try {
    const issue = await getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    if (issue.reportedBy !== req.user.uid && req.user.role !== 'authority' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot attach photo to another user\'s issue' });
    }

    const imageUrl = await uploadToStorage(req.file.buffer, issue.id, 'image', req.file.mimetype);
    issue.imageUrl = imageUrl;

    try {
      const imagePrompt = `Analyze this image to verify it matches the civic issue.
Issue description: "${issue.summary}"
Category: "${issue.category}"
Current Severity: ${issue.severity}
Is this a legitimate match, or is it spam/fake?
Reply ONLY with JSON:
{
  "is_legitimate_civic_issue": boolean,
  "spam_reason": "string or null",
  "adjusted_category": "ROADS"|"WATER_SUPPLY"|"SANITATION"|"ELECTRICITY"|"PUBLIC_SAFETY"|"OTHER",
  "adjusted_severity_score": number (1-5),
  "visual_analysis_summary": "string"
}`;
      const resp = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } }, { text: imagePrompt }] }],
        config: { responseMimeType: 'application/json' },
      });
      const p = JSON.parse(cleanJson(resp.text || '{}'));
      issue.isVerified = !!p.is_legitimate_civic_issue;
      if (!issue.isVerified) {
        issue.spamReason = p.spam_reason || 'Image analyzed as non-civic/spam';
        issue.status = 'REJECTED';
      } else {
        issue.category = validateCategory(p.adjusted_category || issue.category);
        issue.severity = clampSeverity(p.adjusted_severity_score || issue.severity);
        issue.visualAnalysis = sanitizeText(p.visual_analysis_summary || '');
        issue.spamReason = null;
        if (issue.status === 'REJECTED') issue.status = 'OPEN';
      }
    } catch (e) {
      console.error('Gemini photo verification failed:', e);
    }

    issue.priorityScore = calculatePriorityScore(issue.severity, issue.upvotes, issue.createdAt);
    issue.updatedAt = new Date().toISOString();
    await saveIssue(issue);
    res.json(issue);
  } catch (error: any) {
    console.error('Photo attach error:', error);
    res.status(500).json({ error: 'Failed to attach photo' });
  }
});

// ── Upvote Issue ───────────────────────────────────────────────────────────────
app.post('/api/issues/:id/upvote', requireAuth, async (req: any, res: any) => {
  try {
    const issue = await getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Not found' });
    const uid = req.user.uid;
    if (!issue.upvotedBy) issue.upvotedBy = [];
    const hasVoted = issue.upvotedBy.includes(uid);
    if (hasVoted) {
      issue.upvotedBy = issue.upvotedBy.filter((id: string) => id !== uid);
      issue.upvotes = Math.max(0, issue.upvotes - 1);
    } else {
      issue.upvotedBy.push(uid);
      issue.upvotes += 1;
    }
    issue.priorityScore = calculatePriorityScore(issue.severity, issue.upvotes, issue.createdAt);
    issue.updatedAt = new Date().toISOString();
    await saveIssue(issue);
    res.json({ upvotes: issue.upvotes, hasVoted: !hasVoted, priorityScore: issue.priorityScore });
  } catch (error: any) {
    console.error('Upvote error:', error);
    res.status(500).json({ error: 'Failed to process vote' });
  }
});

// ── Update Issue Status (Authority Only) ───────────────────────────────────────
app.patch('/api/issues/:id/status', requireAuth, requireRole('authority'), async (req: any, res: any) => {
  try {
    const { status, note, assignedDepartment, assignedToUid, assignedToName, resolutionNotes } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const issue = await getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const previousStatus = issue.status;
    const now = new Date().toISOString();
    const statusChange = {
      from: previousStatus,
      to: status,
      byUid: req.user.uid,
      byDisplayName: req.user.displayName,
      byRole: req.user.role,
      note: sanitizeText(note || ''),
      timestamp: now,
    };

    if (!issue.statusHistory) issue.statusHistory = [];
    issue.statusHistory.push(statusChange);
    issue.status = status;
    issue.updatedAt = now;

    if (assignedDepartment) issue.assignedDepartment = sanitizeText(assignedDepartment);
    if (assignedToUid) issue.assignedToUid = assignedToUid;
    if (assignedToName) issue.assignedToName = sanitizeText(assignedToName);
    if (resolutionNotes) issue.resolutionNotes = sanitizeText(resolutionNotes);

    // Auto-set SLA deadline on ACKNOWLEDGED
    if (status === 'ACKNOWLEDGED' && !issue.slaDeadline) {
      const slaHours: Record<string, number> = {
        WATER_SUPPLY: 24, ELECTRICITY: 24, PUBLIC_SAFETY: 12,
        ROADS: 168, SANITATION: 72, OTHER: 96,
      };
      const hours = slaHours[issue.category] || 96;
      const deadline = new Date(Date.now() + hours * 3600000);
      issue.slaDeadline = deadline.toISOString();
    }

    issue.priorityScore = calculatePriorityScore(issue.severity, issue.upvotes, issue.createdAt);
    await saveIssue(issue);
    await writeAuditLog({ actorUid: req.user.uid, actorRole: req.user.role, action: 'STATUS_CHANGED', entityType: 'issue', entityId: issue.id, before: { status: previousStatus }, after: { status } });
    res.json(issue);
  } catch (error: any) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ── Add Feedback to Issue ──────────────────────────────────────────────────────
app.post('/api/issues/:id/feedback', requireAuth, async (req: any, res: any) => {
  try {
    const { text, rating } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Feedback text required' });
    const issue = await getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    const entry = {
      id: crypto.randomUUID(),
      uid: req.user.uid,
      displayName: req.user.displayName,
      role: req.user.role,
      text: sanitizeText(text),
      rating: rating ? Math.max(1, Math.min(5, parseInt(rating))) : undefined,
      createdAt: new Date().toISOString(),
    };
    if (!issue.feedback) issue.feedback = [];
    issue.feedback.push(entry);
    issue.updatedAt = new Date().toISOString();
    await saveIssue(issue);
    res.json(entry);
  } catch (error: any) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to add feedback' });
  }
});

// ── Get Issue Timeline ─────────────────────────────────────────────────────────
app.get('/api/issues/:id/timeline', requireAuth, async (req: any, res: any) => {
  try {
    const issue = await getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });
    res.json({
      issue,
      statusHistory: issue.statusHistory || [],
      feedback: issue.feedback || [],
    });
  } catch (error: any) {
    console.error('Timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// ── Export Issues CSV (Authority Only) ────────────────────────────────────────
app.get('/api/export/issues', requireAuth, requireRole('authority'), async (req: any, res: any) => {
  try {
    const issues = await getIssues({ wardId: req.user.wardId });
    const headers = ['Tracking Number', 'Category', 'Status', 'Severity', 'Priority Score', 'Ward', 'Municipality', 'Summary', 'Reporter', 'Created At', 'Updated At'];
    const rows = issues.map(i => [
      i.trackingNumber, i.category, i.status, i.severity, i.priorityScore?.toFixed(2),
      i.ward, i.municipality, `"${(i.summary || '').replace(/"/g, '""')}"`,
      i.reportedByName, i.createdAt, i.updatedAt,
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="issues-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error: any) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── Projects: Get All ──────────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, async (req: any, res: any) => {
  try {
    const { wardId } = req.query;
    const projects = await getProjects(wardId as string);
    res.json(projects);
  } catch (error: any) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// ── Projects: Create (Authority Only) ─────────────────────────────────────────
app.post('/api/projects', requireAuth, requireRole('authority'), async (req: any, res: any) => {
  try {
    const { title, description, department, ward, wardId, municipality, allocatedBudget, targetCompletionDate, status } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Project title required' });
    const projId = `PROJ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date().toISOString();
    const project: any = {
      id: projId,
      title: sanitizeText(title),
      description: sanitizeText(description || '', 5000),
      department: sanitizeText(department || ''),
      ward: sanitizeText(ward || req.user.ward || 'Unknown Ward'),
      wardId: sanitizeText(wardId || req.user.wardId || 'unknown'),
      municipality: sanitizeText(municipality || ''),
      allocatedBudget: sanitizeText(allocatedBudget || ''),
      targetCompletionDate: targetCompletionDate || '',
      status: status || 'PROPOSED',
      positiveVotes: 0,
      negativeVotes: 0,
      votedUsers: {},
      feedback: [],
      createdByUid: req.user.uid,
      createdByName: req.user.displayName,
      createdAt: now,
      updatedAt: now,
    };
    await saveProject(project);
    await writeAuditLog({ actorUid: req.user.uid, actorRole: req.user.role, action: 'CREATED', entityType: 'project', entityId: projId });
    res.status(201).json(project);
  } catch (error: any) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// ── Projects: Update (Authority Only) ─────────────────────────────────────────
app.patch('/api/projects/:id', requireAuth, requireRole('authority'), async (req: any, res: any) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const { title, description, department, allocatedBudget, targetCompletionDate, status } = req.body;
    if (title) project.title = sanitizeText(title);
    if (description !== undefined) project.description = sanitizeText(description, 5000);
    if (department) project.department = sanitizeText(department);
    if (allocatedBudget) project.allocatedBudget = sanitizeText(allocatedBudget);
    if (targetCompletionDate) project.targetCompletionDate = targetCompletionDate;
    if (status) project.status = status;
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    await writeAuditLog({ actorUid: req.user.uid, actorRole: req.user.role, action: 'UPDATED', entityType: 'project', entityId: project.id, after: { status: project.status } });
    res.json(project);
  } catch (error: any) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// ── Projects: Vote ─────────────────────────────────────────────────────────────
app.post('/api/projects/:id/vote', requireAuth, async (req: any, res: any) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    const uid = req.user.uid;
    const { isPositive } = req.body;
    if (!project.votedUsers) project.votedUsers = {};

    const existingVote = project.votedUsers[uid];
    if (existingVote !== undefined) {
      const clickingSame = (existingVote === 'positive' && isPositive) || (existingVote === 'negative' && !isPositive);
      if (clickingSame) {
        if (isPositive) project.positiveVotes = Math.max(0, project.positiveVotes - 1);
        else project.negativeVotes = Math.max(0, project.negativeVotes - 1);
        delete project.votedUsers[uid];
      } else {
        if (isPositive) { project.positiveVotes += 1; project.negativeVotes = Math.max(0, project.negativeVotes - 1); project.votedUsers[uid] = 'positive'; }
        else { project.negativeVotes += 1; project.positiveVotes = Math.max(0, project.positiveVotes - 1); project.votedUsers[uid] = 'negative'; }
      }
    } else {
      if (isPositive) { project.positiveVotes += 1; project.votedUsers[uid] = 'positive'; }
      else { project.negativeVotes += 1; project.votedUsers[uid] = 'negative'; }
    }
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    res.json({ positiveVotes: project.positiveVotes, negativeVotes: project.negativeVotes, userVote: project.votedUsers[uid] || null });
  } catch (error: any) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Failed to process vote' });
  }
});

// ── Projects: Add Feedback ─────────────────────────────────────────────────────
app.post('/api/projects/:id/feedback', requireAuth, async (req: any, res: any) => {
  try {
    const { text, rating } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Feedback text required' });
    const project = await getProjectById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const entry = {
      id: crypto.randomUUID(),
      uid: req.user.uid,
      displayName: req.user.displayName,
      role: req.user.role,
      text: sanitizeText(text),
      rating: rating ? Math.max(1, Math.min(5, parseInt(rating))) : undefined,
      createdAt: new Date().toISOString(),
    };
    if (!project.feedback) project.feedback = [];
    project.feedback.push(entry);
    project.updatedAt = new Date().toISOString();
    await saveProject(project);
    res.json(entry);
  } catch (error: any) {
    console.error('Project feedback error:', error);
    res.status(500).json({ error: 'Failed to add feedback' });
  }
});

// ── AI Ward Analysis (Authority Only) ─────────────────────────────────────────
app.post('/api/analyze-ward', requireAuth, requireRole('authority'), aiLimiter, async (req: any, res: any) => {
  try {
    const issues = await getIssues({ wardId: req.user.wardId });
    const topIssues = issues.slice(0, 30);
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-pro',
      contents: `You are a senior municipal planning expert. Analyze the following civic issues from ${req.user.ward || 'the ward'} and provide a structured strategic resolution plan with specific recommendations, department allocations, and estimated timelines. Format your response clearly with sections.

Issues Data:
${JSON.stringify(topIssues.map(i => ({ id: i.id, category: i.category, severity: i.severity, upvotes: i.upvotes, summary: i.summary, status: i.status, priorityScore: i.priorityScore?.toFixed(2) })), null, 2)}`,
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } },
    });
    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error('Ward analysis error:', error);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

// ── Quick Categorize ───────────────────────────────────────────────────────────
app.post('/api/quick-categorize', requireAuth, async (req: any, res: any) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Text required' });
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: `Categorize this civic issue into exactly one of: ROADS, WATER_SUPPLY, SANITATION, ELECTRICITY, PUBLIC_SAFETY, OTHER. Reply with ONLY the category name, nothing else.\n\nIssue: ${sanitizeText(text)}`,
    });
    const category = validateCategory((response.text || '').trim().toUpperCase());
    res.json({ category });
  } catch (error: any) {
    console.error('Categorize error:', error);
    res.status(500).json({ error: 'Categorization failed' });
  }
});

// ── Transcribe Audio ───────────────────────────────────────────────────────────
app.post('/api/transcribe', requireAuth, aiLimiter, upload.single('audio'), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Audio file is required' });
    const response = await getAI().models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } }, { text: 'Transcribe this audio precisely in its original language. Do not translate.' }] }],
    });
    res.json({ transcription: response.text });
  } catch (error: any) {
    console.error('Transcribe error:', error);
    res.status(500).json({ error: 'Transcription failed' });
  }
});

// ── Ward Analytics (Authority Only) ───────────────────────────────────────────
app.get('/api/analytics/ward-stats', requireAuth, requireRole('authority'), async (req: any, res: any) => {
  try {
    const issues = await getIssues({ wardId: req.user.wardId });
    const stats = {
      totalOpen: issues.filter(i => i.status === 'OPEN').length,
      totalInProgress: issues.filter(i => i.status === 'IN_PROGRESS').length,
      totalResolved: issues.filter(i => i.status === 'RESOLVED' || i.status === 'CLOSED').length,
      totalRejected: issues.filter(i => i.status === 'REJECTED').length,
      byCategory: {} as Record<string, number>,
      byDay: [] as any[],
      slaBreaches: 0,
    };
    for (const issue of issues) {
      stats.byCategory[issue.category] = (stats.byCategory[issue.category] || 0) + 1;
      if (issue.slaDeadline && new Date(issue.slaDeadline) < new Date() && issue.status !== 'RESOLVED' && issue.status !== 'CLOSED') {
        stats.slaBreaches += 1;
      }
    }
    // Last 30 days by day
    const dayMap: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dayMap[d.toISOString().slice(0, 10)] = 0;
    }
    for (const issue of issues) {
      const day = issue.createdAt?.slice(0, 10);
      if (day && dayMap[day] !== undefined) dayMap[day]++;
    }
    stats.byDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }));
    res.json(stats);
  } catch (error: any) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Analytics failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  SERVER STARTUP + VITE + WEBSOCKET
// ═══════════════════════════════════════════════════════════════════════════════

// Multer error handler
app.use((err: any, _req: any, res: any, next: any) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
  if (err.message?.includes('not allowed')) return res.status(415).json({ error: err.message });
  next(err);
});

async function startServer() {
  await initFirebase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CivicEngine Server running on http://localhost:${PORT}`);
    console.log(`🔥 Firebase: ${db ? 'Connected (Firestore + Storage)' : 'Local mode (in-memory)'}`);
  });

  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (clientWs, req) => {
    // Validate auth token before starting session
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const latParam = parseFloat(url.searchParams.get('lat') || '');
    const lngParam = parseFloat(url.searchParams.get('lng') || '');
    const lat = isNaN(latParam) ? 12.687 : latParam;
    const lng = isNaN(lngParam) ? 78.615 : lngParam;

    let userInfo = { uid: 'anonymous', displayName: 'Citizen', role: 'citizen', wardId: 'unknown' };

    if (adminAuth && token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        userInfo = { uid: decoded.uid, displayName: decoded.name || decoded.email || decoded.uid, role: decoded.role || 'citizen', wardId: decoded.wardId || 'unknown' };
      } catch {
        clientWs.close(4001, 'Unauthorized');
        return;
      }
    } else if (token) {
      // Local fallback mode token check
      if (token === 'mock_token_authority') {
        userInfo = { uid: 'mock_officer_uid', displayName: 'Ward Officer', role: 'authority', wardId: 'ward_004' };
      } else if (token === 'mock_token_citizen') {
        userInfo = { uid: 'mock_citizen_uid', displayName: 'Mock Citizen', role: 'citizen', wardId: 'ward_004' };
      }
    }

    const language = url.searchParams.get('language') || 'en';
    const languageMap: Record<string, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil', kn: 'Kannada', te: 'Telugu' };
    const languageInstruction = languageMap[language] || 'English';
    let session: any = null;
    let mediaStream: any = null;

    try {
      session = await getAI().live.connect({
        model: 'gemini-2.0-flash-exp',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are a skilled, empathetic civic emergency operator for an Indian municipal corporation. Converse only in ${languageInstruction}. Your job: collect a civic issue report from the citizen. Ask concise follow-up questions for missing location landmarks or issue scale. Once you have enough info (location, category, severity), use the submit_report tool and confirm the report has been logged with a tracking number. Keep responses under 25 words. Do not say you are an AI.`,
          tools: [{
            functionDeclarations: [{
              name: 'submit_report',
              description: 'Submits the civic issue report to the municipal system.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING, description: 'ROADS|WATER_SUPPLY|SANITATION|ELECTRICITY|PUBLIC_SAFETY|OTHER' },
                  summary: { type: Type.STRING, description: 'Summary in English' },
                  location: { type: Type.STRING, description: 'Location or landmark mentioned by citizen' },
                  severity: { type: Type.INTEGER, description: 'Severity 1-5' },
                },
                required: ['category', 'summary', 'location', 'severity'],
              },
            }],
          }],
        },
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            if (clientWs.readyState !== 1) return;
            const audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audio) clientWs.send(JSON.stringify({ audio }));
            if (message.serverContent?.interrupted) clientWs.send(JSON.stringify({ interrupted: true }));
            if (message.toolCall) {
              const call = message.toolCall.functionCalls[0];
              if (call.name === 'submit_report') {
                const args = call.args as any;
                const Sg = clampSeverity(args.severity);
                const issueId = newIssueId();
                const trackingNumber = await generateTrackingNumber();
                const now = new Date().toISOString();

                let wardInfo = {
                  ward: 'Unknown Ward',
                  wardId: userInfo.wardId || 'unknown',
                  municipality: 'Unknown Municipality',
                  district: 'Unknown District',
                  state: 'India'
                };
                try {
                  const resolved = await detectWard(lat, lng);
                  if (resolved) wardInfo = resolved;
                } catch (e) {
                  console.warn('Pre-resolution of ward in WS submit failed:', e);
                }

                // 2. Fetch active issues in this ward to feed duplicate detector
                const activeIssues = await getIssues({ wardId: wardInfo.wardId });
                const activeWardIssuesSnippet = activeIssues
                  .filter(i => i.status === 'OPEN' || i.status === 'IN_PROGRESS' || i.status === 'ACKNOWLEDGED')
                  .map(i => ({
                    id: i.id,
                    trackingNumber: i.trackingNumber,
                    category: i.category,
                    summary: i.summary
                  }))
                  .slice(0, 15);

                let duplicateId: string | null = null;
                let tags: string[] = [`#${(args.category || 'other').toLowerCase()}`];
                let safetyHazardPresent = false;
                let safetyHazardDetails: string | null = null;

                try {
                  const dupPrompt = `Compare this voice civic report with the active issues in the same ward to detect duplicate submissions.
Report Description: "${args.summary} [Location: ${args.location}]"
Report Category: "${args.category}"

If it represents the exact same physical issue at the same location, set "is_duplicate_of_issue_id" to the matching issue's ID.
Also, tag the report with relevant hashtags and identify if there is an immediate safety hazard (e.g. exposed live power lines, open deep pits/manholes, falling structures).

Active Ward Issues:
${JSON.stringify(activeWardIssuesSnippet, null, 2)}

Reply ONLY with JSON:
{
  "is_duplicate_of_issue_id": "string or null",
  "auto_generated_tags": ["string"],
  "safety_hazard_present": boolean,
  "safety_hazard_details": "string or null"
}`;
                  const resp = await getAI().models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: dupPrompt }] }],
                    config: { responseMimeType: 'application/json' },
                  });
                  const parsedDup = JSON.parse(cleanJson(resp.text || '{}'));
                  duplicateId = parsedDup.is_duplicate_of_issue_id || null;
                  if (parsedDup.auto_generated_tags) tags = parsedDup.auto_generated_tags;
                  safetyHazardPresent = !!parsedDup.safety_hazard_present;
                  safetyHazardDetails = parsedDup.safety_hazard_details || null;
                } catch (geminiErr) {
                  console.error('Gemini duplicate check in WS failed, using fallback:', geminiErr);
                }

                if (duplicateId) {
                  const existingIssue = await getIssueById(duplicateId);
                  if (existingIssue) {
                    if (!existingIssue.upvotedBy) existingIssue.upvotedBy = [];
                    const hasVoted = existingIssue.upvotedBy.includes(userInfo.uid);
                    if (!hasVoted) {
                      existingIssue.upvotedBy.push(userInfo.uid);
                      existingIssue.upvotes = (existingIssue.upvotes || 0) + 1;
                    }
                    existingIssue.priorityScore = calculatePriorityScore(existingIssue.severity, existingIssue.upvotes, existingIssue.createdAt);
                    existingIssue.updatedAt = new Date().toISOString();

                    const newFeedback = {
                      id: crypto.randomUUID(),
                      uid: userInfo.uid,
                      displayName: userInfo.displayName,
                      role: 'citizen',
                      text: `[System Update] Another citizen reported this same issue via Voice Assistant. Duplicate report reference created.`,
                      createdAt: new Date().toISOString()
                    };
                    if (!existingIssue.feedback) existingIssue.feedback = [];
                    existingIssue.feedback.push(newFeedback);

                    await saveIssue(existingIssue);
                    await writeAuditLog({
                      actorUid: userInfo.uid,
                      actorRole: userInfo.role,
                      action: 'DUPLICATE_UPVOTE',
                      entityType: 'issue',
                      entityId: existingIssue.id,
                      after: { upvotes: existingIssue.upvotes }
                    });

                    clientWs.send(JSON.stringify({ event: 'report_submitted', issue: { ...existingIssue, isDuplicate: true } }));
                    session.sendToolResponse({ functionResponses: [{ name: call.name, id: call.id, response: { result: `Report logged. Checked duplicate: registered upvote for reference ${existingIssue.trackingNumber}.` } }] });
                    return;
                  }
                }

                const geohash = geohashForLocation([lat, lng]);
                const newIssue: any = {
                  id: issueId,
                  trackingNumber,
                  category: validateCategory(args.category || 'OTHER'),
                  status: 'OPEN',
                  severity: Sg,
                  priorityScore: calculatePriorityScore(Sg, 0, now),
                  summary: sanitizeText(`${args.summary} [Location: ${args.location}]`),
                  isVerified: true,
                  isSpam: false,
                  coordinates: { latitude: lat, longitude: lng },
                  geohash,
                  ward: wardInfo.ward,
                  wardId: wardInfo.wardId,
                  municipality: wardInfo.municipality,
                  district: wardInfo.district,
                  state: wardInfo.state,
                  reportedBy: userInfo.uid,
                  reportedByName: userInfo.displayName,
                  upvotes: 0,
                  upvotedBy: [],
                  feedback: [],
                  statusHistory: [],
                  createdAt: now,
                  updatedAt: now,
                  tags,
                  safetyHazardPresent,
                  safetyHazardDetails,
                  landmarkGpsMatch: true
                };
                await saveIssue(newIssue);
                await writeAuditLog({ actorUid: userInfo.uid, actorRole: userInfo.role, action: 'CREATED', entityType: 'issue', entityId: issueId, after: { status: 'OPEN', severity: Sg } });
                clientWs.send(JSON.stringify({ event: 'report_submitted', issue: newIssue }));
                session.sendToolResponse({ functionResponses: [{ name: call.name, id: call.id, response: { result: `Report logged successfully. Tracking: ${trackingNumber}.` } }] });
              }
            }
          },
        },
      });

      clientWs.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio && session) {
            session.sendRealtimeInput({ audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' } });
          }
        } catch (err) {
          console.error('Live WS message error:', err);
        }
      });

      clientWs.on('error', (err) => {
        console.error('Client WebSocket error:', err);
      });

      clientWs.on('close', async () => {
        try {
          if (session) await session.close?.();
          if (mediaStream) {
            mediaStream.getTracks?.().forEach((t: any) => t.stop?.());
          }
        } catch { /* best effort cleanup */ }
        console.log(`Live session closed for user ${userInfo.uid}`);
      });

    } catch (err) {
      console.error('Failed to connect to Live API:', err);
      if (clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({ error: 'Failed to start live session' }));
        clientWs.close();
      }
    }
  });
}

startServer();
