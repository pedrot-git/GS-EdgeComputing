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

const sensorAttrs = [
  { key: "temperature", label: "Temperatura", unit: "°C", icon: "thermometer", tone: "blue" },
  { key: "pressure", label: "Pressão", unit: "kPa", icon: "gauge", tone: "purple" },
  { key: "vibration", label: "Vibração", unit: "g", icon: "pulse", tone: "purple" },
  { key: "gpsQuality", label: "Qualidade GPS", unit: "%", icon: "pin", tone: "green" },
  { key: "source", label: "Origem", unit: "", icon: "antenna", tone: "blue" }
];

const historyUnits = {
  operationalRisk: "/100",
  temperature: "°C",
  pressure: "kPa",
  battery: "%",
  vibration: "g",
  solarRisk: "/100",
  gpsQuality: "%"
};

const sensorCards = document.querySelector("#sensorCards");
const riskValue = document.querySelector("#riskValue");
const stateValue = document.querySelector("#stateValue");
const batteryValue = document.querySelector("#batteryValue");
const solarRiskValue = document.querySelector("#solarRiskValue");
const updatedAt = document.querySelector("#updatedAt");
const lastCommand = document.querySelector("#lastCommand");
const commandTime = document.querySelector("#commandTime");
const connectionStatus = document.querySelector("#connectionStatus");
const footerReading = document.querySelector("#footerReading");
const footerRisk = document.querySelector("#footerRisk");
const footerConnection = document.querySelector("#footerConnection");
const alertsList = document.querySelector("#alertsList");
const historyAttr = document.querySelector("#historyAttr");
const historyTitle = document.querySelector("#historyTitle");
const canvas = document.querySelector("#historyCanvas");
const ctx = canvas.getContext("2d");
const readingBar = document.querySelector(".reading-bar");

let lastChart = { points: [], label: "Risco operacional", attr: "operationalRisk" };
let resizeTimer;

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

function valueMarkup(value, unit) {
  return `${escapeHtml(formatValue(value))}${unit ? ` <span class="unit">${escapeHtml(unit)}</span>` : ""}`;
}

function iconMarkup(name) {
  return `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function setConnection(state, text) {
  connectionStatus.className = `status-pill ${state}`;
  connectionStatus.innerHTML = `${iconMarkup(state === "stale" ? "calendar" : "wifi")}<span>${escapeHtml(text)}</span>`;
  footerConnection.textContent = text;
  footerConnection.className = state === "ok" ? "normal" : state === "stale" ? "attention" : "critical";
  readingBar.className = `reading-bar ${state}`;
}

function riskClass(risk) {
  if (risk >= limits.criticalRisk) return "critical";
  if (risk >= limits.attentionRisk) return "attention";
  return "normal";
}

function metricClass(key, value) {
  if (typeof value !== "number") return "";
  if (key === "temperature" && (value < limits.temperature.low || value > limits.temperature.high)) return "attention";
  if (key === "pressure" && Math.abs(value - limits.pressure.center) > limits.pressure.deviation) return "attention";
  if (key === "battery" && value < limits.battery.low) return "critical";
  if (key === "vibration" && value > limits.vibration.high) return "attention";
  if (key === "solarRisk" && value > limits.solarRisk.high) return "critical";
  if (key === "gpsQuality" && value < limits.gpsQuality.low) return "critical";
  return "";
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
    const date = rawTime ? new Date(rawTime) : null;
    const timestamp = date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
    return [{
      text: `${command}: ${status}${info ? ` - ${info}` : ""}`,
      className: status === "OK" ? "normal" : status === "PENDING" ? "attention" : "critical",
      date,
      timestamp
    }];
  });

  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0] || { text: "Nenhum comando registrado", className: "", date: null };
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
  if (stale) alerts.push(["Telemetria desatualizada há mais de 15 segundos.", "alert-critical"]);
  if (temp !== null && (temp > limits.temperature.high || temp < limits.temperature.low)) {
    alerts.push(["Temperatura fora da faixa operacional.", "alert-warning"]);
  }
  if (pressure !== null && Math.abs(pressure - limits.pressure.center) > limits.pressure.deviation) {
    alerts.push(["Pressão da cápsula instável.", "alert-warning"]);
  }
  if (battery !== null && battery < limits.battery.low) {
    alerts.push(["Bateria abaixo do limite preventivo.", "alert-critical"]);
  }
  if (vibration !== null && vibration > limits.vibration.high) {
    alerts.push(["Vibração elevada detectada.", "alert-warning"]);
  }
  if (solar !== null && solar > limits.solarRisk.high) {
    alerts.push(["Risco solar alto para navegação e comunicação.", "alert-critical"]);
  }
  if (gps !== null && gps < limits.gpsQuality.low) {
    alerts.push(["Qualidade GPS ou sinal degradada.", "alert-critical"]);
  }
  if (risk !== null && risk >= limits.criticalRisk) {
    alerts.push(["Estado crítico: aplicar procedimento de contingência.", "alert-critical"]);
  } else if (risk !== null && risk >= limits.attentionRisk) {
    alerts.push(["Estado de atenção: acompanhar tendência dos sensores.", "alert-warning"]);
  }

  return alerts;
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    alertsList.innerHTML = `
      <div class="alert-empty">
        <div class="alert-heading normal">${iconMarkup("check")}<strong>Nenhum trigger ativo</strong></div>
        <p>Telemetria funcionando dentro dos parâmetros esperados.</p>
      </div>
    `;
    return;
  }

  alertsList.innerHTML = alerts.map(([text, className]) => `
    <div class="alert-row ${className}">
      ${iconMarkup("warning")}
      <span>${escapeHtml(text)}</span>
    </div>
  `).join("");
}

function renderCurrent(entity) {
  sensorCards.innerHTML = sensorAttrs.map((attr) => {
    const rawValue = attr.key === "source" ? attrValue(entity, attr.key) : numberValue(entity, attr.key);
    const value = rawValue ?? "--";
    const valueClass = metricClass(attr.key, rawValue);
    return `
      <article class="metric-card secondary-card">
        <div>
          <span class="label">${escapeHtml(attr.label)}</span>
          <strong class="metric-value ${valueClass}">${valueMarkup(value, attr.unit)}</strong>
        </div>
        <span class="metric-icon ${attr.tone}">${iconMarkup(attr.icon)}</span>
      </article>
    `;
  }).join("");

  const risk = numberValue(entity, "operationalRisk") ?? 0;
  const battery = numberValue(entity, "battery");
  const solarRisk = numberValue(entity, "solarRisk");
  const state = String(attrValue(entity, "status", "--"));
  const timestamp = readingTime(entity);
  const stale = !timestamp || Date.now() - timestamp.getTime() > STALE_AFTER_MS;
  const command = commandSummary(entity);
  const formattedTimestamp = timestamp
    ? timestamp.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })
    : "--";

  riskValue.innerHTML = valueMarkup(risk, "/100");
  riskValue.className = `metric-value ${riskClass(risk)}`;
  stateValue.textContent = state;
  stateValue.className = `metric-value state-value ${riskClass(risk)}`;
  batteryValue.innerHTML = valueMarkup(battery ?? "--", "%");
  batteryValue.className = `metric-value ${metricClass("battery", battery)}`;
  solarRiskValue.innerHTML = valueMarkup(solarRisk ?? "--", "/100");
  solarRiskValue.className = `metric-value ${metricClass("solarRisk", solarRisk)}`;

  updatedAt.textContent = formattedTimestamp;
  updatedAt.className = stale ? "critical" : "";
  updatedAt.dateTime = timestamp ? timestamp.toISOString() : "";
  footerReading.textContent = formattedTimestamp;
  footerReading.className = stale ? "critical" : "normal";
  footerRisk.textContent = `${risk}/100`;
  footerRisk.className = riskClass(risk);

  lastCommand.textContent = command.text;
  lastCommand.className = command.className;
  commandTime.textContent = command.date
    ? `Executado em ${command.date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}`
    : "Nenhuma execução informada pelo FIWARE";

  setConnection(stale ? "stale" : "ok", stale ? "Dados antigos" : "Online");
  renderAlerts(buildAlerts(entity, stale));
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

function chartColor(attr) {
  if (attr === "battery" || attr === "solarRisk") return "#ffc928";
  if (attr === "vibration" || attr === "pressure") return "#a75cff";
  if (attr === "gpsQuality") return "#42e587";
  return "#4d92ff";
}

function drawChart(points, label, attr, emptyMessage = "Aguardando histórico no STH-Comet...") {
  lastChart = { points, label, attr, emptyMessage };
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(Math.round(rect.width), 320);
  const height = Math.max(Math.round(rect.height), 220);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const compact = width < 560;
  const pad = { top: 28, right: compact ? 14 : 20, bottom: 32, left: compact ? 35 : 42 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  ctx.strokeStyle = "rgba(136, 160, 191, 0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = pad.top + (chartHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#93a3ba";
  ctx.font = `${compact ? 10 : 11}px Segoe UI, Arial`;

  if (points.length < 2) {
    ctx.fillText(emptyMessage, pad.left, height / 2);
    return;
  }

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const rawSpread = maxValue - minValue;
  const margin = rawSpread === 0 ? Math.max(Math.abs(maxValue) * 0.1, 1) : rawSpread * 0.14;
  const min = Math.max(0, minValue - margin);
  const boundedMaximum = ["operationalRisk", "solarRisk", "battery", "gpsQuality"].includes(attr);
  const max = boundedMaximum ? Math.min(100, maxValue + margin) : maxValue + margin;
  const spread = max - min;
  const color = chartColor(attr);

  for (let i = 0; i < 5; i++) {
    const value = max - (spread * i) / 4;
    const y = pad.top + (chartHeight * i) / 4;
    ctx.fillStyle = "#7f90a7";
    ctx.textAlign = "right";
    ctx.fillText(value.toFixed(value < 10 ? 1 : 0), pad.left - 9, y + 4);
  }

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, `${color}2e`);
  gradient.addColorStop(1, `${color}00`);
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = pad.left + (chartWidth * index) / (points.length - 1);
    const y = height - pad.bottom - ((point.value - min) / spread) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    const x = pad.left + (chartWidth * index) / (points.length - 1);
    const y = height - pad.bottom - ((point.value - min) / spread) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = color;
  points.forEach((point, index) => {
    if (compact && index % Math.max(1, Math.floor(points.length / 12)) !== 0 && index !== points.length - 1) return;
    const x = pad.left + (chartWidth * index) / (points.length - 1);
    const y = height - pad.bottom - ((point.value - min) / spread) * chartHeight;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  const firstTime = points[0].time.toLocaleTimeString("pt-BR");
  const lastTime = points.at(-1).time.toLocaleTimeString("pt-BR");
  ctx.fillStyle = "#7f90a7";
  ctx.textAlign = "left";
  ctx.fillText(firstTime, pad.left, height - 9);
  ctx.textAlign = "right";
  ctx.fillText(lastTime, width - pad.right, height - 9);
  ctx.textAlign = "left";

  canvas.setAttribute(
    "aria-label",
    `${label}: ${points.length} leituras, mínimo ${minValue.toFixed(1)} e máximo ${maxValue.toFixed(1)} ${historyUnits[attr] || ""}`
  );
}

async function refresh() {
  try {
    const entity = await loadCurrent();
    renderCurrent(entity);

    const selected = historyAttr.value;
    const label = historyAttr.options[historyAttr.selectedIndex].textContent;
    historyTitle.textContent = `Histórico de ${label.toLocaleLowerCase("pt-BR")}`;
    const history = await loadHistory(selected);
    drawChart(history, label, selected);
  } catch (error) {
    setConnection("error", "Sem dados");
    renderAlerts([["Não foi possível ler o FIWARE. Verifique Orion, STH e provisionamento.", "alert-critical"]]);
    drawChart([], "Histórico", historyAttr.value, "Falha ao consultar o histórico.");
    console.error(error);
  }
}

historyAttr.addEventListener("change", refresh);
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawChart(lastChart.points, lastChart.label, lastChart.attr, lastChart.emptyMessage);
  }, 120);
});

refresh();
setInterval(refresh, 5000);
