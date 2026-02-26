/**
 * DeskMate — Frontend Application Logic
 * WebSocket client + UI logic for the Tauri desktop app.
 */

const { invoke } = window.__TAURI__.core;

// ===========================
// Configuration
// ===========================

const BACKEND_WS_URL = "wss://deskmate-backend-93867190499.us-central1.run.app/ws/study-session";
const BACKEND_API_URL = "https://deskmate-backend-93867190499.us-central1.run.app/api";
const CAPTURE_INTERVAL_MS = 10000; // 10 seconds

// ===========================
// State
// ===========================

const sessionId = crypto.randomUUID();
let ws = null;
let captureInterval = null;
let timerInterval = null;
let sessionStartTime = null;
let totalQuestions = 0;
let correctAnswers = 0;
let currentTopic = "";

// ===========================
// WebSocket
// ===========================

function connectWebSocket() {
  ws = new WebSocket(`${BACKEND_WS_URL}?session_id=${sessionId}`);

  ws.onopen = () => {
    setStatus("Watching your screen...", true);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.error) {
      console.error("Server error:", data.error);
      return;
    }

    if (data.skipped) {
      // Duplicate screenshot — no new questions
      return;
    }

    if (data.is_study_material && data.questions && data.questions.length > 0) {
      currentTopic = data.topic || "";
      setStatus(`📚 ${data.topic} — ${data.difficulty}`, true);
      displayQuestions(data.questions, data.topic);

      // Annotate screen with focus area of the first question
      const firstQ = data.questions[0];
      if (firstQ.focus_area) {
        invoke("show_annotation", {
          region: firstQ.focus_area.region,
          label: `📌 ${firstQ.focus_area.description}`
        }).catch(console.error);
      }
    } else if (data.is_study_material === false && !data.skipped) {
      setStatus("👀 No study material detected — watching...", true);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    setStatus("⚠ Connection error", false);
  };

  ws.onclose = () => {
    setStatus("Reconnecting...", false);
    setTimeout(connectWebSocket, 3000);
  };
}

// ===========================
// Screen Capture
// ===========================

async function captureAndSend() {
  try {
    const result = await invoke("take_screenshot");
    const parsed = JSON.parse(result);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        screenshot: parsed.screenshot,
        session_id: sessionId
      }));
    }
  } catch (err) {
    console.error("Capture failed:", err);
  }
}

// ===========================
// Session Controls
// ===========================

function startSession() {
  sessionStartTime = Date.now();

  // Connect WebSocket
  connectWebSocket();

  // Start capture loop
  captureAndSend(); // Immediate first capture
  captureInterval = setInterval(captureAndSend, CAPTURE_INTERVAL_MS);

  // Start timer
  timerInterval = setInterval(updateTimer, 1000);

  // Update UI
  document.getElementById("btn-start").style.display = "none";
  document.getElementById("btn-end").style.display = "block";
  document.getElementById("empty-state").querySelector("p").textContent = "Watching your screen...";
  setStatus("Watching your screen...", true);
}

async function endSession() {
  // Stop capture & timer
  if (captureInterval) clearInterval(captureInterval);
  if (timerInterval) clearInterval(timerInterval);

  // Close WebSocket
  if (ws) ws.close();

  setStatus("Session ended", false);

  // Fetch summary from backend
  try {
    const response = await fetch(`${BACKEND_API_URL}/summary/${sessionId}`);
    const summary = await response.json();
    displaySummary(summary);
  } catch (err) {
    console.error("Failed to fetch summary:", err);
    displaySummary({
      topics: [currentTopic || "N/A"],
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      score_percent: totalQuestions > 0 ? Math.round(correctAnswers / totalQuestions * 100) : 0,
      weak_areas: [],
      duration_seconds: Math.floor((Date.now() - sessionStartTime) / 1000)
    });
  }

  // Update UI
  document.getElementById("btn-end").style.display = "none";
  document.getElementById("btn-start").style.display = "block";
}

// ===========================
// UI — Display Questions
// ===========================

function displayQuestions(questions, topic) {
  const container = document.getElementById("questions-container");

  // Remove empty state
  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.remove();

  questions.forEach((q) => {
    totalQuestions++;
    updateScore();

    const card = document.createElement("div");
    card.className = "question-card";
    card.id = `q-${q.id}`;

    let answersHTML = "";

    if (q.type === "multiple_choice" && q.choices) {
      answersHTML = `
        <div class="choices">
          ${q.choices.map((choice, i) => `
            <button class="choice-btn" data-qid="${q.id}" data-choice="${choice}"
                    onclick="selectChoice(this, '${q.id}')">${choice}</button>
          `).join("")}
        </div>
        <button class="btn-submit" onclick="submitMCQ('${q.id}', '${escapeJS(q.correct_answer)}', '${escapeJS(topic)}')"
                id="submit-${q.id}" disabled>Submit Answer</button>
      `;
    } else {
      answersHTML = `
        <textarea class="answer-input" id="input-${q.id}"
                  placeholder="Type your answer..." oninput="onAnswerStart()"></textarea>
        <button class="btn-submit"
                onclick="submitText('${q.id}', '${escapeJS(q.question)}', '${escapeJS(q.correct_answer)}', '${escapeJS(topic)}')">
          Submit Answer
        </button>
      `;
    }

    card.innerHTML = `
      <div class="question-topic">${topic}</div>
      <div class="question-type">${q.type.replace("_", " ")}</div>
      <div class="question-text">${q.question}</div>
      ${answersHTML}
      <div id="feedback-${q.id}"></div>
    `;

    container.insertBefore(card, container.firstChild);
  });

  // Scroll to top to see newest question
  container.scrollTop = 0;
}

// ===========================
// UI — Answer Handling
// ===========================

function selectChoice(btn, qid) {
  // Deselect all in this question
  const card = document.getElementById(`q-${qid}`);
  card.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("selected"));

  // Select this one
  btn.classList.add("selected");

  // Enable submit
  document.getElementById(`submit-${qid}`).disabled = false;

  onAnswerStart();
}

async function submitMCQ(qid, correctAnswer, topic) {
  const card = document.getElementById(`q-${qid}`);
  const selected = card.querySelector(".choice-btn.selected");
  if (!selected) return;

  const userAnswer = selected.dataset.choice;

  // Disable all choices
  card.querySelectorAll(".choice-btn").forEach((b) => {
    b.disabled = true;
    b.style.cursor = "default";
  });
  card.querySelector(".btn-submit").disabled = true;

  // Check answer (simple prefix match for MCQ)
  const correctLetter = correctAnswer.charAt(0).toUpperCase();
  const userLetter = userAnswer.charAt(0).toUpperCase();
  const isCorrect = correctLetter === userLetter;

  // Highlight correct/wrong
  card.querySelectorAll(".choice-btn").forEach((b) => {
    if (b.dataset.choice.charAt(0).toUpperCase() === correctLetter) {
      b.classList.add("correct");
    }
  });

  if (!isCorrect) {
    selected.classList.add("wrong");
  } else {
    correctAnswers++;
  }

  updateScore();

  // Get AI feedback
  const questionText = card.querySelector(".question-text").textContent;
  await getAIFeedback(qid, questionText, correctAnswer, userAnswer, topic, isCorrect);
}

async function submitText(qid, question, correctAnswer, topic) {
  const input = document.getElementById(`input-${qid}`);
  const userAnswer = input.value.trim();
  if (!userAnswer) return;

  input.disabled = true;
  const card = document.getElementById(`q-${qid}`);
  card.querySelector(".btn-submit").disabled = true;

  await getAIFeedback(qid, question, correctAnswer, userAnswer, topic);
}

async function getAIFeedback(qid, question, correctAnswer, userAnswer, topic, knownCorrect = null) {
  const feedbackEl = document.getElementById(`feedback-${qid}`);
  feedbackEl.innerHTML = '<div class="feedback" style="color: var(--text-muted);">Evaluating...</div>';

  try {
    const response = await fetch(`${BACKEND_API_URL}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        question_id: qid,
        question,
        correct_answer: correctAnswer,
        user_answer: userAnswer,
        topic
      })
    });

    const result = await response.json();
    const isCorrect = knownCorrect !== null ? knownCorrect : result.is_correct;

    if (knownCorrect === null && isCorrect) {
      correctAnswers++;
      updateScore();
    }

    displayFeedback(qid, isCorrect, result.feedback, result.hint_for_improvement);
  } catch (err) {
    feedbackEl.innerHTML = `
      <div class="feedback ${knownCorrect ? 'correct' : 'wrong'}">
        <div class="feedback-title">${knownCorrect ? '✅ Correct!' : '❌ Not quite'}</div>
        <div>Correct answer: ${correctAnswer}</div>
      </div>
    `;
  }
}

function displayFeedback(qid, isCorrect, feedback, hint) {
  const feedbackEl = document.getElementById(`feedback-${qid}`);
  feedbackEl.innerHTML = `
    <div class="feedback ${isCorrect ? 'correct' : 'wrong'}">
      <div class="feedback-title">${isCorrect ? '✅ Correct!' : '❌ Not quite'}</div>
      <div>${feedback}</div>
      ${hint ? `<div class="feedback-hint">💡 ${hint}</div>` : ""}
    </div>
  `;
}

// ===========================
// UI — Summary
// ===========================

function displaySummary(summary) {
  const modal = document.getElementById("summary-modal");
  const body = document.getElementById("summary-body");

  const duration = formatDuration(summary.duration_seconds || 0);
  const topics = (summary.topics || []).join(", ") || "N/A";

  let weakAreasHTML = "";
  if (summary.weak_areas && summary.weak_areas.length > 0) {
    weakAreasHTML = `
      <div class="weak-areas">
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:8px; font-weight:600;">WEAK AREAS</p>
        ${summary.weak_areas.map(w => `
          <div class="weak-area-item">
            <span class="weak-area-topic">${w.topic}</span> — ${w.score_percent}%
          </div>
        `).join("")}
      </div>
    `;
  }

  body.innerHTML = `
    <div class="summary-item">
      <span class="summary-label">Duration</span>
      <span class="summary-value">${duration}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Topics</span>
      <span class="summary-value">${topics}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Questions</span>
      <span class="summary-value">${summary.total_questions || 0}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Correct</span>
      <span class="summary-value">${summary.correct_answers || 0}</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Score</span>
      <span class="summary-value" style="color: ${(summary.score_percent || 0) >= 70 ? 'var(--success)' : 'var(--error)'}">
        ${summary.score_percent || 0}%
      </span>
    </div>
    ${weakAreasHTML}
  `;

  modal.style.display = "flex";
}

function closeSummary() {
  document.getElementById("summary-modal").style.display = "none";
}

// ===========================
// UI — Helpers
// ===========================

function setStatus(text, active) {
  document.getElementById("status-text").textContent = text;
  const dot = document.getElementById("status-dot");
  if (active) {
    dot.classList.add("active");
  } else {
    dot.classList.remove("active");
  }
}

function updateScore() {
  document.getElementById("score-value").textContent = `${correctAnswers} / ${totalQuestions}`;
  const pct = totalQuestions > 0 ? (correctAnswers / totalQuestions * 100) : 0;
  document.getElementById("score-bar").style.width = `${pct}%`;
}

function updateTimer() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  document.getElementById("session-timer").textContent = `${mins}:${secs}`;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function escapeJS(str) {
  return (str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function onAnswerStart() {
  invoke("hide_annotation").catch(() => { });
}
