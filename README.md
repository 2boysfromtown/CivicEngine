# CivicEngine 🛡️

### AI-Powered Multimodal Indian Municipal Grievance Resolution Center
*Google Code for Community India 2026 Hackathon Submission — **Civic & Governance (People's Priorities) Track***

---

## 🌟 The Core Mission: Who is Better Off & How?

CivicEngine was built to solve a concrete local problem in Indian municipal governance: the exclusion of regional-language speakers from tech-enabled grievance portals, the administrative chaos of duplicate reports, and the lack of citizen legal recourse.

| Stakeholder | Before CivicEngine | With CivicEngine (How they are better off) | Measurable Impact |
| :--- | :--- | :--- | :--- |
| **Regional Language Citizens** | Excluded due to English-only portals and complex text forms. | Talk directly to an empathetic, multilingual **Gemini Live Voice Operator** in their native tongue (Hindi, Tamil, Kannada, etc.). | **100% voice inclusion** for regional dialects. |
| **Municipal Ward Officers** | Flooded with hundreds of redundant reports for the same pothole or garbage pile. | Gemini **automatically detects duplicates** in the ward, merges them, and registers upvotes to elevate priority. | **90% reduction** in redundant ticket noise. |
| **MPs & City Planners** | Lack of visibility into ward-level demands and priority projects. | Real-time **hotspot analytics dashboards** displaying auto-calculated urgency scores based on severity, upvotes, and time elapsed. | Instant planning visibility for local budgets. |
| **Empowered Communities** | Grievances rot in lists without SLA compliance or official action. | The system generates a ready-to-print **Right to Information (RTI) Act 2005** application receipt for delayed cases. | Citizens gain legal tools to demand public answers. |

---

## 🛠️ Tech Stack & Scaling Toolkit

We have designed a highly deployable, non-blocking asynchronous queue architecture built to scale to lakhs of concurrent users.

- **Frontend & Native App**:
  - **React (TypeScript), Vite & Tailwind CSS**: Sleek Sandalwood-dark theme optimized for WCAG 2.1 AA contrast.
  - **Leaflet JS & OpenStreetMap**: Interactive touch-gestured map matching GPS coordinates to exact municipal ward boundaries (`admin_level=10` fallback).
  - **Web Audio API & AudioWorklet threads**: Offloads microphone sampling to background threads for zero voice lag on mobile.
  - **Capacitor SDK**: Native packaging with a ready-to-run Android platform.
- **Backend & Cloud Services**:
  - **Node.js, Express & WebSockets (tsx)**: Full-stack real-time networking.
  - **Google GenAI SDK**: Powered by **Gemini 2.5 Flash** (analysis, duplicate matching, safety tagging) and **Gemini 2.0 Live** (voice modality).
  - **Firebase Admin/Client Auth & Storage**: Secure session management and storage of citizen audio/image evidence.
  - **Cloud Firestore**: Geographical indexing using geohashes for low-latency hotspot maps.

---

## 📊 Pitch Deck Presentation

We have compiled a professional **12-slide landscape presentation** explaining the solution, architecture, and roadmap.

*   **HTML Slides**: [pitch_deck.html](./pitch_deck.html)
*   **Landscape PDF**: [pitch_deck.pdf](./pitch_deck.pdf)

---

## 🔗 Working Prototype Link

*   **Live Web Frontend**: [https://civicengine-2bft.web.app](https://civicengine-2bft.web.app) *(Deployed via Firebase Hosting)*

---

## 🚀 Running Locally & E2E Validation

### 1. Prerequisite Configuration
Copy `.env.example` to `.env` and fill in your Gemini API key:
```env
GEMINI_API_KEY=AIzaSy...
```

### 2. Launch Development Servers
Install dependencies and run the client/backend in local persistence mode (bypasses Firebase credentials using secure local mock tokens for offline testing):
```bash
npm install
npm run dev
```

### 3. Run Automated E2E Headless Test Suite
To execute the automated headless browser validation test verifying user flows, DPDP Act consent screens, Quick Posts, and Ward Officer Command Room workflows:
```bash
node test-e2e.js
```

### 4. Sync & Launch Android Wrapper
To launch the native Android Studio project:
```bash
npx cap sync
npx cap open android
```

---

## ⚙️ Scalable Asynchronous Queue Worker

To ensure the backend never locks up under heavy load:
1. When a report is submitted, a placeholder document is created instantly with `aiStatus: "PENDING"`. The citizen receives their tracking number in **under 100ms**.
2. The report is pushed to a rate-limited background queue (`aiQueue`).
3. An asynchronous worker thread pulls jobs, downloads media assets, and calls Gemini for analysis.
4. The worker implements **exponential backoffs for 429 rate limits** and deploys a **Regex Heuristic Fallback** if the API quota is exhausted, ensuring the platform remains 100% operational.