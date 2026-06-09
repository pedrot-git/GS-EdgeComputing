const STALE_AFTER_MS = 15000;

const limits = {
  temperature: { low: 18, high: 29 },
  pressure: { center: 101.3, deviation: 4 },
  battery: { low: 45 },
  vibration: { high: 1.1 },
  solarRisk: { high: 70 },
  gpsQuality: { low: 65 },
  attentionRisk: 40,
  criticalRisk: 70
};

const attrs = [
  { key: "temperature", label: "Temperatura", unit: "C" },
  { key: "pressure", label: "Pressao", unit: "kPa" },
  { key: "battery", label: "Bateria", unit: "%" },
  { key: "vibration", label: "Vibracao", unit: "g" },
  { key: "solarRisk", label: "Risco solar", unit: "/100" },
  { key: "gpsQuality", label: "Qualidade GPS", unit: "%" },
  { key: "operationalRisk", label: "Risco operacional", unit: "/100" },
  { key: "source", label: "Origem", unit: "" }
];

const cards = document.querySelector("#cards");
const riskValue = document.querySelector("#riskValue");
const stateValue = document.querySelector("#stateValue");
const updatedAt = document.querySelector("#updatedAt");
const lastCommand = document.querySelector("#lastCommand");
const connectionStatus = document.querySelector("#connectionStatus");
const alertsList = document.querySelector("#alertsList");
const historyAttr = document.querySelector("#historyAttr");
const canvas = document.querySelector("#historyCanvas");
const ctx = canvas.getContext("2d");

function attrValue(entity, key, fallback = "--") {
  return entity?.[key]?.value ?? fallback;
}

function numberValue(entity, key) {
  const value = Number(attrValue(entity, key, NaN));
  return Number.isFinite(value) ? value : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatValue(value) {
  if (typeof value === "number" && !Number.isInteger(value)) return value.toFixed(1);
  return value;
}

function setConnection(state, text) {
  connectionStatus.className = `status-pill ${state}`;
  connectionStatus.textContent = text;
}

function riskClass(risk) {
  if (risk >= limits.criticalRisk) return "critical";
  if (risk >= limits.attentionRisk) return "attention";
  return "normal";
}

function readingTime(entity) {
  const raw = attrValue(entity, "TimeInstant", null);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function commandSummary(entity) {
  const candidates = ["setTelemetry", "setMode"].flatMap((command) => {
    const status = attrValue(entity, `${command}_status`, null);
    if (!status) return [];
    const info = attrValue(entity, `${command}_info`, "");
    const rawTime = entity?.[`${command}_status`]?.metadata?.TimeInstant?.value;
    const timestamp = rawTime ? new Date(rawTime).getTime() : 0;
    return [{
      text: `${command}: ${status}${info ? ` - ${info}` : ""}`,
      className: status === "OK" ? "normal" : status === "PENDING" ? "attention" : "critical",
      timestamp: Number.isFinite(timestamp) ? timestamp : 0
    }];
  });

  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0] || { text: "Nenhum", className: "" };
}

function buildAlerts(entity, stale) {
  const temp = numberValue(entity, "temperature");
  const pressure = numberValue(entity, "pressure");
  const battery = numberValue(entity, "battery");
  const vibration = numberValue(entity, "vibration");
  const solar = numberValue(entity, "solarRisk");
  const gps = numberValue(entity, "gpsQuality");
  const risk = numberValue(entity, "operationalRisk");

  const alerts = [];
  if (stale) alerts.push(["Telemetria desatualizada ha mais de 15 segundos.", "alert-critical"]);
  if (temp !== null && (temp > limits.temperature.high || temp < limits.temperature.low)) {
    alerts.push(["Temperatura fora da faixa operacional.", "alert-warning"]);
  }
  if (pressure !== null && Math.abs(pressure - limits.pressure.center) > limits.pressure.deviation) {
    alerts.push(["Pressao da capsula instavel.", "alert-warning"]);
  }
  if (battery !== null && battery < limits.battery.low) {
    alerts.push(["Bateria abaixo do limite preventivo.", "alert-critical"]);
  }
  if (vibration !== null && vibration > limits.vibration.high) {
    alerts.push(["Vibracao elevada detectada.", "alert-warning"]);
  }
  if (solar !== null && solar > limits.solarRisk.high) {
    alerts.push(["Risco solar alto para navegacao e comunicacao.", "alert-critical"]);
  }
  if (gps !== null && gps < limits.gpsQuality.low) {
    alerts.push(["Qualidade GPS ou sinal degradada.", "alert-critical"]);
  }
  if (risk !== null && risk >= limits.criticalRisk) {
    alerts.push(["Estado critico: aplicar procedimento de contingencia.", "alert-critical"]);
  } else if (risk !== null && risk >= limits.attentionRisk) {
    alerts.push(["Estado de atencao: acompanhar tendencia dos sensores.", "alert-warning"]);
  }

  if (!alerts.length) alerts.push(["Nenhuma anomalia ativa.", "normal"]);
  return alerts;
}

function renderCurrent(entity) {
  cards.innerHTML = attrs.map((attr) => {
    const value = attrValue(entity, attr.key);
    return `
      <article class="card">
        <span class="label">${escapeHtml(attr.label)}</span>
        <div class="value">${escapeHtml(formatValue(value))} <span class="unit">${escapeHtml(attr.unit)}</span></div>
      </article>
    `;
  }).join("");

  const risk = numberValue(entity, "operationalRisk") ?? 0;
  const state = String(attrValue(entity, "status", "--"));
  const timestamp = readingTime(entity);
  const stale = !timestamp || Date.now() - timestamp.getTime() > STALE_AFTER_MS;
  const command = commandSummary(entity);

  riskValue.textContent = `${risk}/100`;
  riskValue.className = riskClass(risk);
  stateValue.textContent = state;
  stateValue.className = riskClass(risk);
  updatedAt.textContent = timestamp
    ? timestamp.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })
    : "--";
  updatedAt.className = stale ? "critical" : "";
  lastCommand.textContent = command.text;
  lastCommand.className = command.className;

  setConnection(stale ? "stale" : "ok", stale ? "Dados antigos" : "Online");
  alertsList.innerHTML = buildAlerts(entity, stale)
    .map(([text, className]) => `<li class="${className}">${escapeHtml(text)}</li>`)
    .join("");
}

async function loadCurrent() {
  const response = await fetch("/api/current");
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function extractHistory(data) {
  const attr = data?.contextResponses?.[0]?.contextElement?.attributes?.[0];
  const values = attr?.values || [];
  return values.map((item) => ({
    time: new Date(item.recvTime),
    value: Number(item.attrValue)
  })).filter((item) => Number.isFinite(item.value) && !Number.isNaN(item.time.getTime()));
}

async function loadHistory(attr) {
  const response = await fetch(`/api/history?attr=${encodeURIComponent(attr)}&lastN=40`);
  if (!response.ok) throw new Error(await response.text());
  return extractHistory(await response.json());
}

function drawChart(points, label, emptyMessage = "Aguardando historico no STH-Comet...") {
  const width = canvas.width;
  const height = canvas.height;
  const pad = 42;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0f1316";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#334049";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = pad + ((height - pad * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#a8b4b0";
  ctx.font = "14px Segoe UI, Arial";
  ctx.fillText(label, pad, 24);

  if (points.length < 2) {
    ctx.fillText(emptyMessage, pad, height / 2);
    return;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  ctx.strokeStyle = "#5aa7ff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = pad + ((width - pad * 2) * index) / (points.length - 1);
    const y = height - pad - ((point.value - min) / spread) * (height - pad * 2);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#f3f6f5";
  points.forEach((point, index) => {
    const x = pad + ((width - pad * 2) * index) / (points.length - 1);
    const y = height - pad - ((point.value - min) / spread) * (height - pad * 2);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  const firstTime = points[0].time.toLocaleTimeString("pt-BR");
  const lastTime = points.at(-1).time.toLocaleTimeString("pt-BR");
  ctx.fillStyle = "#a8b4b0";
  ctx.fillText(firstTime, pad, height - 14);
  ctx.textAlign = "right";
  ctx.fillText(lastTime, width - pad, height - 14);
  ctx.fillText(`min ${min.toFixed(1)} / max ${max.toFixed(1)}`, width - pad, 24);
  ctx.textAlign = "left";
}

async function refresh() {
  try {
    const entity = await loadCurrent();
    renderCurrent(entity);

    const selected = historyAttr.value;
    const label = historyAttr.options[historyAttr.selectedIndex].textContent;
    const history = await loadHistory(selected);
    drawChart(history, label);
  } catch (error) {
    setConnection("error", "Sem dados");
    alertsList.innerHTML = `<li class="alert-critical">Nao foi possivel ler o FIWARE. Verifique Orion, STH e provisionamento.</li>`;
    drawChart([], "Historico", "Falha ao consultar o historico.");
    console.error(error);
  }
}

historyAttr.addEventListener("change", refresh);
refresh();
setInterval(refresh, 5000);
