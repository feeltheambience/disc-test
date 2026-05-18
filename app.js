const tg = window.Telegram?.WebApp;
let currentQuestion = 0;
let scores = { D: 0, I: 0, S: 0, C: 0 };
let answerLog = [];

function init() {
    if (tg) {
        tg.ready();
        tg.expand();
        document.body.style.backgroundColor = tg.themeParams?.bg_color || "#1a1a2e";
    }
}

function startTest() {
    currentQuestion = 0;
    scores = { D: 0, I: 0, S: 0, C: 0 };
    answerLog = [];
    showScreen("screen-test");
    renderQuestion();
}

function restartTest() {
    showScreen("screen-welcome");
}

function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

function renderQuestion() {
    const q = DISC_QUESTIONS[currentQuestion];
    document.getElementById("question-counter").textContent =
        `Вопрос ${currentQuestion + 1} из ${DISC_QUESTIONS.length}`;
    document.getElementById("question-text").textContent = q.text;

    const fill = ((currentQuestion) / DISC_QUESTIONS.length) * 100;
    document.getElementById("progress-fill").style.width = fill + "%";

    const optionsDiv = document.getElementById("options");
    optionsDiv.innerHTML = "";

    const shuffled = [...q.options].sort(() => Math.random() - 0.5);

    shuffled.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = opt.text;
        btn.onclick = () => selectAnswer(opt.type, opt.text);
        optionsDiv.appendChild(btn);
    });

    const block = document.getElementById("question-block");
    block.classList.remove("slide-in");
    void block.offsetWidth;
    block.classList.add("slide-in");
}

function selectAnswer(type, text) {
    scores[type]++;
    answerLog.push({ q: currentQuestion + 1, type, text });

    document.querySelectorAll(".option-btn").forEach((b) => {
        b.disabled = true;
        if (b.textContent === text) b.classList.add("selected");
    });

    setTimeout(() => {
        currentQuestion++;
        if (currentQuestion < DISC_QUESTIONS.length) {
            renderQuestion();
        } else {
            showResults();
        }
    }, 300);
}

function showResults() {
    document.getElementById("progress-fill").style.width = "100%";

    const total = scores.D + scores.I + scores.S + scores.C || 1;
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const primary = sorted[0][0];

    const names = {
        D: "Доминирование",
        I: "Влияние",
        S: "Постоянство",
        C: "Соответствие",
    };
    const colors = { D: "#e74c3c", I: "#f1c40f", S: "#2ecc71", C: "#3498db" };
    const emojis = { D: "🔴", I: "🟡", S: "🟢", C: "🔵" };

    const chartDiv = document.getElementById("result-chart");
    chartDiv.innerHTML = "";

    sorted.forEach(([type, score]) => {
        const pct = Math.round((score / total) * 100);
        const row = document.createElement("div");
        row.className = "chart-row";
        row.innerHTML = `
            <div class="chart-label">${emojis[type]} ${type}</div>
            <div class="chart-bar-container">
                <div class="chart-bar" style="width: 0%; background: ${colors[type]}" data-width="${pct}"></div>
            </div>
            <div class="chart-pct">${pct}%</div>
        `;
        chartDiv.appendChild(row);
    });

    document.getElementById("result-desc").textContent =
        `Ваш основной тип: ${emojis[primary]} ${names[primary]}`;

    showScreen("screen-result");

    setTimeout(() => {
        document.querySelectorAll(".chart-bar").forEach((bar) => {
            bar.style.width = bar.dataset.width + "%";
        });
    }, 100);
}

function buildSummary() {
    const typeCounts = {};
    answerLog.forEach((a) => {
        typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    });
    return Object.entries(typeCounts)
        .map(([t, c]) => `${t}:${c}`)
        .join(",");
}

function sendSimpleReport() {
    const data = JSON.stringify({
        scores,
        summary: buildSummary(),
        report_type: "simple",
    });
    if (tg) {
        tg.sendData(data);
    } else {
        alert("Простой отчёт:\n" + data);
    }
}

function sendAIReport() {
    const data = JSON.stringify({
        scores,
        summary: buildSummary(),
        report_type: "ai",
    });
    if (tg) {
        tg.sendData(data);
    } else {
        alert("AI отчёт:\n" + data);
    }
}

init();
