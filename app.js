const tg = window.Telegram?.WebApp;

const FACTORS = ["D", "I", "S", "C"];
const FACTOR_NAMES = { D: "Доминирование", I: "Влияние", S: "Постоянство", C: "Соответствие" };
const FACTOR_COLORS = { D: "#E53935", I: "#FFB300", S: "#43A047", C: "#1E88E5" };

const WHEEL_ROLES = [
    "ОРГАНИЗАТОР", "ВДОХНОВИТЕЛЬ", "ПРОМОУТЕР", "СВЯЗНОЙ",
    "СОРАТНИК", "КООРДИНАТОР", "АНАЛИТИК", "ИСПОЛНИТЕЛЬ",
];
const WHEEL_PREFIX = {
    "ОРГАНИЗАТОР": "ОРГАНИЗУЮЩИЙ", "ВДОХНОВИТЕЛЬ": "ВДОХНОВЛЯЮЩИЙ",
    "ПРОМОУТЕР": "ПРОДВИГАЮЩИЙ", "СВЯЗНОЙ": "СВЯЗУЮЩИЙ",
    "СОРАТНИК": "ПОДДЕРЖИВАЮЩИЙ", "КООРДИНАТОР": "КООРДИНИРУЮЩИЙ",
    "АНАЛИТИК": "АНАЛИЗИРУЮЩИЙ", "ИСПОЛНИТЕЛЬ": "ИСПОЛНЯЮЩИЙ",
};

let groupIndex = 0;
let step = "most";          // most → least
let currentMost = null;
let answers = [];           // [{ most: "D", least: "S" }]
let shuffled = [];

function init() {
    if (tg) {
        tg.ready();
        tg.expand();
    }
    renderWelcome();
}

function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    window.scrollTo(0, 0);
}

function renderWelcome() {
    showScreen("screen-welcome");
}

function startTest() {
    groupIndex = 0;
    step = "most";
    currentMost = null;
    answers = [];
    showScreen("screen-test");
    renderGroup();
}

function restartTest() {
    renderWelcome();
}

function renderGroup() {
    const group = DISC_GROUPS[groupIndex];
    shuffled = [...group].sort(() => Math.random() - 0.5);

    document.getElementById("question-counter").textContent =
        `Группа ${groupIndex + 1} из ${DISC_GROUPS.length}`;
    document.getElementById("progress-fill").style.width =
        (groupIndex / DISC_GROUPS.length) * 100 + "%";

    renderStep();
}

function renderStep() {
    const promptEl = document.getElementById("step-prompt");
    const hintEl = document.getElementById("step-hint");

    if (step === "most") {
        promptEl.textContent = "Что БОЛЬШЕ всего похоже на вас?";
        promptEl.className = "step-prompt most";
        hintEl.textContent = "Шаг 1 из 2 · выберите одну характеристику";
    } else {
        promptEl.textContent = "А что МЕНЬШЕ всего похоже?";
        promptEl.className = "step-prompt least";
        hintEl.textContent = "Шаг 2 из 2 · из оставшихся";
    }

    const optionsDiv = document.getElementById("options");
    optionsDiv.innerHTML = "";

    shuffled.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.textContent = opt.t;

        if (step === "least" && opt.f === currentMost) {
            btn.classList.add("picked-most");
            btn.disabled = true;
            btn.innerHTML = `${opt.t}<span class="tag">больше всего</span>`;
        } else {
            btn.onclick = () => selectOption(opt.f);
        }
        optionsDiv.appendChild(btn);
    });

    const block = document.getElementById("question-block");
    block.classList.remove("slide-in");
    void block.offsetWidth;
    block.classList.add("slide-in");
}

function selectOption(factor) {
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();

    if (step === "most") {
        currentMost = factor;
        step = "least";
        renderStep();
        return;
    }

    answers.push({ most: currentMost, least: factor });
    currentMost = null;
    step = "most";
    groupIndex++;

    if (groupIndex < DISC_GROUPS.length) {
        renderGroup();
    } else {
        document.getElementById("progress-fill").style.width = "100%";
        showResults();
    }
}

function goBack() {
    if (step === "least") {
        step = "most";
        currentMost = null;
        renderStep();
    } else if (groupIndex > 0) {
        groupIndex--;
        answers.pop();
        renderGroup();
    }
}

// ─────────────────── расчёт профиля (зеркало серверного движка) ───────────────────

function computeProfile() {
    const most = { D: 0, I: 0, S: 0, C: 0 };
    const least = { D: 0, I: 0, S: 0, C: 0 };
    answers.forEach((a) => { most[a.most]++; least[a.least]++; });

    const expected = answers.length / 4;
    const scale = (count, inverse) => {
        const delta = count - expected;
        const raw = inverse ? 50 - delta * 7 : 50 + delta * 7;
        return Math.round(Math.max(0, Math.min(100, raw)));
    };

    const adapted = {}, natural = {};
    FACTORS.forEach((f) => {
        adapted[f] = scale(most[f], false);
        natural[f] = scale(least[f], true);
    });
    return { natural, adapted };
}

function wheelRole(scores) {
    const pulls = {};
    FACTORS.forEach((f) => { pulls[f] = Math.max(0, scores[f] - 50); });
    if (FACTORS.every((f) => pulls[f] === 0)) {
        const lowest = Math.min(...FACTORS.map((f) => scores[f]));
        FACTORS.forEach((f) => { pulls[f] = scores[f] - lowest; });
    }
    const x = pulls.I - pulls.C;
    const y = pulls.D - pulls.S;
    let angle = (Math.atan2(x, y) * 180) / Math.PI;
    if (angle < 0) angle += 360;

    const sectorSize = 45;
    const sectorIndex = Math.floor(((angle + sectorSize / 2) % 360) / sectorSize);
    const mainRole = WHEEL_ROLES[sectorIndex];

    const center = sectorIndex * sectorSize;
    let offset = ((angle - center + 180) % 360) - 180;
    const neighbour = WHEEL_ROLES[(sectorIndex + (offset > 0 ? 1 : -1) + 8) % 8];

    const name = Math.abs(offset) < sectorSize * 0.25
        ? mainRole
        : `${WHEEL_PREFIX[neighbour]} ${mainRole}`;

    return { name, position: Math.floor((angle / 360) * 60) + 1 };
}

function renderGraph(containerId, scores, title, subtitle) {
    const box = document.getElementById(containerId);
    box.innerHTML = `
        <div class="graph-title">${title}</div>
        <div class="graph-sub">${subtitle}</div>
        <div class="graph-bars">
            ${FACTORS.map((f) => `
                <div class="graph-col">
                    <div class="graph-value" style="color:${FACTOR_COLORS[f]}">${scores[f]}</div>
                    <div class="graph-track">
                        <div class="graph-fill" data-h="${scores[f]}"
                             style="height:0%;background:${FACTOR_COLORS[f]}"></div>
                    </div>
                    <div class="graph-label" style="color:${FACTOR_COLORS[f]}">${f}</div>
                </div>`).join("")}
            <div class="energy-line"></div>
        </div>`;
}

function showResults() {
    const { natural, adapted } = computeProfile();
    const role = wheelRole(natural);

    renderGraph("graph-natural", natural, "График II · Естественный стиль",
        "как вы действуете без подстройки");
    renderGraph("graph-adapted", adapted, "График I · Адаптированный стиль",
        "как считаете нужным вести себя сейчас");

    const gap = FACTORS.reduce((sum, f) => sum + Math.abs(adapted[f] - natural[f]), 0);
    const gapText = gap <= 20 ? "низкая" : gap <= 45 ? "умеренная" : "высокая";

    document.getElementById("role-name").textContent = role.name;
    document.getElementById("role-meta").textContent =
        `позиция ${role.position} на ролевом колесе · адаптация ${gapText}`;

    showScreen("screen-result");

    setTimeout(() => {
        document.querySelectorAll(".graph-fill").forEach((el) => {
            el.style.height = el.dataset.h + "%";
        });
    }, 120);
}

// ─────────────────────────── отправка в бот ───────────────────────────

const API_URL = "https://demofolio.ru/disc-api/submit";

function packAnswers() {
    return answers.map((a) => a.most + a.least).join("");
}

function setButtonsBusy(busy, message) {
    document.querySelectorAll(".report-buttons button").forEach((b) => { b.disabled = busy; });
    const intro = document.getElementById("send-status");
    if (intro) intro.textContent = message || "";
}

// sendData() работает только если Mini App открыт кнопкой reply-клавиатуры.
// При запуске из кнопки меню он молча не срабатывает — поэтому сначала шлём
// результаты на API (там подпись initData проверяется), а sendData оставляем запасным.
async function sendReport(type) {
    const answersPacked = packAnswers();

    if (!tg) {
        alert("Вне Telegram отправка недоступна.\n\n" + answersPacked);
        return;
    }

    setButtonsBusy(true, "Отправляю результаты…");

    if (tg.initData) {
        try {
            const resp = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ initData: tg.initData, answers: answersPacked, type }),
            });
            if (resp.ok) {
                setButtonsBusy(false, "");
                showSent();
                return;
            }
            console.warn("API ответил", resp.status);
        } catch (err) {
            console.warn("API недоступен:", err);
        }
    }

    // Запасной путь. При успехе Telegram сам закрывает окно; если через 3 секунды
    // мы всё ещё открыты — значит sendData не сработал (запуск не с reply-клавиатуры).
    tg.sendData(JSON.stringify({ v: 2, answers: answersPacked, type }));
    setTimeout(() => {
        setButtonsBusy(false, "");
        showSendFailed();
    }, 3000);
}

function showSendFailed() {
    if (document.getElementById("send-failed")) return;
    const box = document.querySelector(".report-buttons");
    if (!box) return;
    const note = document.createElement("div");
    note.id = "send-failed";
    note.className = "fail-note";
    note.innerHTML = `
        <b>Не удалось отправить отчёт</b>
        Закройте это окно, отправьте боту /start и откройте тест
        кнопкой «🧪 Пройти DISC-тест» внизу экрана — тогда результаты дойдут.`;
    box.after(note);
    note.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showSent() {
    const box = document.getElementById("screen-result");
    const sent = document.createElement("div");
    sent.className = "sent-note";
    sent.innerHTML = `
        <div class="sent-icon">✓</div>
        <div class="sent-title">Отчёт отправлен в чат</div>
        <div class="sent-text">Закройте это окно — отчёт и PDF придут сообщением от бота.</div>
        <button class="btn-primary" onclick="tg.close()">Закрыть и посмотреть отчёт</button>`;
    box.querySelector(".report-buttons").replaceWith(sent);
    const restart = box.querySelector(".btn-restart");
    if (restart) restart.remove();
    const intro = document.querySelector(".report-intro");
    if (intro) intro.remove();
    window.scrollTo(0, document.body.scrollHeight);
}

init();
