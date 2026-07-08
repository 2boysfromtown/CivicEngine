# CivicEngine 🛡️

### AI-Powered Multimodal Indian Municipal Grievance Resolution Center
*Google Code for Community India 2026 Hackathon Submission — **Civic & Governance (People's Priorities) Track***

---

## 🌟 The Core Mission: Who is Better Off & How?

CivicEngine was built to solve a concrete local problem in Indian municipal governance: the exclusion of regional-language speakers from tech-enabled grievance portals, the administrative chaos of duplicate reports, and the lack of citizen legal recourse.

| Stakeholder | Before CivicEngine | With CivicEngine (How they are better off) | Intended / Measurable Impact |
| :--- | :--- | :--- | :--- |
| **Regional Language Citizens** | Excluded due to English-only portals and complex text forms. | Talk directly to an empathetic, multilingual **Gemini Live Voice Operator** in their native tongue (Hindi, Tamil, Kannada, etc.). | Designed for voice-first inclusion across supported Indian languages. |
| **Municipal Ward Officers** | Flooded with hundreds of redundant reports for the same pothole or garbage pile. | Gemini-assisted duplicate detection can merge repeated reports into upvotes so officers see priority, not noise. | Measure duplicate precision/recall and reduction in redundant tickets during pilot testing. |
| **MPs & City Planners** | Lack of visibility into ward-level demands and priority projects. | Real-time **hotspot analytics dashboards** display urgency scores based on severity, upvotes, and time elapsed. | Faster visibility into ward-level demand patterns and budget priorities. |
| **Empowered Communities** | Grievances rot in lists without SLA compliance or official action. | The system can generate a ready-to-print **Right to Information (RTI) Act 2005** application receipt for delayed cases. | Citizens gain a clearer escalation path when public answers are delayed. |

---

## 🛠️ Tech Stack & Scaling Toolkit

CivicEngine is a hackathon MVP with a full-stack prototype and a clear path to scalable deployment. Before a public municipal pilot, complete the production hardening checklist in [`docs/production-hardening-checklist.md`](./docs/production-hardening-checklist.md).

- **Frontend & Native App**:
  - **React (TypeScript), Vite & Tailwind CSS**: Sleek Sandalwood-dark theme optimized for WCAG 2.1 AA contrast.
  - **Leaflet JS & OpenStreetMap**: Interactive touch-gestured map matching GPS coordinates to municipal ward boundaries where boundary data is available.
  - **Web Audio API & AudioWorklet threads**: Offloads microphone sampling to background threads for lower voice lag on mobile.
  - **Capacitor SDK**: Native packaging with a ready-to-run Android platform.
- **Backend & Cloud Services**:
  - **Node.js, Express & WebSockets (tsx)**: Full-stack real-time networking.
  - **Google GenAI SDK**: Powered by **Gemini 2.5 Flash** for analysis, duplicate matching, and safety tagging, plus **Gemini Live** for voice modality.
  - **Firebase Admin/Client Auth & Storage**: Secure session management and storage of citizen audio/image evidence.
  - **Cloud Firestore**: Persistent storage with geohash fields for hotspot and ward-level queries.

---

## 📊 Pitch Deck Presentation

We have compiled a professional **12-slide landscape presentation** explaining the solution, architecture, and roadmap.

*   **HTML Slides**: [pitch_deck.html](./pitch_deck.html)
*   **Landscape PDF**: [pitch_deck.pdf](./pitch_deck.pdf)

---

## 🔗 Working Prototype Link

*   **Live Web Frontend**: [https://civicengine-2026.web.app](https://civicengine-2026.web.app) *(Deployed via Firebase Hosting)*
*   **Live Full-Stack Backend**: [https://civicengine.onrender.com](https://civicengine.onrender.com) *(Deployed via Render, supporting WebSockets)*

---

## 🚀 Running Locally & E2E Validation

### 1. Prerequisite Configuration

Copy `.env.example` to `.env` and fill in your Gemini API key:
```env
GEMINI_API_KEY=AIzaSy...
```

For Firebase-backed persistence, also configure Firebase Admin and Firebase Web SDK values from `.env.example`. Without Firebase server configuration, the app runs in local demo mode using an in-memory store.

### 2. Launch Development Servers

Install dependencies and run the client/backend in local persistence mode:
```bash
npm install
npm run dev
```

### 3. Typecheck and Build

```bash
npm run ci
```

### 4. Run Automated E2E Headless Test Suite

To execute the automated headless browser validation test verifying user flows, DPDP Act consent screens, Quick Posts, and Ward Officer Command Room workflows:
```bash
npm run test:e2e
```

### 5. Sync & Launch Android Wrapper

To launch the native Android Studio project:
```bash
npx cap sync
npx cap open android
```

---

## ⚙️ Current Async Queue Behavior

To keep the prototype responsive:

1. When a report is submitted, a placeholder document is created instantly with `aiStatus: "PENDING"`.
2. The citizen receives their tracking number immediately.
3. The report is pushed to the current in-process AI queue.
4. A worker processes media assets and calls Gemini for analysis.
5. If AI processing fails repeatedly, regex fallback triage keeps the report flow usable.

> Production note: the current in-memory queue is demo-grade. Before a real pilot, move queue jobs to Cloud Tasks, Pub/Sub, Firestore queue documents, or Redis/BullMQ so jobs survive restarts and scale across app instances.

---

## 🔐 Production Readiness Notes

This repository is currently best treated as a **hackathon MVP / pilot prototype**. Before using it for real municipal complaints, harden these areas:

- Fail closed in production if Firebase Admin is missing or fails to initialize.
- Make uploaded citizen evidence private by default; use signed URLs or authenticated media routes.
- Do not assign demo fallback GPS coordinates to reports with missing or invalid location.
- Replace the in-memory AI queue with durable queue infrastructure.
- Add Firestore and Storage security rules to the repository.
- Add request schema validation for all API routes.
- Add more tests for auth, invalid GPS, MIME rejection, duplicate merge, spam rejection, and status workflow.

See [`docs/production-hardening-checklist.md`](./docs/production-hardening-checklist.md) for the detailed checklist.
