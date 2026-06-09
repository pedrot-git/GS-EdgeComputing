const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const FIWARE_HOST = process.env.FIWARE_HOST || "localhost";
const FIWARE_SERVICE = process.env.FIWARE_SERVICE || "smart";
const FIWARE_SERVICE_PATH = process.env.FIWARE_SERVICE_PATH || "/";
const ENTITY_ID = "urn:ngsi-ld:Dragon:001";
const ENTITY_TYPE = "DragonTelemetry";
const FIWARE_TIMEOUT_MS = Number(process.env.FIWARE_TIMEOUT_MS || 5000);
const HISTORY_ATTRIBUTES = new Set([
  "temperature",
  "pressure",
  "battery",
  "vibration",
  "solarRisk",
  "gpsQuality",
  "operationalRisk"
]);

const publicDir = path.join(__dirname, "public");

function fiwareHeaders() {
  return {
    "fiware-service": FIWARE_SERVICE,
    "fiware-servicepath": FIWARE_SERVICE_PATH,
    Accept: "application/json"
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIWARE_TIMEOUT_MS);

  let response;
  let text;
  try {
    response = await fetch(url, {
      headers: fiwareHeaders(),
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`FIWARE excedeu o timeout de ${FIWARE_TIMEOUT_MS} ms`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const error = new Error(`FIWARE respondeu ${response.status}: ${text}`);
    error.status = response.status;
    throw error;
  }

  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requestPath = parsedUrl.pathname === "/" ? "index.html" : decodeURIComponent(parsedUrl.pathname.slice(1));
  const filePath = path.resolve(publicDir, requestPath);

  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "application/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

async function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Metodo nao permitido" });
      return;
    }

    if (url.pathname === "/api/current") {
      const data = await fetchJson(`http://${FIWARE_HOST}:1026/v2/entities/${encodeURIComponent(ENTITY_ID)}`);
      sendJson(res, 200, data);
      return;
    }

    if (url.pathname === "/api/history") {
      const attr = url.searchParams.get("attr") || "operationalRisk";
      if (!HISTORY_ATTRIBUTES.has(attr)) {
        sendJson(res, 400, { error: "Atributo historico invalido" });
        return;
      }

      const requestedLastN = Number.parseInt(url.searchParams.get("lastN") || "30", 10);
      const safeLastN = Number.isFinite(requestedLastN)
        ? Math.min(Math.max(requestedLastN, 1), 200)
        : 30;
      const data = await fetchJson(
        `http://${FIWARE_HOST}:8666/STH/v1/contextEntities/type/${ENTITY_TYPE}/id/${ENTITY_ID}/attributes/${attr}?lastN=${safeLastN}`
      );
      sendJson(res, 200, data);
      return;
    }

    sendJson(res, 404, { error: "API nao encontrada" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message });
  }
}

function createServer() {
  return http.createServer((req, res) => {
    if ((req.url || "").startsWith("/api/")) {
      routeApi(req, res);
      return;
    }

    sendStatic(req, res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`SolarNav Guard Dashboard: http://localhost:${PORT}`);
    console.log(`FIWARE host: ${FIWARE_HOST}`);
  });
}

module.exports = {
  HISTORY_ATTRIBUTES,
  createServer
};
