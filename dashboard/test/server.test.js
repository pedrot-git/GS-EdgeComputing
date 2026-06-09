const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { HISTORY_ATTRIBUTES, createServer } = require("../server");

let server;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("exposes only supported history attributes", () => {
  assert.deepEqual(
    [...HISTORY_ATTRIBUTES],
    [
      "temperature",
      "pressure",
      "battery",
      "vibration",
      "solarRisk",
      "gpsQuality",
      "operationalRisk"
    ]
  );
});

test("rejects invalid history attributes before contacting FIWARE", async () => {
  const response = await fetch(`${baseUrl}/api/history?attr=notAllowed`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Atributo historico invalido" });
});

test("rejects write methods on the dashboard API", async () => {
  const response = await fetch(`${baseUrl}/api/current`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.deepEqual(await response.json(), { error: "Metodo nao permitido" });
});

test("blocks static path traversal", async () => {
  const response = await fetch(`${baseUrl}/..%2Fserver.js`);
  assert.equal(response.status, 403);
});
