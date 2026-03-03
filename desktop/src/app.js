/**
 * DeskMate — Frontend Application Logic
 * Card popup → Floating toolbar bar → Expandable questions panel
 */

// ===========================
// Configuration
// ===========================

const BACKEND_WS_URL = "ws://localhost:8080/ws/study-session";
const BACKEND_API_URL = "http://localhost:8080/api";
const CAPTURE_INTERVAL_MS = 30000;

// Window sizes
const CARD_WIDTH = 420;
const CARD_HEIGHT = 500;
const BAR_WIDTH = 650;
const BAR_HEIGHT = 48;
const BAR_EXPANDED_HEIGHT = 550;
const BAR_Y_OFFSET = 8; // Padding from top edge

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
let unansweredCount = 0;
let panelExpanded = false;

// ===========================
// Tauri API
// ===========================

async function tauriInvoke(cmd, args) {
  try {
    if (window.__TAURI_INTERNALS__) {
      return await window.__TAURI_INTERNALS__.invoke(cmd, args || {});
    }
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
// Window Management
// ===========================

async function switchToBar() {
  // Get screen center for bar positioning
  const screenW = window.screen.availWidth;
  const x = Math.round((screenW - BAR_WIDTH) / 2);
  await tauriInvoke("resize_window", {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    x: x,
    y: BAR_Y_OFFSET
  });
}

async function expandBar() {
  const screenW = window.screen.availWidth;
  const x = Math.round((screenW - BAR_WIDTH) / 2);
  await tauriInvoke("resize_window", {
    width: BAR_WIDTH,
    height: BAR_EXPANDED_HEIGHT,
    x: x,
    y: BAR_Y_OFFSET
  });
}

async function collapseBar() {
  const screenW = window.screen.availWidth;
  const x = Math.round((screenW - BAR_WIDTH) / 2);
  await tauriInvoke("resize_window", {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    x: x,
    y: BAR_Y_OFFSET
  });
}

async function switchToCard() {
  const screenW = window.screen.availWidth;
  const screenH = window.screen.availHeight;
  await tauriInvoke("resize_window", {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    x: Math.round((screenW - CARD_WIDTH) / 2),
    y: Math.round((screenH - CARD_HEIGHT) / 2)
  });
}

// ===========================
// WebSocket
// ===========================

function connectWebSocket() {
  setStatus("Connecting...", false);

  ws = new WebSocket(`${BACKEND_WS_URL}?session_id=${sessionId}`);

  ws.onopen = () => {
    console.log("WebSocket connected!");
    setStatus("Watching your screen...", true);
    setTimeout(captureAndSend, 2000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.error) {
        console.error("Server error:", data.error);
        setStatus("⚠ Error", false);
        return;
      }

      if (data.skipped) return;

      if (data.is_study_material && data.questions && data.questions.length > 0) {
        currentTopic = data.topic || "";
        setStatus(`📚 ${data.topic}`, true);
        displayQuestions(data.questions, data.topic);

        // Auto-expand panel and resize window
        if (!panelExpanded) {
          showQuestionsPanel();
        }
      } else if (data.is_study_material === false && !data.skipped) {
        setStatus("👀 Watching...", true);
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  };

  ws.onerror = () => setStatus("⚠ Error", false);

  ws.onclose = () => {
    if (captureInterval) {
      setStatus("Reconnecting...", false);
      setTimeout(connectWebSocket, 3000);
    }
  };
}

// ===========================
// Screen Capture
// ===========================

async function captureAndSend() {
  if (unansweredCount > 0) return;

  try {
    setStatus("📸 Scanning...", true);
    const result = await tauriInvoke("take_screenshot");
    if (!result) {
      setStatus("👀 Watching...", true);
      return;
    }

    const parsed = JSON.parse(result);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        screenshot: parsed.screenshot,
        session_id: sessionId
      }));
      setStatus("🧠 Analyzing...", true);
    }
  } catch (err) {
    console.error("Capture failed:", err);
    setStatus("👀 Watching...", true);
  }
}

// ===========================
// Session Controls
// ===========================

async function startSession() {
  sessionStartTime = Date.now();

  // Switch UI: card → bar
  document.getElementById("card-view").style.display = "none";
  document.getElementById("bar-view").style.display = "flex";

  // Resize window to toolbar
  await switchToBar();

  // Connect and start
  connectWebSocket();
  captureInterval = setInterval(captureAndSend, CAPTURE_INTERVAL_MS);
  timerInterval = setInterval(updateTimer, 1000);
  unansweredCount = 0;
}

async function endSession() {
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (ws) { ws.close(); ws = null; }

  setStatus("Session ended", false);

  // Fetch summary
  try {
    const response = await fetch(`${BACKEND_API_URL}/summary/${sessionId}`);
    const summary = await response.json();
    displaySummary(summary);
  } catch (err) {
    displaySummary({
      topics: [currentTopic || "N/A"],
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      score_percent: totalQuestions > 0 ? Math.round(correctAnswers / totalQuestions * 100) : 0,
      weak_areas: [],
      duration_seconds: Math.floor((Date.now() - sessionStartTime) / 1000)
    });
  }

  // Switch back to card view
  hideQuestionsPanel();
  document.getElementById("bar-view").style.display = "none";
  document.getElementById("card-view").style.display = "flex";
  await switchToCard();
}

// ===========================
// Questions Panel Toggle
// ===========================

async function showQuestionsPanel() {
  panelExpanded = true;
  document.getElementById("questions-panel").classList.add("expanded");
  document.getElementById("btn-toggle").classList.add("expanded");
  await expandBar();
}

async function hideQuestionsPanel() {
  panelExpanded = false;
  document.getElementById("questions-panel").classList.remove("expanded");
  document.getElementById("btn-toggle").classList.remove("expanded");
  await collapseBar();
}

async function toggleQuestions() {
  if (panelExpanded) {
    await hideQuestionsPanel();
  } else {
    await showQuestionsPanel();
  }
}

// ===========================
// UI — Display Questions
// ===========================

function displayQuestions(questions, topic) {
  const container = document.getElementById("questions-container");

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
          ${q.choices.map((choice) => `
            <button class="choice-btn" data-qid="${q.id}" data-choice="${choice}"
                    onclick="selectChoice(this, '${q.id}')">${choice}</button>
          `).join("")}
        </div>
        <button class="btn-submit" onclick="submitMCQ('${q.id}', '${escapeJS(q.correct_answer)}', '${escapeJS(topic)}')"
                id="submit-${q.id}" disabled>Submit</button>
      `;
    } else {
      answersHTML = `
        <textarea class="answer-input" id="input-${q.id}" placeholder="Type your answer..."></textarea>
        <button class="btn-submit"
                onclick="submitText('${q.id}', '${escapeJS(q.question)}', '${escapeJS(q.correct_answer)}', '${escapeJS(topic)}')">
          Submit
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
}

// ===========================
// Answer Handling
// ===========================

function selectChoice(btn, qid) {
  const card = document.getElementById(`q-${qid}`);
  card.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  document.getElementById(`submit-${qid}`).disabled = false;
}

async function submitMCQ(qid, correctAnswer, topic) {
  const card = document.getElementById(`q-${qid}`);
  const selected = card.querySelector(".choice-btn.selected");
  if (!selected) return;

  const userAnswer = selected.dataset.choice;
  card.querySelectorAll(".choice-btn").forEach((b) => { b.disabled = true; b.style.cursor = "default"; });
  card.querySelector(".btn-submit").disabled = true;

  const correctLetter = correctAnswer.charAt(0).toUpperCase();
  const userLetter = userAnswer.charAt(0).toUpperCase();
  const isCorrect = correctLetter === userLetter;

  card.querySelectorAll(".choice-btn").forEach((b) => {
    if (b.dataset.choice.charAt(0).toUpperCase() === correctLetter) b.classList.add("correct");
  });

  if (!isCorrect) { selected.classList.add("wrong"); } else { correctAnswers++; }
  updateScore();

  const questionText = card.querySelector(".question-text").textContent;
  await getAIFeedback(qid, questionText, correctAnswer, userAnswer, topic, isCorrect);
  questionAnswered();
}

async function submitText(qid, question, correctAnswer, topic) {
  const input = document.getElementById(`input-${qid}`);
  const userAnswer = input.value.trim();
  if (!userAnswer) return;

  input.disabled = true;
  document.getElementById(`q-${qid}`).querySelector(".btn-submit").disabled = true;

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
      body: JSON.stringify({ session_id: sessionId, question_id: qid, question, correct_answer: correctAnswer, user_answer: userAnswer, topic })
    });

    const result = await response.json();
    const isCorrect = knownCorrect !== null ? knownCorrect : result.is_correct;

    if (knownCorrect === null && isCorrect) { correctAnswers++; updateScore(); }

    feedbackEl.innerHTML = `
      <div class="feedback ${isCorrect ? 'correct' : 'wrong'}">
        <div class="feedback-title">${isCorrect ? '✅ Correct!' : '❌ Not quite'}</div>
        <div>${result.feedback}</div>
        ${result.hint_for_improvement ? `<div class="feedback-hint">💡 ${result.hint_for_improvement}</div>` : ""}
      </div>
    `;
  } catch (err) {
    feedbackEl.innerHTML = `<div class="feedback ${knownCorrect ? 'correct' : 'wrong'}">
      <div class="feedback-title">${knownCorrect ? '✅ Correct!' : '❌ Not quite'}</div>
    </div>`;
  }
}

// ===========================
// Summary
// ===========================

function displaySummary(summary) {
  const modal = document.getElementById("summary-modal");
  const body = document.getElementById("summary-body");

  const duration = formatDuration(summary.duration_seconds || 0);
  const topics = (summary.topics || []).join(", ") || "N/A";

  body.innerHTML = `
    <div class="summary-item"><span class="summary-label">Duration</span><span class="summary-value">${duration}</span></div>
    <div class="summary-item"><span class="summary-label">Topics</span><span class="summary-value">${topics}</span></div>
    <div class="summary-item"><span class="summary-label">Questions</span><span class="summary-value">${summary.total_questions || 0}</span></div>
    <div class="summary-item"><span class="summary-label">Correct</span><span class="summary-value">${summary.correct_answers || 0}</span></div>
    <div class="summary-item"><span class="summary-label">Score</span><span class="summary-value" style="color: ${(summary.score_percent || 0) >= 70 ? 'var(--success)' : 'var(--error)'}">${summary.score_percent || 0}%</span></div>
  `;

  modal.style.display = "flex";
}

function closeSummary() {
  document.getElementById("summary-modal").style.display = "none";
}

// ===========================
// Helpers
// ===========================

function setStatus(text, active) {
  const statusText = document.getElementById("status-text");
  const dot = document.getElementById("status-dot");
  if (statusText) statusText.textContent = text;
  if (dot) {
    if (active) { dot.classList.add("active"); } else { dot.classList.remove("active"); }
  }
}

function updateScore() {
  const el = document.getElementById("toolbar-score");
  if (el) el.textContent = `${correctAnswers}/${totalQuestions}`;
}

function updateTimer() {
  if (!sessionStartTime) return;
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");
  const el = document.getElementById("session-timer");
  if (el) el.textContent = `${mins}:${secs}`;
}

function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function escapeJS(str) {
  return (str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function questionAnswered() {
  unansweredCount = Math.max(0, unansweredCount - 1);
  if (unansweredCount === 0) {
    setStatus("👍 All done! Scanning...", true);
    setTimeout(async () => {
      if (unansweredCount === 0 && captureInterval) {
        await hideQuestionsPanel();
      }
    }, 3000);
  }
}

async function closeApp() {
  try {
    if (window.__TAURI_INTERNALS__) {
      // Exit the entire process
      await window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 });
      return;
    }
  } catch (e) {
    console.error('Close failed:', e);
  }
  // Fallback
  window.close();
}

async function startDrag(event) {
  event.preventDefault();
  try {
    if (window.__TAURI_INTERNALS__) {
      await window.__TAURI_INTERNALS__.invoke('plugin:window|start_dragging', { label: 'main' });
    }
  } catch (e) {
    console.error('Drag failed:', e);
  }
}
