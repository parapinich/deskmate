# DeskMate — Architecture

## System Overview

DeskMate is a desktop AI study agent with a client-server architecture. The desktop client (Tauri) captures screenshots and sends them to a cloud backend (FastAPI on Cloud Run), which uses Gemini 2.0 Flash via Vertex AI to analyze content and generate practice questions.

```
┌──────────────────────────────────────────────────────────────────┐
│                      USER'S COMPUTER                             │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 TAURI DESKTOP APP                        │   │
│  │                                                          │   │
│  │  ┌────────────────┐  invoke()  ┌──────────────────────┐ │   │
│  │  │ Frontend UI    │──────────► │  Rust (main.rs)      │ │   │
│  │  │ (HTML/CSS/JS)  │           │  Tauri Commands       │ │   │
│  │  │                │ ◄──────── └──────────┬────────────┘ │   │
│  │  │ - Questions    │  results              │ spawn        │   │
│  │  │ - Score        │                       ▼              │   │
│  │  │ - Session UI   │             ┌─────────────────────┐ │   │
│  │  └────────┬───────┘             │  Python Sidecar     │ │   │
│  │           │                     │  (capture.py + mss) │ │   │
│  │           │                     │  Native OS capture  │ │   │
│  │           │                     └─────────────────────┘ │   │
│  └───────────┼──────────────────────────────────────────────┘   │
└──────────────┼───────────────────────────────────────────────────┘
               │ WebSocket (base64 JPEG, every 10s)
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD RUN                              │
│                                                                  │
│  FastAPI: /ws/study-session  /api/answer  /api/summary  /health  │
│                                                                  │
│  ┌─────────────────────┐   ┌────────────────────────────────┐   │
│  │   session_manager   │   │  deskmate_agent               │   │
│  │   (in-memory)       │   │  + question_generator          │   │
│  └─────────────────────┘   └────────────────┬───────────────┘   │
└───────────────────────────────────────────── ┼───────────────────┘
                                               │ Vertex AI API
                                               ▼
                               ┌───────────────────────────────┐
                               │       GOOGLE VERTEX AI         │
                               │  gemini-2.0-flash (multimodal) │
                               │  Input:  JPEG screenshot       │
                               │  Output: JSON questions        │
                               └───────────────────────────────┘
```

## Tech Stack

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

## Data Flow

1. **Capture** — Every 10 seconds, Tauri invokes the Python sidecar (`capture.py`) which uses `mss` to grab a native OS screenshot of the primary monitor.

2. **Send** — The screenshot is resized to max 1280x1280, JPEG-compressed, base64-encoded, and sent via WebSocket to the Cloud Run backend.

3. **Analyze** — The backend passes the image to Gemini 2.0 Flash with a system prompt. Gemini determines if study material is visible and generates 1-3 practice questions.

4. **Deduplicate** — MD5 hashing prevents re-generating questions for the same slide/page if the screen hasn't changed.

5. **Display** — Questions slide into the sidebar UI. The student answers, and the answer is evaluated by Gemini for feedback.

6. **Annotate** — A transparent overlay highlights the screen region relevant to each question (3×3 grid system).

7. **Summarize** — At session end, the student gets a summary with topics covered, score percentage, and weak areas.

## Key Design Decisions

- **Native screenshots (mss)** instead of browser `getDisplayMedia` — works with ANY application, not just browser tabs.
- **Vertex AI** instead of AI Studio API keys — satisfies competition requirement for Google Cloud usage.
- **WebSocket** instead of REST polling — real-time bidirectional communication for lower latency.
- **In-memory sessions** — no database needed; keeps architecture simple for a demo/competition.
- **3×3 grid annotation** instead of pixel-perfect bounding boxes — reliable enough for visual guidance without complex coordinate extraction.
