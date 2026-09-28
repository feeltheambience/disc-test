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

// В Telegram отчёт уходит в чат, по обычной ссылке — показывается прямо на странице.
const IS_TELEGRAM = Boolean(tg && tg.initData);

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
    document.body.classList.add(IS_TELEGRAM ? "mode-telegram" : "mode-web");
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

    if (!IS_TELEGRAM) {
        await showWebReport(type, answersPacked);
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

function showSendFailed(message) {
    document.getElementById("send-failed")?.remove();
    const box = document.querySelector(".report-buttons");
    if (!box) return;
    const note = document.createElement("div");
    note.id = "send-failed";
    note.className = "fail-note";
    note.innerHTML = message
        ? `<b>Не получилось</b>${esc(message)}`
        : `<b>Не удалось отправить отчёт</b>
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

// ─────────────────── Веб-версия: отчёт прямо на странице ───────────────────

const REPORT_URL = "https://demofolio.ru/disc-api/report";
const PDF_URL = "https://demofolio.ru/disc-api/pdf/";

function esc(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function list(items) {
    return `<ul class="rep-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

async function showWebReport(type, answersPacked) {
    const name = (document.getElementById("user-name")?.value || "").trim();
    setButtonsBusy(true, type === "ai"
        ? "Считаю профиль, ИИ готовит разбор — 20–40 секунд…"
        : "Собираю отчёт…");

    let payload;
    try {
        const resp = await fetch(REPORT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers: answersPacked, type, name }),
        });
        payload = await resp.json();
        if (!resp.ok || !payload.ok) throw new Error(payload.error || resp.status);
    } catch (err) {
        console.error(err);
        setButtonsBusy(false, "");
        showSendFailed("Сервер отчётов недоступен. Попробуйте ещё раз через минуту.");
        return;
    }

    setButtonsBusy(false, "");
    renderReport(payload.report);
}

function renderReport(r) {
    const host = document.getElementById("screen-report");
    const per = r.perception;

    const sections = [];

    sections.push(`
        <div class="rep-head">
            <div class="rep-role-label">Ведущая роль</div>
            <div class="rep-role">${esc(r.wheel_natural.name)}</div>
            <div class="rep-role-desc">${esc(r.wheel_natural.description)}</div>
            <div class="rep-codes">SIN ${esc(r.sin)} · SIA ${esc(r.sia)}</div>
        </div>`);

    sections.push(`<div class="rep-graphs">
        <div class="graph-box" id="rep-graph-nat"></div>
        <div class="graph-box" id="rep-graph-ad"></div>
    </div>`);

    sections.push(`<section class="rep-block">
        <h3>Общая характеристика</h3>
        <p>${r.general.map(esc).join(" ")}</p></section>`);

    sections.push(`<section class="rep-block">
        <h3>Ценность для организации</h3>${list(r.value)}</section>`);

    sections.push(`<section class="rep-block">
        <h3>Как общаться</h3>
        <h4 class="do">Что помогает</h4>${list(r.comm_do)}
        <h4 class="dont">Что вредит</h4>${list(r.comm_dont)}</section>`);

    sections.push(`<section class="rep-block">
        <h3>Восприятие поведения</h3>
        <div class="rep-row"><b>Воспринимает себя как</b><span>${esc(per.self.join(", "))}</span></div>
        <div class="rep-row"><b>При умеренном давлении</b><span>${esc(per.moderate.join(", "))}</span></div>
        <div class="rep-row"><b>При сильном стрессе</b><span>${esc(per.extreme.join(", "))}</span></div>
        </section>`);

    sections.push(`<section class="rep-block">
        <h3>Естественный и адаптированный стили</h3>
        <p class="rep-note">Уровень адаптации: <b>${esc(r.adaptation.verdict)}</b>
           (${r.adaptation.total} пунктов). ${esc(r.adaptation.comment)}</p>
        ${r.areas.map((a) => `
            <div class="rep-area">
                <div class="rep-area-title">${esc(a.title)}
                    <span>${a.natural_score} → ${a.adapted_score}</span></div>
                <p><b>Естественный.</b> ${esc(a.natural)}</p>
                <p><b>Адаптированный.</b> ${esc(a.adapted)}</p>
            </div>`).join("")}
        </section>`);

    sections.push(`<section class="rep-block">
        <h3>Ранжирование поведенческих характеристик</h3>
        ${r.behaviors.map((b, i) => `
            <div class="beh-row">
                <div class="beh-title">${i + 1}. ${esc(b.title)}</div>
                <div class="beh-bars">
                    <div class="beh-track"><div class="beh-fill nat" style="width:${b.natural}%"></div></div>
                    <div class="beh-track"><div class="beh-fill ad" style="width:${b.adapted}%"></div></div>
                </div>
                <div class="beh-nums"><span>${b.natural}</span><span>${b.adapted}</span></div>
            </div>`).join("")}
        <div class="rep-legend"><i class="nat"></i> естественный <i class="ad"></i> адаптированный</div>
        </section>`);

    if (r.time_wasters.length) {
        sections.push(`<section class="rep-block">
            <h3>Пожиратели времени</h3>
            ${r.time_wasters.map((t) => `
                <div class="rep-area">
                    <div class="rep-area-title">${esc(t.title)}</div>
                    <p><b>Причины</b></p>${list(t.causes)}
                    <p><b>Решения</b></p>${list(t.fixes)}
                </div>`).join("")}
            </section>`);
    }

    sections.push(`<section class="rep-block">
        <h3>Области совершенствования</h3>${list(r.improvements)}</section>`);

    sections.push(`<section class="rep-block">
        <h3>Идеальная рабочая обстановка</h3>${list(r.ideal_env)}</section>`);

    sections.push(`<section class="rep-block">
        <h3>Принципы управления</h3>${list(r.management)}</section>`);

    if (r.ai_text) {
        const paragraphs = r.ai_text.split("\n").filter((x) => x.trim());
        sections.push(`<section class="rep-block rep-ai">
            <h3>Индивидуальная интерпретация</h3>
            ${paragraphs.map((p) => {
                const isHeading = p === p.toUpperCase() && p.length < 60;
                return isHeading ? `<h4>${esc(p)}</h4>` : `<p>${esc(p)}</p>`;
            }).join("")}
            </section>`);
    } else if (r.ai_limited) {
        sections.push(`<section class="rep-block rep-warn">
            Лимит ИИ-разборов исчерпан — показан базовый отчёт. Попробуйте позже.
            </section>`);
    }

    host.innerHTML = `
        <div class="rep-top">
            <div class="rep-name">${esc(r.name)}</div>
            <div class="rep-sub">Отчёт DISC · ${new Date().toLocaleDateString("ru-RU")}</div>
        </div>
        ${sections.join("")}
        <a class="btn-primary" id="pdf-link" href="${PDF_URL}${encodeURIComponent(r.id)}">
            📄 Скачать PDF-отчёт</a>
        <button class="btn-restart" onclick="restartAll()">🔄 Пройти тест заново</button>`;

    showScreen("screen-report");
    renderGraph("rep-graph-nat", r.natural, "График II · Естественный стиль",
        "базовое поведение без подстройки");
    renderGraph("rep-graph-ad", r.adapted, "График I · Адаптированный стиль",
        "как ведёт себя в текущей среде");
    setTimeout(() => {
        document.querySelectorAll("#screen-report .graph-fill").forEach((el) => {
            el.style.height = el.dataset.h + "%";
        });
    }, 100);
}

function restartAll() {
    document.getElementById("screen-report").innerHTML = "";
    renderWelcome();
}
