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
let historyExpanded = false;
let answeredHistory = [];
let sessionMode = "proactive"; // "manual" or "proactive"
let proactiveTimeout = null;

// ===========================
// Sound Effects (Web Audio API)
// ===========================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, dur, type = 'sine') {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = 0.12;
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + dur);
}

function playCorrectSound() {
  playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.2), 200);
}

function playWrongSound() {
  playTone(330, 0.15, 'square'); setTimeout(() => playTone(277, 0.25, 'square'), 150);
}

function playNewQuestionSound() {
  playTone(440, 0.08); setTimeout(() => playTone(554, 0.08), 80); setTimeout(() => playTone(659, 0.12), 160);
}

function playStartSound() {
  playTone(392, 0.1); setTimeout(() => playTone(523, 0.1), 120); setTimeout(() => playTone(659, 0.15), 240);
}

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
    setStatus(sessionMode === 'proactive' ? '⏳ Watching... quiz in 1 min' : '👀 Ready! Click 🎯 to quiz', true);
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
        setStatus(sessionMode === 'proactive' ? '⏳ No study material... watching' : '👀 No study material found', true);
      }
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  };

  ws.onerror = () => setStatus("⚠ Error", false);

  ws.onclose = () => {
    if (timerInterval) {
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

async function startSession(mode = 'proactive') {
  sessionMode = mode;
  sessionStartTime = Date.now();
  playStartSound();

  // Switch UI: card → bar
  document.getElementById("card-view").style.display = "none";
  document.getElementById("bar-view").style.display = "flex";

  // Update mode badge
  const badge = document.getElementById("mode-badge");
  if (mode === 'manual') {
    badge.textContent = '🎯 Manual';
    document.getElementById('btn-quiz').style.display = 'inline-flex';
  } else {
    badge.textContent = '🤖 Proactive';
    document.getElementById('btn-quiz').style.display = 'none';
  }

  // Resize window to toolbar
  await switchToBar();

  // Connect WebSocket
  connectWebSocket();
  timerInterval = setInterval(updateTimer, 1000);
  unansweredCount = 0;

  if (mode === 'proactive') {
    // Proactive: wait 60s before first quiz
    setStatus('⏳ Watching... quiz in 1 min', true);
    proactiveTimeout = setTimeout(() => captureAndSend(), 60000);
  } else {
    // Manual: just watch, user clicks quiz button
    setStatus('👀 Ready! Click 🎯 to quiz', true);
  }
}

async function manualQuiz() {
  if (unansweredCount > 0) return;
  await captureAndSend();
}

async function endSession() {
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (proactiveTimeout) { clearTimeout(proactiveTimeout); proactiveTimeout = null; }
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
  if (historyExpanded) await hideHistoryPanel();
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

// History Panel
async function showHistoryPanel() {
  historyExpanded = true;
  if (panelExpanded) {
    document.getElementById("questions-panel").classList.remove("expanded");
    panelExpanded = false;
  }
  renderHistory();
  document.getElementById("history-panel").classList.add("expanded");
  await expandBar();
}

async function hideHistoryPanel() {
  historyExpanded = false;
  document.getElementById("history-panel").classList.remove("expanded");
  await collapseBar();
}

async function toggleHistory() {
  if (historyExpanded) {
    await hideHistoryPanel();
  } else {
    await showHistoryPanel();
  }
}

function renderHistory() {
  const container = document.getElementById("history-container");
  if (answeredHistory.length === 0) {
    container.innerHTML = '<div class="chat-bubble">No answered questions yet.</div>';
    return;
  }
  container.innerHTML = answeredHistory.map(item => `
    <div class="question-card" style="opacity: 0.85;">
      <div class="question-topic">${item.topic}</div>
      <div class="question-text">${item.question}</div>
      <div class="feedback ${item.isCorrect ? 'correct' : 'wrong'}">
        <div class="feedback-title">${item.isCorrect ? '✅' : '❌'} ${item.userAnswer}</div>
        <div>${item.feedback}</div>
      </div>
    </div>
  `).join('');
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
  playNewQuestionSound();
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

  if (!isCorrect) { selected.classList.add("wrong"); playWrongSound(); } else { correctAnswers++; playCorrectSound(); }
  updateScore();

  const questionText = card.querySelector(".question-text").textContent;
  const feedback = await getAIFeedback(qid, questionText, correctAnswer, userAnswer, topic, isCorrect);
  setTimeout(() => moveToHistory(qid, questionText, topic, userAnswer, isCorrect, feedback), 2000);
  questionAnswered();
}

async function submitText(qid, question, correctAnswer, topic) {
  const input = document.getElementById(`input-${qid}`);
  const userAnswer = input.value.trim();
  if (!userAnswer) return;

  input.disabled = true;
  document.getElementById(`q-${qid}`).querySelector(".btn-submit").disabled = true;

  const feedback = await getAIFeedback(qid, question, correctAnswer, userAnswer, topic);
  setTimeout(() => moveToHistory(qid, question, topic, userAnswer, null, feedback), 2000);
  questionAnswered();
}

async function getAIFeedback(qid, question, correctAnswer, userAnswer, topic, knownCorrect = null) {
  const feedbackEl = document.getElementById(`feedback-${qid}`);
  feedbackEl.innerHTML = '<div class="feedback" style="color: var(--text-muted);">Evaluating...</div>';
  let feedbackText = "";

  try {
    const response = await fetch(`${BACKEND_API_URL}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, question_id: qid, question, correct_answer: correctAnswer, user_answer: userAnswer, topic })
    });

    const result = await response.json();
    const isCorrect = knownCorrect !== null ? knownCorrect : result.is_correct;

    if (knownCorrect === null && isCorrect) { correctAnswers++; updateScore(); }

    feedbackText = result.feedback || "";
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
  return feedbackText;
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
    setStatus("👍 All done!", true);
    setTimeout(async () => {
      if (unansweredCount === 0) {
        await hideQuestionsPanel();
      }
    }, 3000);

    // Re-arm proactive timer: 60s after answering
    if (sessionMode === 'proactive') {
      if (proactiveTimeout) clearTimeout(proactiveTimeout);
      setStatus('⏳ Next quiz in 1 min...', true);
      proactiveTimeout = setTimeout(() => captureAndSend(), 60000);
    } else {
      setStatus('👀 Ready! Click 🎯 to quiz', true);
    }
  }
}

function moveToHistory(qid, question, topic, userAnswer, isCorrect, feedback) {
  answeredHistory.unshift({ qid, question, topic, userAnswer, isCorrect, feedback });
  document.getElementById('btn-history').classList.add('has-items');
  const card = document.getElementById(`q-${qid}`);
  if (card) {
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(30px)';
    setTimeout(() => card.remove(), 400);
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
