# DeskMate — Submission Description

## Summary

DeskMate is a proactive AI study desktop agent for the **UI Navigator** category. It silently watches the student's screen using native OS screenshot capture and autonomously generates contextual practice questions based on whatever study material is visible — PowerPoint, PDFs, any application — without DOM access, using only Gemini's visual understanding.

## Problem

Students study passively — reading slides without testing themselves, which is one of the least effective learning strategies. Personal tutors are expensive. Existing AI tools require manual copy-pasting of content. DeskMate acts as an always-on proactive study coach, backed by the science of **retrieval practice** — the most evidence-based learning technique.

## How It Works

1. DeskMate runs as a slim sidebar on the right side of the screen
2. Every 10 seconds, it captures a native OS screenshot (works with ANY app)
3. Gemini 2.0 Flash analyzes the screenshot via Vertex AI
4. If study material is detected, 1-3 practice questions are generated
5. The student answers inline; Gemini evaluates with encouraging feedback
6. A transparent overlay highlights the relevant screen region (UI Navigator action)
7. At session end, a summary shows topics, score, and weak areas

## Features

- **Native screen monitoring** — any app via mss sidecar (not browser-limited)
- **Gemini visual content understanding** — multimodal image analysis
- **Intelligent study/non-study filtering** — silently ignores non-academic content
- **Real-time question generation** — MCQ, short answer, and explanation types
- **AI answer evaluation** — encouraging feedback with improvement hints
- **Screen annotation overlay** — highlights relevant content (satisfies UI Navigator "action" requirement)
- **Session summary** — topics covered, score %, weak areas
- **MD5 deduplication** — avoids question fatigue on same slide

## Technologies

- **AI Model:** Gemini 2.0 Flash via Vertex AI
- **AI SDK:** Google GenAI SDK (`google-genai`, `vertexai=True`)
- **Cloud:** Google Cloud Run, Cloud Build
- **Desktop:** Tauri v2 (Rust)
- **Backend:** FastAPI (Python)
- **Screen Capture:** Python mss (native OS-level)
- **Transport:** WebSockets
- **Frontend:** Vanilla HTML/CSS/JS

## Data Sources

No external datasets. Real-time visual screen content only. No persistent storage — all session data is in-memory.

## Learnings

- Gemini reliably distinguishes academic content from general screen content using vision alone
- Proactive agent UX (watching + testing automatically) feels more like a real coach than reactive tools
- Tauri's sidecar model is elegant for integrating Python tooling with a Rust/web frontend
- MD5 hash deduplication is essential to avoid generating repeat questions on the same slide
- Cloud Run's scale-to-zero is cost-efficient for demos and competition evaluation
- The 3×3 grid annotation system is surprisingly effective for visual guidance without pixel-level analysis
