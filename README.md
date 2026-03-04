# DeskMate — Proactive AI Study Agent 🎓

> A desktop application that visually observes your screen and autonomously generates practice questions to test your understanding — powered by Gemini 2.0 Flash on Vertex AI.

**Built for the Gemini Live Agent Challenge — UI Navigator Category**

---

## 🎯 What is DeskMate?

DeskMate is a **proactive AI study coach** that silently watches your screen using native OS screenshot capture. It identifies study material (slides, PDFs, textbooks, code tutorials) and automatically generates contextual practice questions — without DOM access, using only Gemini's visual understanding.

### Key Features
- 📸 **Native screen monitoring** — works with ANY application (PowerPoint, Adobe, browsers, etc.)
- 🧠 **Gemini visual understanding** — analyzes screenshots to identify study content
- ❓ **Real-time question generation** — MCQ, short answer, and explanation questions
- ✅ **AI answer evaluation** — encouraging, honest feedback with hints
- 📊 **Session summary** — topics covered, score %, weak areas
- 🎯 **Screen annotations** — highlights relevant screen regions for each question

---

## 🏗️ Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop wrapper | Tauri v2 (Rust) | Native app + sidecar management |
| Frontend | HTML/CSS/Vanilla JS | Question UI inside Tauri window |
| Screen capture | Python + mss | Native OS-level screenshot (any app) |
| Transport | WebSocket | Real-time screenshot streaming |
| Backend | FastAPI (Python) | API server |
| AI Framework | Google GenAI SDK | Gemini integration |
| AI Model | Gemini 2.0 Flash | Visual understanding + question gen |
| Cloud Hosting | Google Cloud Run | Serverless backend |
| AI Platform | Vertex AI | Managed Gemini API (GCP compliant) |

---

## 📁 Project Structure

```
deskmate/
├── backend/                          # Python FastAPI — deployed to Cloud Run
│   ├── main.py
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── deskmate_agent.py        # Core agent logic
│   │   ├── question_generator.py     # Gemini API caller
│   │   └── session_manager.py        # In-memory session tracking
│   ├── requirements.txt
│   └── Dockerfile
├── desktop/                          # Tauri desktop app
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   └── src/
│   │       ├── main.rs               # Tauri main + screenshot command
│   │       └── annotation_window.rs  # Screen annotation overlay
│   ├── src/
│   │   ├── index.html
│   │   ├── annotation.html
│   │   ├── style.css
│   │   └── app.js                    # WebSocket client + UI logic
│   └── package.json
├── screencapture/                    # Python sidecar for native screenshots
│   ├── capture.py
│   └── requirements.txt
├── .env.example
├── .github/workflows/build.yml        # CI/CD pipeline
├── cloudbuild.yaml
├── gcp_proof/
│   └── vertex_ai_call.py
├── ARCHITECTURE.md
├── SUBMISSION_DESCRIPTION.md
├── DEMO_SCRIPT.md
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- **Rust** — [rustup.rs](https://rustup.rs)
- **Node.js v18+** — [nodejs.org](https://nodejs.org)
- **Python 3.9+**
- **Google Cloud CLI** — [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install)
- **Tauri CLI** — `npm install -g @tauri-apps/cli`

### Google Cloud Setup (one-time)
```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project deskmate-488522
gcloud services enable aiplatform.googleapis.com
```

### Local Development

**1. Backend**
```bash
cd backend
pip install -r requirements.txt

# Set your GCP Project ID (see .env.example)
export GCP_PROJECT_ID=deskmate-488522   # Linux/Mac
set GCP_PROJECT_ID=deskmate-488522      # Windows CMD
$env:GCP_PROJECT_ID="deskmate-488522"   # PowerShell

uvicorn main:app --reload --port 8080
```

**2. Screen Capture Sidecar**
```bash
cd screencapture
pip install -r requirements.txt
```

**3. Desktop App**
```bash
cd desktop
npm install
npm run tauri dev
```

### Deploy to Cloud Run
```bash
gcloud auth login
gcloud config set project deskmate-488522
gcloud builds submit --config cloudbuild.yaml
```

---

## ☁️ Google Cloud Proof

- **Health endpoint:** `https://deskmate-backend-<hash>.run.app/health`
- **Vertex AI proof script:** `python gcp_proof/vertex_ai_call.py`

---

## 📄 License

This project was built for the Gemini Live Agent Challenge.
