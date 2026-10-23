
/* TEST MASTER — AKRAMJONOVA JADRA MARATOVNA */
"use strict";

const STORAGE_KEYS = {
  tests: "testMaster_tests_v2",
  results: "testMaster_results_v2",
  draft: "testMaster_draft_v2"
};

const LETTERS = ["A", "B", "C", "D"];
const DIFFICULTIES = {
  easy: "Oson",
  medium: "O‘rta",
  hard: "Qiyin"
};

let tests = readStorage(STORAGE_KEYS.tests, []);
let results = readStorage(STORAGE_KEYS.results, []);
let editingId = null;
let activeQuiz = null;
let quizTimerInterval = null;
let toastTimeout = null;
let draftQuestions = [];
let currentPage = "dashboard";

function uid() {
  return "tm_" + Date.now().toString(36) + "_" +
    Math.random().toString(36).slice(2, 8);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function readStorage(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.warn("Saqlangan ma’lumotni o‘qib bo‘lmadi:", key, error);
    return fallback;
  }
}

function safeTests() {
  return tests
    .filter(t => t && typeof t === "object" &&
      typeof t.id === "string" &&
      typeof t.title === "string" &&
      Array.isArray(t.questions))
    .map(t => ({
      ...t,
      questions: t.questions
        .filter(q => q && typeof q === "object" &&
          typeof q.text === "string" &&
          Array.isArray(q.options) &&
          q.options.length === 4)
        .map(q => ({
          id: String(q.id || uid()),
          text: q.text,
          options: q.options.map(o => String(o ?? "")),
          correct: Number.isInteger(q.correct) &&
            q.correct >= 0 && q.correct < 4 ? q.correct : -1,
          difficulty: ["easy", "medium", "hard"].includes(q.difficulty)
            ? q.difficulty : "medium",
          points: Number.isFinite(Number(q.points)) &&
            Number(q.points) > 0 ? Number(q.points) : 1
        }))
    }))
    .filter(t => t.questions.length > 0);
}

function safeResults() {
  return results
    .filter(r => r && typeof r === "object" &&
      typeof r.testTitle === "string" &&
      Number.isFinite(Number(r.percent)))
    .map(r => ({
      ...r,
      percent: Math.max(0, Math.min(100, Number(r.percent))),
      score: Math.max(0, Number(r.score) || 0),
      maxScore: Math.max(0, Number(r.maxScore) || 0),
      durationSec: Math.max(0, Number(r.durationSec) || 0),
      date: typeof r.date === "string"
        ? r.date : new Date().toISOString()
    }));
}

function persist(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(error);
    showToast(
      "Brauzer xotirasiga saqlab bo‘lmadi. Xotira to‘lgan bo‘lishi mumkin.",
      true
    );
    return false;
  }
}

tests = safeTests();
results = safeResults();

persist(STORAGE_KEYS.tests, tests);
persist(STORAGE_KEYS.results, results);

function showToast(message, error = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(
    () => toast.classList.remove("show"),
    3200
  );
}

function navigate(page) {
  if (activeQuiz && page !== "quiz") {
    if (!confirm(
      "Test jarayoni hali yakunlanmagan. Chiqsangiz joriy urinish bekor qilinadi. Davom etasizmi?"
    )) return;

    stopTimer();
    activeQuiz = null;
  }

  switchPage(page);
}

function switchPage(page) {
  currentPage = page;

  document.querySelectorAll(".page").forEach(el => {
    el.classList.toggle("active", el.id === `page-${page}`);
  });

  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle(
      "active",
      el.dataset.page === page ||
      (page === "result" && el.dataset.page === "results")
    );
  });

  const names = {
    dashboard: "Bosh sahifa",
    create: editingId ? "Testni tahrirlash" : "Test yaratish",
    tests: "Testlarim",
    quiz: "Test ishlash",
    result: "Test natijasi",
    results: "Natijalar"
  };

  document.getElementById("pageCrumb").textContent =
    names[page] || "Test Master";

  if (page === "dashboard") renderDashboard();
  if (page === "tests") renderTests();
  if (page === "results") renderResults();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startNewTest() {
  resetEditor();
  switchPage("create");
}

function resetEditor() {
  editingId = null;

  document.getElementById("testForm").reset();
  document.getElementById("testTitle").value = "";
  document.getElementById("testDescription").value = "";
  document.getElementById("testDuration").value = "15";
  document.getElementById("gradingMode").value = "both";
  document.getElementById("questionOrder").value = "fixed";
  document.getElementById("answerReview").value = "after";

  draftQuestions = [newQuestion()];

  document.getElementById("editorHeading").textContent =
    "Yangi test yaratish";

  document.getElementById("saveTestBtn").innerHTML =
    'Testni saqlash <span>→</span>';

  renderQuestionEditor();
}

function newQuestion(data = {}) {
  return {
    id: data.id || uid(),
    text: data.text || "",
    options: Array.isArray(data.options)
      ? [...data.options].slice(0, 4).concat(["", "", "", ""]).slice(0, 4)
      : ["", "", "", ""],
    correct: Number.isInteger(data.correct) &&
      data.correct >= 0 && data.correct < 4 ? data.correct : -1,
    difficulty: ["easy", "medium", "hard"].includes(data.difficulty)
      ? data.difficulty : "medium",
    points: Number(data.points) > 0 ? Number(data.points) : 1
  };
}

function addQuestion(data) {
  draftQuestions.push(newQuestion(data || {}));
  renderQuestionEditor();

  document.getElementById("questionEditor")
    .lastElementChild
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function removeQuestion(index) {
  if (draftQuestions.length <= 1) {
    showToast("Testda kamida bitta savol bo‘lishi kerak.", true);
    return;
  }

  draftQuestions.splice(index, 1);
  renderQuestionEditor();
}

function renderQuestionEditor() {
  const container = document.getElementById("questionEditor");

  document.getElementById("questionCountBadge").textContent =
    draftQuestions.length;

  container.innerHTML = draftQuestions.map((q, qi) => `
    <article class="question-card" data-question-index="${qi}">
      <div class="question-card-top">
        <div class="question-card-label">
          <span class="question-index">${String(qi + 1).padStart(2, "0")}</span>
          <div>
            <strong>${qi + 1}-savol</strong>
            <small>Savol matni, darajasi va balli</small>
          </div>
        </div>
        <button type="button" class="remove-question"
          onclick="removeQuestion(${qi})">× O‘chirish</button>
      </div>

      <textarea class="question-text-field"
        data-q="${qi}" data-field="text"
        placeholder="Savol matnini kiriting..."
        aria-label="${qi + 1}-savol matni">${escapeHTML(q.text)}</textarea>

      <div class="question-settings">
        <label class="mini-field">
          <span>Qiyinlik darajasi</span>
          <select data-q="${qi}" data-field="difficulty"
            aria-label="Qiyinlik darajasi">
            <option value="easy" ${q.difficulty === "easy" ? "selected" : ""}>Oson</option>
            <option value="medium" ${q.difficulty === "medium" ? "selected" : ""}>O‘rta</option>
            <option value="hard" ${q.difficulty === "hard" ? "selected" : ""}>Qiyin</option>
          </select>
        </label>

        <label class="mini-field">
          <span>Savol balli</span>
          <input type="number" min="0.5" max="1000" step="0.5"
            data-q="${qi}" data-field="points" value="${q.points}"
            aria-label="Savol balli">
          <span>ball</span>
        </label>
      </div>

      <div class="option-heading">
        JAVOB VARIANTLARI — TO‘G‘RI JAVOBNI BELGILANG
      </div>

      <div class="options-editor">
        ${q.options.map((option, oi) => `
          <label class="option-editor">
            <input type="radio" name="correct-${qi}" value="${oi}"
              ${q.correct === oi ? "checked" : ""}
              aria-label="${LETTERS[oi]} variant to‘g‘ri javob">

            <span class="option-letter">${LETTERS[oi]}</span>

            <input type="text" data-q="${qi}" data-option="${oi}"
              value="${escapeHTML(option)}"
              placeholder="${LETTERS[oi]} variant matni"
              aria-label="${LETTERS[oi]} variant matni">
          </label>
        `).join("")}
      </div>

      <div class="correct-note">
        ${q.correct < 0
          ? "⚠ To‘g‘ri javob hali belgilanmagan."
          : `✓ To‘g‘ri javob: ${LETTERS[q.correct]} varianti`}
      </div>
    </article>
  `).join("");

  container.querySelectorAll("[data-field]").forEach(el => {
    const update = () => {
      const i = Number(el.dataset.q);
      const field = el.dataset.field;

      if (!draftQuestions[i]) return;

      if (field === "points") {
        draftQuestions[i].points = Math.max(
          0.5,
          Math.min(1000, Number(el.value) || 1)
        );
      } else {
        draftQuestions[i][field] = el.value;
      }

      if (field === "points") {
        el.value = draftQuestions[i].points;
      }
    };

    el.addEventListener("input", update);
    el.addEventListener("change", update);
  });

  container.querySelectorAll("[data-option]").forEach(el => {
    el.addEventListener("input", () => {
      const q = Number(el.dataset.q);
      const o = Number(el.dataset.option);

      if (draftQuestions[q]) {
        draftQuestions[q].options[o] = el.value;
      }
    });
  });

  container.querySelectorAll(
    'input[type="radio"][name^="correct-"]'
  ).forEach(el => {
    el.addEventListener("change", () => {
      const i = Number(el.name.split("-")[1]);

      if (draftQuestions[i]) {
        draftQuestions[i].correct = Number(el.value);

        const note = el.closest(".question-card")
          .querySelector(".correct-note");

        note.textContent =
          `✓ To‘g‘ri javob: ${LETTERS[Number(el.value)]} varianti`;
      }
    });
  });
}

document.getElementById("testForm").addEventListener("submit", event => {
  event.preventDefault();

  const title = document.getElementById("testTitle").value.trim();
  const description =
    document.getElementById("testDescription").value.trim();
  const duration = Number(
    document.getElementById("testDuration").value
  );

  if (!title) {
    showToast("Test nomini kiriting.", true);
    document.getElementById("testTitle").focus();
    return;
  }

  if (!Number.isFinite(duration) || duration < 0 || duration > 600) {
    showToast("Vaqt 0 dan 600 daqiqagacha bo‘lishi kerak.", true);
    return;
  }

  if (!draftQuestions.length) {
    showToast("Kamida bitta savol qo‘shing.", true);
    return;
  }

  for (let i = 0; i < draftQuestions.length; i++) {
    const q = draftQuestions[i];

    if (!q.text.trim()) {
      showToast(`${i + 1}-savol matnini kiriting.`, true);
      document.querySelector(
        `[data-question-index="${i}"] .question-text-field`
      )?.focus();
      return;
    }

    if (q.options.some(o => !String(o).trim())) {
      showToast(
        `${i + 1}-savolning barcha 4 ta variantini to‘ldiring.`,
        true
      );
      return;
    }

    if (q.correct < 0 || q.correct > 3) {
      showToast(
        `${i + 1}-savol uchun to‘g‘ri javobni belgilang.`,
        true
      );
      return;
    }

    if (!(Number(q.points) > 0)) {
      showToast(`${i + 1}-savol uchun musbat ball belgilang.`, true);
      return;
    }
  }

  const prior = tests.find(t => t.id === editingId);

  const test = {
    id: editingId || uid(),
    title,
    description,
    duration,
    gradingMode: document.getElementById("gradingMode").value,
    questionOrder: document.getElementById("questionOrder").value,
    answerReview: document.getElementById("answerReview").value,
    questions: draftQuestions.map(q => ({
      ...q,
      options: [...q.options]
    })),
    createdAt: prior?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const oldTests = [...tests];

  if (editingId) {
    tests = tests.map(t => t.id === editingId ? test : t);
  } else {
    tests.unshift(test);
  }

  if (!persist(STORAGE_KEYS.tests, tests)) {
    tests = oldTests;
    return;
  }

  showToast(
    editingId
      ? "Test muvaffaqiyatli yangilandi."
      : "Yangi test saqlandi."
  );

  editingId = null;
  switchPage("tests");
});

function editTest(id) {
  const test = tests.find(t => t.id === id);
  if (!test) return;

  editingId = id;

  document.getElementById("testTitle").value = test.title;
  document.getElementById("testDescription").value =
    test.description || "";
  document.getElementById("testDuration").value =
    Number(test.duration) || 0;
  document.getElementById("gradingMode").value =
    test.gradingMode || "both";
  document.getElementById("questionOrder").value =
    test.questionOrder || "fixed";
  document.getElementById("answerReview").value =
    test.answerReview || "after";

  draftQuestions = test.questions.map(newQuestion);

  document.getElementById("editorHeading").textContent =
    "Testni tahrirlash";
  document.getElementById("saveTestBtn").innerHTML =
    'O‘zgarishlarni saqlash <span>→</span>';

  renderQuestionEditor();
  switchPage("create");
}

function deleteTest(id) {
  const test = tests.find(t => t.id === id);
  if (!test) return;

  if (!confirm(
    `“${test.title}” testini o‘chirmoqchimisiz? Eski natijalar tarixda saqlanadi.`
  )) return;

  const old = tests;
  tests = tests.filter(t => t.id !== id);

  if (!persist(STORAGE_KEYS.tests, tests)) {
    tests = old;
    return;
  }

  renderTests();
  renderDashboard();
  showToast("Test o‘chirildi. Avvalgi natijalar tarixda saqlandi.");
}

function renderDashboard() {
  document.getElementById("navTestCount").textContent = tests.length;
  document.getElementById("statTests").textContent = tests.length;
  document.getElementById("statAttempts").textContent = results.length;

  const avg = results.length
    ? Math.round(results.reduce((s, r) => s + r.percent, 0) / results.length)
    : 0;

  document.getElementById("statAverage").innerHTML =
    `${avg}<span class="stat-unit">%</span>`;
  document.getElementById("averageLine").style.width = `${avg}%`;

  document.getElementById("statPoints").textContent =
    formatNumber(results.reduce((s, r) => s + r.score, 0));

  const host = document.getElementById("recentTests");

  if (!tests.length) {
    host.innerHTML = emptyState(
      "✦",
      "Hali test yaratilmagan",
      "Birinchi testingizni yarating va savollarni sozlashni boshlang.",
      '<button class="btn btn-gold" onclick="startNewTest()">＋ Test yaratish</button>'
    );
  } else {
    host.innerHTML = tests.slice(0, 4).map(t => `
      <div class="recent-item">
        <span class="test-symbol">☷</span>
        <div class="recent-info">
          <strong>${escapeHTML(t.title)}</strong>
          <small>
            ${t.questions.length} ta savol ·
            ${Number(t.duration) || 0
              ? `${Number(t.duration)} daqiqa`
              : "Vaqtsiz"}
          </small>
        </div>
        <button class="recent-action" onclick="beginQuiz('${t.id}')">
          Boshlash ↗
        </button>
      </div>
    `).join("");
  }
}

function emptyState(icon, title, description, action = "") {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(description)}</p>
      ${action}
    </div>
  `;
}

function renderTests() {
  document.getElementById("navTestCount").textContent = tests.length;

  const query = (
    document.getElementById("testSearch")?.value || ""
  ).trim().toLowerCase();

  const filtered = tests.filter(t =>
    t.title.toLowerCase().includes(query) ||
    (t.description || "").toLowerCase().includes(query)
  );

  document.getElementById("testListCount").textContent =
    `${filtered.length} ta test`;

  const host = document.getElementById("testsGrid");

  if (!filtered.length) {
    host.innerHTML = emptyState(
      "☷",
      query ? "Mos test topilmadi" : "Hali test yaratilmagan",
      query
        ? "Boshqa so‘z bilan qidirib ko‘ring."
        : "Birinchi testingizni yarating. Savollarning darajasi, balli va vaqtini o‘zingiz belgilang.",
      query
        ? ""
        : '<button class="btn btn-gold" onclick="startNewTest()">＋ Test yaratish</button>'
    );
    return;
  }

  host.innerHTML = filtered.map(t => {
    const max = maxPoints(t);
    const avg = results.filter(r => r.testId === t.id);

    return `
      <article class="test-card">
        <div class="test-card-head">
          <span class="test-symbol">☷</span>
          <span class="tag">${t.questions.length} ta savol</span>
        </div>

        <h3>${escapeHTML(t.title)}</h3>
        <p>${escapeHTML(
          t.description || "Ushbu test uchun tavsif kiritilmagan."
        )}</p>

        <div class="test-tags">
          <span class="tag">
            ◷ ${Number(t.duration) || 0
              ? `${Number(t.duration)} daqiqa`
              : "Vaqt cheklanmagan"}
          </span>
          <span class="tag">✦ ${formatNumber(max)} ball</span>
          <span class="tag">
            ${t.questionOrder === "random"
              ? "Tasodifiy tartib"
              : "Oddiy tartib"}
          </span>
        </div>

        <div class="test-card-stats">
          <span>Urinishlar <strong>${avg.length}</strong></span>
          <span>
            Qiyin savollar
            <strong>${t.questions.filter(q => q.difficulty === "hard").length}</strong>
          </span>
        </div>

        <div class="test-card-actions">
          <button class="btn btn-gold" onclick="beginQuiz('${t.id}')">
            Boshlash →
          </button>
          <button class="btn btn-outline" onclick="editTest('${t.id}')">
            Tahrirlash
          </button>
          <button class="icon-button" title="Testni o‘chirish"
            aria-label="Testni o‘chirish"
            onclick="deleteTest('${t.id}')">×</button>
        </div>
      </article>
    `;
  }).join("");
}

function maxPoints(test) {
  return test.questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString("uz-UZ", {
    maximumFractionDigits: 2
  });
}

function beginQuiz(id) {
  const test = tests.find(t => t.id === id);

  if (!test) {
    return showToast("Test topilmadi.", true);
  }

  if (!test.questions.length || test.questions.some(q => q.correct < 0)) {
    return showToast(
      "Bu testda savollar yoki to‘g‘ri javoblar yetishmaydi. Testni tahrirlang.",
      true
    );
  }

  const questions = test.questions.map(q => ({
    ...q,
    options: [...q.options]
  }));

  if (test.questionOrder === "random") shuffle(questions);

  activeQuiz = {
    testId: test.id,
    testTitle: test.title,
    description: test.description,
    gradingMode: test.gradingMode || "both",
    answerReview: test.answerReview || "after",
    questions,
    answers: Array(questions.length).fill(null),
    current: 0,
    startedAt: Date.now(),
    remaining: Math.max(0, Number(test.duration) || 0) * 60,
    locked: false,
    submitted: false
  };

  document.getElementById("quizTestTitle").textContent = test.title;

  document.getElementById("timerBox").classList.toggle(
    "hidden",
    !(Number(test.duration) > 0)
  );

  switchPage("quiz");
  renderQuizQuestion();
  startTimer();
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function startTimer() {
  stopTimer();

  if (!activeQuiz || activeQuiz.remaining <= 0) return;

  updateTimerDisplay();

  quizTimerInterval = setInterval(() => {
    if (!activeQuiz) return stopTimer();

    activeQuiz.remaining--;
    updateTimerDisplay();

    if (activeQuiz.remaining <= 0) {
      stopTimer();
      showToast("Vaqt tugadi. Test avtomatik yakunlandi.");
      finishQuiz(true);
    }
  }, 1000);
}

function stopTimer() {
  if (quizTimerInterval) clearInterval(quizTimerInterval);
  quizTimerInterval = null;
}

function updateTimerDisplay() {
  if (!activeQuiz) return;

  const seconds = Math.max(0, activeQuiz.remaining);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  document.getElementById("quizTimer").textContent = `${mm}:${ss}`;
  document.getElementById("timerBox").classList.toggle(
    "urgent",
    seconds <= 60
  );
}

function renderQuizQuestion() {
  if (!activeQuiz) return;

  const q = activeQuiz.questions[activeQuiz.current];
  const selected = activeQuiz.answers[activeQuiz.current];
  const total = activeQuiz.questions.length;
  const current = activeQuiz.current;

  document.getElementById("quizProgressText").textContent =
    `Savol ${current + 1} / ${total}`;

  document.getElementById("quizAnsweredText").textContent =
    `${activeQuiz.answers.filter(a => a !== null).length} ta javob belgilandi`;

  document.getElementById("quizProgressBar").style.width =
    `${((current + 1) / total) * 100}%`;

  document.getElementById("quizQuestionNumber").textContent =
    `SAVOL ${String(current + 1).padStart(2, "0")}`;

  const badge = document.getElementById("quizDifficulty");
  badge.textContent =
    (DIFFICULTIES[q.difficulty] || "O‘rta").toLocaleUpperCase("uz-UZ");
  badge.className = `difficulty-badge ${q.difficulty}`;

  document.getElementById("quizPoints").textContent =
    `${formatNumber(q.points)} ball`;

  document.getElementById("quizQuestionText").textContent = q.text;

  const feedback = document.getElementById("quizFeedback");
  feedback.hidden = true;
  feedback.className = "quiz-feedback";

  document.getElementById("quizOptions").innerHTML = q.options.map((opt, i) => `
    <button class="quiz-option ${selected === i ? "selected" : ""}"
      ${selected !== null ? "disabled" : ""}
      onclick="chooseAnswer(${i})">
      <span class="option-letter">${LETTERS[i]}</span>
      <span class="option-text">${escapeHTML(opt)}</span>
      ${selected === i ? '<span class="option-status">✓</span>' : ""}
    </button>
  `).join("");

  if (selected !== null) {
    const correct = selected === q.correct;

    feedback.hidden = false;
    feedback.classList.add(correct ? "good" : "bad");

    feedback.textContent = correct
      ? `To‘g‘ri javob! Siz ${formatNumber(q.points)} ball oldingiz.`
      : `Javob noto‘g‘ri. To‘g‘ri javob: ${LETTERS[q.correct]} — ${q.options[q.correct]}.`;

    document.querySelectorAll(".quiz-option").forEach((btn, i) => {
      if (i === q.correct) btn.classList.add("correct");
      if (i === selected && !correct) btn.classList.add("wrong");
    });
  }

  document.getElementById("prevQuestionBtn").disabled = current === 0;
  document.getElementById("prevQuestionBtn").style.opacity =
    current === 0 ? ".4" : "1";

  const next = document.getElementById("nextQuestionBtn");
  next.textContent = current === total - 1 ? "Yakunlash ✓" : "Keyingi →";
  next.onclick = current === total - 1
    ? () => finishQuiz(false)
    : () => moveQuestion(1);

  document.getElementById("quizNavCounter").textContent =
    `${current + 1} / ${total}`;

  document.getElementById("questionMap").innerHTML =
    activeQuiz.questions.map((_, i) => `
      <button class="map-number ${i === current ? "current" : ""}
        ${activeQuiz.answers[i] !== null ? "answered" : ""}"
        onclick="jumpQuestion(${i})"
        aria-label="${i + 1}-savol">${i + 1}</button>
    `).join("");

  const unanswered =
    activeQuiz.answers.filter(a => a === null).length;

  document.getElementById("unansweredCount").textContent =
    `${unanswered} ta savol javobsiz`;
}

function chooseAnswer(index) {
  if (!activeQuiz ||
      activeQuiz.answers[activeQuiz.current] !== null) return;

  activeQuiz.answers[activeQuiz.current] = index;
  renderQuizQuestion();
}

function moveQuestion(delta) {
  if (!activeQuiz) return;

  const next = activeQuiz.current + delta;
  if (next < 0 || next >= activeQuiz.questions.length) return;

  activeQuiz.current = next;
  renderQuizQuestion();
}

function jumpQuestion(index) {
  if (!activeQuiz ||
      index < 0 ||
      index >= activeQuiz.questions.length) return;

  activeQuiz.current = index;
  renderQuizQuestion();
}

function leaveQuiz() {
  navigate("tests");
}

function finishQuiz(auto = false) {
  if (!activeQuiz) return;

  const unanswered =
    activeQuiz.answers.filter(a => a === null).length;

  if (!auto && unanswered &&
      !confirm(
        `${unanswered} ta savol javobsiz. Javob berilmagan savollar 0 ball bo‘ladi. Testni yakunlaysizmi?`
      )) return;

  if (!auto && !unanswered &&
      !confirm("Testni yakunlab, natijani hisoblaymizmi?")) return;

  stopTimer();

  const quiz = activeQuiz;

  const maxScore = quiz.questions.reduce(
    (sum, q) => sum + Number(q.points || 1), 0
  );

  const score = quiz.questions.reduce(
    (sum, q, i) => sum +
      (quiz.answers[i] === q.correct ? Number(q.points || 1) : 0),
    0
  );

  const percent = maxScore
    ? Math.round(score / maxScore * 1000) / 10
    : 0;

  const result = {
    id: uid(),
    testId: quiz.testId,
    testTitle: quiz.testTitle,
    date: new Date().toISOString(),
    score,
    maxScore,
    percent,
    correctCount: quiz.questions.filter(
      (q, i) => quiz.answers[i] === q.correct
    ).length,
    questionCount: quiz.questions.length,
    durationSec: Math.max(
      0, Math.floor((Date.now() - quiz.startedAt) / 1000)
    ),
    answers: [...quiz.answers],
    questions: quiz.questions.map(q => ({
      ...q,
      options: [...q.options]
    })),
    gradingMode: quiz.gradingMode,
    answerReview: quiz.answerReview,
    autoFinished: auto
  };

  const old = [...results];
  results.unshift(result);

  if (!persist(STORAGE_KEYS.results, results)) {
    results = old;
  }

  activeQuiz = null;
  renderResult(result);
  switchPage("result");
}

function renderResult(r) {
  const showPercent = r.gradingMode !== "points";
  const showPoints = r.gradingMode !== "percent";

  const status = r.percent >= 85
    ? "A’lo natija!"
    : r.percent >= 60
      ? "Yaxshi natija!"
      : "Yana mashq qiling!";

  let review = "";

  if (r.answerReview === "after") {
    review = `
      <div class="panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">TAHLIL</span>
            <h3>Javoblar tahlili</h3>
          </div>
        </div>

        <div class="review-list">
          ${r.questions.map((q, i) => {
            const a = r.answers[i];
            const good = a === q.correct;

            return `
              <article class="review-item">
                <div class="review-item-top">
                  <span class="question-index">
                    ${String(i + 1).padStart(2, "0")}
                  </span>
                  <strong>
                    ${escapeHTML(DIFFICULTIES[q.difficulty] || "O‘rta")}
                    · ${formatNumber(q.points)} ball
                  </strong>
                  <span class="${good ? "grade-chip" : "grade-chip low"}">
                    ${a === null ? "Javobsiz" : good ? "To‘g‘ri" : "Noto‘g‘ri"}
                  </span>
                </div>

                <h4>${escapeHTML(q.text)}</h4>

                <div class="review-answer ${
                  good ? "good" : a === null ? "neutral" : "bad"
                }">
                  Sizning javobingiz:
                  ${a === null
                    ? "Javob berilmadi"
                    : `${LETTERS[a]}. ${escapeHTML(q.options[a])}`}
                </div>

                ${!good ? `
                  <div class="review-answer good">
                    To‘g‘ri javob:
                    ${LETTERS[q.correct]}. ${escapeHTML(q.options[q.correct])}
                  </div>
                ` : ""}
              </article>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  document.getElementById("resultContent").innerHTML = `
    <div class="result-hero">
      <div class="result-check">${r.percent >= 60 ? "✓" : "↗"}</div>
      <span class="eyebrow">TEST YAKUNLANDI</span>
      <h1>${escapeHTML(status)}</h1>
      <p>
        ${escapeHTML(r.testTitle)} ·
        ${new Date(r.date).toLocaleString("uz-UZ")}
      </p>

      <div class="score-display">
        <strong>
          ${r.gradingMode === "points"
            ? formatNumber(r.score)
            : formatNumber(r.percent)}
        </strong>
        <span>${r.gradingMode === "points" ? "ball" : "%"}</span>
      </div>

      <div class="result-subscore">
        ${showPoints
          ? `${formatNumber(r.score)} / ${formatNumber(r.maxScore)} ball`
          : ""}
        ${showPoints && showPercent ? " · " : ""}
        ${showPercent ? `${formatNumber(r.percent)}%` : ""}
      </div>

      <div class="result-metrics">
        <div class="result-metric">
          <strong>${r.correctCount}/${r.questionCount}</strong>
          <small>To‘g‘ri javoblar</small>
        </div>
        <div class="result-metric">
          <strong>${formatNumber(r.maxScore)}</strong>
          <small>Maksimal ball</small>
        </div>
        <div class="result-metric">
          <strong>${formatDuration(r.durationSec)}</strong>
          <small>Sarflangan vaqt</small>
        </div>
        <div class="result-metric">
          <strong>${r.percent >= 85 ? "A’lo" : r.percent >= 60 ? "Yaxshi" : "Mashq"}</strong>
          <small>Natija bahosi</small>
        </div>
      </div>
    </div>

    <div class="result-actions">
      <button class="btn btn-gold" onclick="beginQuiz('${r.testId}')">
        Qayta ishlash ↻
      </button>
      <button class="btn btn-outline" onclick="switchPage('results')">
        Natijalar tarixiga o‘tish →
      </button>
      <button class="btn btn-outline" onclick="switchPage('dashboard')">
        Bosh sahifa
      </button>
    </div>

    ${review}
  `;
}

function formatDuration(sec) {
  sec = Math.max(0, Number(sec) || 0);

  return sec >= 3600
    ? `${Math.floor(sec / 3600)} soat ${Math.floor(sec % 3600 / 60)} daq.`
    : `${Math.floor(sec / 60)} daq. ${sec % 60} son.`;
}

function renderResults() {
  const count = results.length;

  const avg = count
    ? results.reduce((s, r) => s + r.percent, 0) / count
    : 0;

  const high = count
    ? Math.max(...results.map(r => r.percent))
    : 0;

  document.getElementById("resultsSummary").innerHTML = `
    <div class="summary-tile">
      <small>Jami urinishlar</small>
      <strong>${count}</strong>
    </div>
    <div class="summary-tile">
      <small>O‘rtacha foiz</small>
      <strong>${avg.toFixed(1)}<em>%</em></strong>
    </div>
    <div class="summary-tile">
      <small>Eng yuqori natija</small>
      <strong>${high.toFixed(1)}<em>%</em></strong>
    </div>
  `;

  const body = document.getElementById("resultsTable");

  if (!count) {
    body.innerHTML = `
      <tr>
        <td colspan="5">
          ${emptyState(
            "◷",
            "Hali natijalar yo‘q",
            "Testni ishlaganingizdan so‘ng natijalar shu yerda ko‘rinadi."
          )}
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = results.map(r => `
    <tr>
      <td>
        <strong>${escapeHTML(r.testTitle)}</strong>
        <small>${r.questionCount || r.questions?.length || 0} ta savol</small>
      </td>
      <td>
        ${new Date(r.date).toLocaleDateString("uz-UZ")}
        <small>
          ${new Date(r.date).toLocaleTimeString("uz-UZ", {
            hour: "2-digit",
            minute: "2-digit"
          })}
        </small>
      </td>
      <td>
        <span class="score-chip">
          ${formatNumber(r.score)} / ${formatNumber(r.maxScore)} ball
        </span>
        <small>${formatNumber(r.percent)}% natija</small>
      </td>
      <td>${formatDuration(r.durationSec)}</td>
      <td>
        <span class="grade-chip ${
          r.percent < 60 ? "low" : r.percent < 85 ? "mid" : ""
        }">
          ${r.percent >= 85 ? "A’lo" : r.percent >= 60 ? "Yaxshi" : "Mashq kerak"}
        </span>
      </td>
    </tr>
  `).join("");
}

function clearResults() {
  if (!results.length) {
    return showToast("Tozalanadigan natijalar yo‘q.");
  }

  if (!confirm(
    "Barcha test natijalari tarixini tozalaysizmi? Bu amalni ortga qaytarib bo‘lmaydi."
  )) return;

  const old = results;
  results = [];

  if (!persist(STORAGE_KEYS.results, results)) {
    results = old;
    return;
  }

  renderResults();
  renderDashboard();
  showToast("Natijalar tarixi tozalandi.");
}

function exportResults() {
  if (!results.length) {
    return showToast("Yuklab olish uchun natijalar mavjud emas.", true);
  }

  const rows = [
    [
      "Test nomi",
      "Sana",
      "Ball",
      "Maksimal ball",
      "Foiz",
      "To‘g‘ri javob",
      "Savollar soni",
      "Sarflangan vaqt (soniya)"
    ],
    ...results.map(r => [
      r.testTitle,
      new Date(r.date).toLocaleString("uz-UZ"),
      r.score,
      r.maxScore,
      r.percent,
      r.correctCount,
      r.questionCount,
      r.durationSec
    ])
  ];

  const csv = "\uFEFF" + rows.map(row =>
    row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")
  ).join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "test-master-natijalar.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showToast("Natijalar CSV fayl sifatida yuklab olindi.");
}

document.addEventListener("keydown", event => {
  if (
    currentPage === "quiz" &&
    activeQuiz &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement.tagName
    )
  ) {
    if (["1", "2", "3", "4"].includes(event.key)) {
      chooseAnswer(Number(event.key) - 1);
    } else if (event.key === "ArrowRight") {
      moveQuestion(1);
    } else if (event.key === "ArrowLeft") {
      moveQuestion(-1);
    }
  }
});

resetEditor();
renderDashboard();
