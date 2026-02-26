# DeskMate — Demo Script (4 Minutes)

## [0:00 – 0:30] THE PROBLEM

**Screen:** Student passively scrolling through lecture slides.

**Voiceover:**
> "Reading without testing yourself is one of the least effective ways to study. Research shows that retrieval practice — actively recalling information — is far more powerful. But most students don't do it. What if an AI agent could do it for you — automatically?"

---

## [0:30 – 1:00] INTRODUCING DESKMATE

**Screen:** Open DeskMate desktop app. Show the slim sidebar appearing on the right side of the screen.

**Voiceover:**
> "Meet DeskMate — a proactive AI study agent. It watches your screen in the background and automatically generates practice questions based on whatever you're studying. No copy-pasting. No manual input. Just study, and DeskMate tests you."

**Show:** Click "Start Session." Status changes to "Watching your screen..."

---

## [1:00 – 2:00] DEMO — SLIDES

**Screen:** Open a Machine Learning lecture slide on gradient descent.

**Voiceover:**
> "Let's open a lecture on gradient descent. DeskMate captures a screenshot every 10 seconds and sends it to Gemini 2.0 Flash on Vertex AI."

**Show:** Wait ~10 seconds. Sidebar activates:
- Status: "📚 Machine Learning — intermediate"
- A question card slides in from the right
- Screen annotation highlights the gradient descent formula

**Voiceover:**
> "It detected study material and generated a question about the learning rate. Notice the screen highlight pointing to the relevant formula."

**Show:** Answer the question → instant feedback with explanation.

**Voiceover:**
> "Immediate feedback with an explanation. Scroll to the next slide..."

**Show:** Scroll to next slide → wait → new question appears.

---

## [2:00 – 2:45] DEMO — PDF SWITCH

**Screen:** Close PowerPoint. Open a PDF textbook on a different topic.

**Voiceover:**
> "Now watch — I'll close PowerPoint and open a PDF textbook. DeskMate doesn't use DOM access. It uses pure vision, so it works across any application."

**Show:** Within 10 seconds, new questions appear based on the PDF content.

**Voiceover:**
> "New questions within seconds. Works with PowerPoint, PDFs, even code editors — because DeskMate sees your screen, not your browser."

---

## [2:45 – 3:15] FEEDBACK QUALITY

**Show:** Answer a question incorrectly.

**DeskMate feedback:**
> "Great attempt! The chain rule is key here. Remember that backpropagation works by computing gradients layer by layer, moving backward from the output. 💡 Hint: Think about how the error signal flows backward through each layer."

**Voiceover:**
> "Even when you get it wrong, DeskMate is encouraging and specific. It explains what you missed and gives a targeted hint — just like a real tutor."

---

## [3:15 – 3:45] SESSION SUMMARY

**Show:** Click "End Session." Summary modal appears.

**Summary shows:**
- Duration: 3m 45s
- Topics: Machine Learning, Backpropagation
- Questions: 5
- Score: 4/5 (80%)
- Weak area: Backpropagation (50%)

**Voiceover:**
> "At the end of your study session, DeskMate gives you a complete summary — topics covered, your score, and areas where you need more practice."

---

## [3:45 – 4:00] CLOSING

**Screen:** Briefly show the architecture diagram.

**Voiceover:**
> "Built with Gemini 2.0 Flash on Vertex AI, deployed on Cloud Run, with a Tauri desktop wrapper for native screen capture. DeskMate is a true UI Navigator agent — it observes, interprets, and acts on your screen to help you study smarter."

**End card:** "DeskMate — Study Smarter. 🎓"
