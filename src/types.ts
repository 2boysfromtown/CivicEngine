/**
 * CivicEngine — Complete Type Definitions
 * All runtime fields included, government-grade status workflow
 */

// ─── Enums & Unions ────────────────────────────────────────────────────────

export type IssueCategory =
  | 'ROADS'
  | 'WATER_SUPPLY'
  | 'SANITATION'
  | 'ELECTRICITY'
  | 'PUBLIC_SAFETY'
  | 'OTHER';

export type IssueStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REJECTED'
  | 'REOPENED';

export type ProjectStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PAUSED';

export type UserRole = 'citizen' | 'authority' | 'admin';

// ─── Feedback ───────────────────────────────────────────────────────────────

export interface FeedbackEntry {
  id: string;
  uid: string;
  displayName: string;
  role: UserRole;
  text: string;
  rating?: number; // 1–5 stars (optional, for projects)
  createdAt: string; // ISO
}

// ─── Audit ──────────────────────────────────────────────────────────────────

export interface StatusChange {
  from: IssueStatus;
  to: IssueStatus;
  byUid: string;
  byDisplayName: string;
  byRole: UserRole;
  note?: string;
  timestamp: string; // ISO
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorUid: string;
  actorRole: UserRole;
  action: string;
  entityType: 'issue' | 'project' | 'user';
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

// ─── Location ────────────────────────────────────────────────────────────────

export interface WardLocation {
  ward: string;          // "Ward 42"
  wardId: string;        // "ward_042"
  municipality: string;  // "Greater Chennai Corporation"
  municipalityId: string;
  district: string;
  state: string;
  source: 'datameet' | 'osm' | 'google' | 'cache' | 'unknown';
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// ─── Issue ───────────────────────────────────────────────────────────────────

export interface Issue {
  id: string;
  trackingNumber: string;         // "CE/2026/07/00042"
  category: IssueCategory;
  status: IssueStatus;
  severity: number;               // 1–5
  priorityScore: number;          // calculated by algorithm
  summary: string;
  rawTranscription?: string;
  visualAnalysis?: string;
  landmarkClues?: string;
  isVerified: boolean;
  isSpam: boolean;
  spamReason?: string | null;
  // Location
  coordinates: Coordinates;
  geohash: string;                // for geo queries
  ward: string;
  wardId: string;
  municipality: string;
  district: string;
  state: string;
  // Media (Cloud Storage URLs, never base64)
  imageUrl?: string;
  audioUrl?: string;
  // Citizens
  reportedBy: string;             // uid
  reportedByName: string;
  upvotes: number;
  upvotedBy: string[];            // uid[]
  // Authority
  assignedToUid?: string;
  assignedToName?: string;
  assignedDepartment?: string;
  slaDeadline?: string;           // ISO
  resolutionNotes?: string;
  // Feedback & History
  feedback: FeedbackEntry[];
  statusHistory: StatusChange[];
  // Timestamps
  createdAt: string;
  updatedAt: string;
  // Extra Hackathon analytics
  tags?: string[];
  safetyHazardPresent?: boolean;
  safetyHazardDetails?: string | null;
  landmarkGpsMatch?: boolean;
  aiStatus?: 'PENDING' | 'COMPLETED' | 'SPAM' | 'DUPLICATE' | 'FAILED';
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  title: string;
  description: string;            // Full rich description [NEW]
  department: string;
  ward: string;
  wardId: string;
  municipality: string;
  allocatedBudget: string;        // "₹4.2 Crores"
  targetCompletionDate: string;
  status: ProjectStatus;
  positiveVotes: number;
  negativeVotes: number;
  votedUsers: Record<string, 'positive' | 'negative'>;
  feedback: FeedbackEntry[];      // [NEW]
  imageUrl?: string;              // project banner
  createdByUid: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface CivicUser {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  language: string;
  // Authority only
  ward?: string;
  wardId?: string;
  department?: string;
  municipality?: string;
  municipalityId?: string;
  createdAt: string;
  lastLoginAt: string;
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  code?: string;
}

export interface TrackingNumberResponse {
  trackingNumber: string;
}

export interface WardDetectResponse extends WardLocation {
  coordinates: Coordinates;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface WardStats {
  totalOpen: number;
  totalInProgress: number;
  totalResolved: number;
  totalRejected: number;
  avgResolutionHours: number;
  slaBreaches: number;
  byCategory: Record<IssueCategory, number>;
  byDay: { date: string; count: number }[];
}

// ─── Department list (India government departments) ──────────────────────────

export const DEPARTMENTS = [
  'Roads & Highways',
  'Water Supply & Sewerage',
  'Sanitation & Solid Waste',
  'Electricity & Street Lighting',
  'Public Safety & Police Liaison',
  'Parks & Recreation',
  'Building & Planning',
  'Revenue & Finance',
  'Health & Sanitation',
  'General Administration',
] as const;

export type Department = typeof DEPARTMENTS[number];

// ─── Issue category helpers ──────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  ROADS: 'Roads / Potholes',
  WATER_SUPPLY: 'Water Supply',
  SANITATION: 'Sanitation / Trash',
  ELECTRICITY: 'Electricity / Streetlights',
  PUBLIC_SAFETY: 'Public Safety',
  OTHER: 'Other',
};

export const CATEGORY_EMOJI: Record<IssueCategory, string> = {
  ROADS: '🚗',
  WATER_SUPPLY: '💧',
  SANITATION: '🧹',
  ELECTRICITY: '⚡',
  PUBLIC_SAFETY: '🛡️',
  OTHER: '📁',
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  OPEN: 'Open',
  ACKNOWLEDGED: 'Acknowledged',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected (Spam)',
  REOPENED: 'Reopened',
};

export const STATUS_COLORS: Record<IssueStatus, string> = {
  OPEN: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  ACKNOWLEDGED: 'bg-blue-100 text-blue-800 border-blue-200',
  ASSIGNED: 'bg-purple-100 text-purple-800 border-purple-200',
  IN_PROGRESS: 'bg-orange-100 text-orange-800 border-orange-200',
  RESOLVED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-gray-100 text-gray-600 border-gray-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  REOPENED: 'bg-pink-100 text-pink-800 border-pink-200',
};

// Valid status transitions (authority)
export const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'REJECTED'],
  ACKNOWLEDGED: ['ASSIGNED', 'IN_PROGRESS'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REJECTED: [],
  REOPENED: ['ACKNOWLEDGED', 'IN_PROGRESS'],
};
