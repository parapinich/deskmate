/**
 * DeskMate — Frontend Application Logic
 * WebSocket client + UI logic for the Tauri desktop app.
 */

// ===========================
// Configuration
// ===========================

const BACKEND_WS_URL = "ws://localhost:8080/ws/study-session";
const BACKEND_API_URL = "http://localhost:8080/api";
const CAPTURE_INTERVAL_MS = 30000; // 30 seconds — gives time to answer

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
let unansweredCount = 0; // Track unanswered questions to pause capture

// ===========================
// Tauri API (lazy load)
// ===========================

async function tauriInvoke(cmd, args) {
  try {
    // Tauri v2 internal invoke — always available in Tauri webview
    if (window.__TAURI_INTERNALS__) {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    }
    // Fallback: Tauri v2 global API
    if (window.__TAURI__ && window.__TAURI__.core) {
      return await window.__TAURI__.core.invoke(cmd, args || {});
    }
    console.error("Tauri API not found!");
  } catch (err) {
    console.error("Tauri invoke error:", cmd, err);
  }
  return null;
}

// ===========================
// WebSocket
// ===========================

function connectWebSocket() {
  setStatus("Connecting...", false);

  ws = new WebSocket(`${BACKEND_WS_URL}?session_id=${sessionId}`);

  ws.onopen = () => {
    console.log("WebSocket connected!");
    setStatus("👋 Hey! I'm watching your screen...", true);
    showGreeting();
    // Send first capture after a short delay
    setTimeout(captureAndSend, 2000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.error) {
        console.error("Server error:", data.error);
        setStatus("⚠ Server error", false);
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
      } else if (data.is_study_material === false && !data.skipped) {
        setStatus("👀 No study material detected — watching...", true);
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    setStatus("⚠ Connection error", false);
  };

  ws.onclose = () => {
    if (captureInterval) {
      // Only reconnect if session is active
      setStatus("Reconnecting...", false);
      setTimeout(connectWebSocket, 3000);
    }
  };
}

// ===========================
// Screen Capture
// ===========================

async function captureAndSend() {
  // Pause capture if there are unanswered questions
  if (unansweredCount > 0) {
    console.log(`Pausing capture — ${unansweredCount} unanswered question(s)`);
    return;
  }

  try {
    setStatus("📸 Scanning your screen...", true);
    const result = await tauriInvoke("take_screenshot");
    if (!result) {
      console.warn("Screenshot returned empty");
      setStatus("👀 Watching your screen...", true);
      return;
    }

    const parsed = JSON.parse(result);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        screenshot: parsed.screenshot,
        session_id: sessionId
      }));
      console.log("Screenshot sent to server");
      setStatus("🧠 Analyzing what you're studying...", true);
    }
  } catch (err) {
    console.error("Capture failed:", err);
    setStatus("👀 Watching your screen...", true);
  }
}

// ===========================
// Session Controls
// ===========================

function startSession() {
  console.log("Starting session...");
  sessionStartTime = Date.now();

  // Connect WebSocket
  connectWebSocket();

  // Start capture loop (first capture is sent after WS connects)
  captureInterval = setInterval(captureAndSend, CAPTURE_INTERVAL_MS);

  // Start timer
  timerInterval = setInterval(updateTimer, 1000);

  // Update UI
  document.getElementById("btn-start").style.display = "none";
  document.getElementById("btn-end").style.display = "block";
  unansweredCount = 0;
}

async function endSession() {
  // Stop capture & timer
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

  // Close WebSocket
  if (ws) { ws.close(); ws = null; }

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
    unansweredCount++;
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
                  placeholder="Type your answer..."></textarea>
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

    // Add conversational intro before the first question
    if (container.children.length === 0 || !container.querySelector('.chat-bubble')) {
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.innerHTML = `🤓 I see you're studying <strong>${topic}</strong>! Let me quiz you...`;
      container.insertBefore(bubble, container.firstChild);
    }

    container.insertBefore(card, container.querySelector('.chat-bubble') ? container.querySelector('.chat-bubble').nextSibling : container.firstChild);
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
  questionAnswered();
}

async function submitText(qid, question, correctAnswer, topic) {
  const input = document.getElementById(`input-${qid}`);
  const userAnswer = input.value.trim();
  if (!userAnswer) return;

  input.disabled = true;
  const card = document.getElementById(`q-${qid}`);
  card.querySelector(".btn-submit").disabled = true;

  await getAIFeedback(qid, question, correctAnswer, userAnswer, topic);
  questionAnswered();
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

function questionAnswered() {
  unansweredCount = Math.max(0, unansweredCount - 1);
  if (unansweredCount === 0) {
    setStatus("\u{1F44D} All caught up! Scanning for more...", true);
  }
}

function showGreeting() {
  const container = document.getElementById("questions-container");
  const emptyState = document.getElementById("empty-state");
  if (emptyState) emptyState.remove();

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = `\u{1F44B} <strong>Hey! I'm DeskMate.</strong><br>I'll watch what you're studying and quiz you to help you learn better. Just keep reading \u2014 I'll ask when I spot something interesting!`;
  container.appendChild(bubble);
}
