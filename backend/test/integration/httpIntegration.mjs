import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import * as argon2 from 'argon2';
import pg from 'pg';

const root = resolve(import.meta.dirname, '../../..');
const metricsDirectory = process.env.METRICS_DIR;
assert(metricsDirectory, 'METRICS_DIR é obrigatório');
await mkdir(metricsDirectory, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'naporta-http-'));
const container = `naporta-http-${randomBytes(6).toString('hex')}`;
const runId = randomUUID();
const secret = randomBytes(48).toString('hex');
const password = randomBytes(18).toString('hex');
const samples = [];
const children = [];
let pool;
let complete = false;
const execute = (command, args, options = {}) => execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
async function freePort() {
  const server = createServer();
  await new Promise((resolveListening) => server.listen(0, '127.0.0.1', resolveListening));
  const port = server.address().port;
  await new Promise((resolveClosed) => server.close(resolveClosed));
  return port;
}
async function waitFor(check, message) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { if (await check()) return; } catch { /* startup can transiently fail */ }
    await delay(200);
  }
  throw new Error(message);
}
function token(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.${createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')}`;
}
let bearer;
async function request(base, method, path, expected, scenario, body, authorization = bearer) {
  const requestId = randomUUID();
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { method, headers: {
    'x-request-id': requestId,
    ...(encoded ? { 'content-type': 'application/json' } : {}),
    ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
  }, body: encoded, signal: AbortSignal.timeout(15000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  const clientDurationMs = performance.now() - started;
  assert.equal(response.status, expected, `${scenario}: HTTP ${response.status}, esperado ${expected}`);
  assert.equal(response.headers.get('x-request-id'), requestId, 'correlação HTTP ausente');
  const route = path.startsWith('/api/v1/orders/') ? '/api/v1/orders/:id' : path.split('?')[0];
  samples.push({ requestId, runId, method, route, scenario, statusCode: response.status,
    expectedStatusCode: expected, clientDurationMs, requestBodyBytes: Buffer.byteLength(encoded ?? ''),
    responseBodyBytes: bytes.length, cacheOutcome: 'bypass', databaseRole: 'primary',
    outcome: 'completed', profile: 'full' });
  if (expected === 204) assert.equal(bytes.length, 0);
  const json = bytes.length ? JSON.parse(bytes.toString('utf8')) : undefined;
  if (expected >= 400) {
    assert.equal(typeof json.error.requestId, 'string');
    assert(!bytes.includes(Buffer.from(secret)), 'segredo exposto');
    assert(!('stack' in json.error), 'stack exposta');
  }
  return json;
}
async function startApi(port, databaseUrl, cacheDirectory) {
  const child = spawn(process.execPath, ['dist/main.js'], { cwd: join(root, 'backend'),
    env: { ...process.env, DATABASE_URL: databaseUrl, JWT_SECRET: secret, JWT_ISSUER: 'integration',
      JWT_AUDIENCE: 'integration', API_PORT: String(port), CACHE_DIRECTORY: cacheDirectory,
      HTTP_METRICS_FILE: join(scratch, 'server.jsonl') }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  // Keep bounded diagnostics private; never publish API output containing unpredictable data.
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4096); });
  child.stdout.resume();
  const base = `http://127.0.0.1:${port}`;
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error('API encerrou antes de ficar pronta');
    return (await fetch(`${base}/health/ready`)).status === 200;
  }, `API não ficou pronta (${child.exitCode ?? 'timeout'})`);
  return base;
}
try {
  execute('docker', ['info']);
  const dbPassword = randomBytes(24).toString('hex');
  execute('docker', ['run', '--detach', '--name', container, '--publish', '127.0.0.1::5432',
    '--env', `POSTGRES_PASSWORD=${dbPassword}`, '--env', 'POSTGRES_DB=naporta_integration',
    'postgres:16.6-alpine']);
  const mapped = execute('docker', ['port', container, '5432/tcp']).trim();
  const databaseUrl = `postgresql://postgres:${dbPassword}@${mapped}/naporta_integration`;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 3, connectionTimeoutMillis: 1000 });
  await waitFor(async () => { await pool.query('SELECT 1'); return true; }, 'PostgreSQL não ficou pronto');
  const migrations = join(root, 'database/prisma/migrations');
  for (const directory of (await readdir(migrations)).sort()) {
    if (!/^\d/.test(directory)) continue;
    await pool.query(await readFile(join(migrations, directory, 'migration.sql'), 'utf8'));
  }
  const publicId = randomUUID();
  await pool.query('INSERT INTO users(public_id,email,password_hash) VALUES ($1,$2,$3)',
    [publicId, 'integration@example.test', await argon2.hash(password, { type: argon2.argon2id })]);
  const cache = join(scratch, 'cache');
  await mkdir(cache);
  const base = await startApi(await freePort(), databaseUrl, cache);
  const second = await startApi(await freePort(), databaseUrl, cache);
  await request(base, 'GET', '/health/ready', 200, 'ready');
  await request(base, 'GET', '/api/v1/orders', 401, 'missing-token', undefined, null);
  await request(base, 'GET', '/api/v1/orders', 401, 'invalid-token', undefined, 'invalid');
  const expired = token({ sub: publicId, iss: 'integration', aud: 'integration', exp: Math.floor(Date.now()/1000)-60 });
  await request(base, 'GET', '/api/v1/orders', 401, 'expired-token', undefined, expired);
  const noExpiry = token({ sub: publicId, iss: 'integration', aud: 'integration' });
  await request(base, 'GET', '/api/v1/orders', 401, 'missing-expiry', undefined, noExpiry);
  const login = await request(base, 'POST', '/api/v1/auth/login', 200, 'login', { email: 'integration@example.test', password }, null);
  bearer = login.accessToken;
  const [header, payload, signature] = bearer.split('.');
  assert.equal(createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url'), signature);
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(claims.sub, publicId);
  assert.equal(claims.iss, 'integration');
  assert.equal(claims.aud, 'integration');
  const empty = await request(base, 'GET', '/api/v1/orders', 200, 'empty-list');
  assert.equal(empty.meta.total, 0);
  const input = { number: 'INTEGRATION-001', expectedDeliveryDate: '2027-01-15',
    customer: { name: 'Cliente fictício', document: 'DOCUMENTO-FICTICIO' },
    deliveryAddress: { street: 'Rua fictícia', number: '1', district: 'Centro', city: 'Cidade fictícia', state: 'SP', postalCode: '00000-000', country: 'BR' },
    items: [{ description: 'Item fictício', price: '12.34' }] };
  await request(base, 'POST', '/api/v1/orders', 400, 'missing-customer', { ...input, customer: undefined });
  await request(base, 'POST', '/api/v1/orders', 400, 'missing-address', { ...input, deliveryAddress: undefined });
  const order = await request(base, 'POST', '/api/v1/orders', 201, 'create', input);
  assert.match(order.id, /^[a-f0-9-]{36}$/i);
  assert.equal(order.items[0].price, '12.34');
  await request(base, 'POST', '/api/v1/orders', 409, 'duplicate-number', input);
  await request(base, 'POST', '/api/v1/orders', 400, 'invalid-items', { ...input, number: 'INVALID', items: [{ description: 'x', price: '-1' }] });
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM orders WHERE number='INVALID'")).rows[0].count, 0);
  await request(base, 'GET', '/api/v1/orders/1', 400, 'integer-id');
  await request(base, 'GET', `/api/v1/orders/${randomUUID()}`, 404, 'missing-order');
  await request(base, 'GET', `/api/v1/orders/${order.id}`, 200, 'detail');
  const query = '/api/v1/orders?number=INTEGRATION-001&status=PENDING&startDate=2027-01-15&endDate=2027-01-15&page=1&pageSize=1';
  const filtered = await request(base, 'GET', query, 200, 'combined-inclusive-filters');
  assert.equal(filtered.meta.total, 1);
  assert.equal(filtered.data[0].id, order.id);
  await request(base, 'GET', query, 200, 'repeat-cached-list');
  await request(base, 'GET', '/api/v1/orders?startDate=2027-02-01&endDate=2027-01-01', 400, 'inverted-period');
  await request(base, 'GET', '/api/v1/orders?pageSize=101', 400, 'invalid-pagination');
  await request(base, 'PATCH', `/api/v1/orders/${order.id}`, 400, 'null-customer', { customer: null });
  await request(base, 'PATCH', `/api/v1/orders/${order.id}`, 400, 'array-address', { deliveryAddress: [] });
  const updated = await request(second, 'PATCH', `/api/v1/orders/${order.id}`, 200, 'update-second-instance', { status: 'IN_TRANSIT' });
  assert.equal(updated.status, 'IN_TRANSIT');
  assert.equal((await request(base, 'GET', query, 200, 'cross-instance-invalidation')).meta.total, 0);
  await request(base, 'PATCH', `/api/v1/orders/${order.id}`, 409, 'invalid-transition', { status: 'PENDING' });
  await request(second, 'PATCH', `/api/v1/orders/${order.id}`, 200, 'terminal-transition', { status: 'DELIVERED' });
  await request(second, 'PATCH', `/api/v1/orders/${order.id}`, 200, 'terminal-idempotence', { status: 'DELIVERED' });
  await request(second, 'DELETE', `/api/v1/orders/${order.id}`, 204, 'soft-delete');
  await request(base, 'GET', `/api/v1/orders/${order.id}`, 404, 'deleted-detail');
  assert.equal((await request(base, 'GET', '/api/v1/orders', 200, 'deleted-list')).meta.total, 0);
  const persisted = (await pool.query('SELECT id,deleted_at FROM orders WHERE public_id=$1', [order.id])).rows[0];
  assert.equal(typeof persisted.id, 'number');
  assert(persisted.deleted_at);
  for (let attempt=0; attempt<5; attempt+=1) await request(base, 'POST', '/api/v1/auth/login', 401, `failed-login-${attempt}`, { email: 'blocked@example.test', password: 'invalid-password' }, null);
  await request(second, 'POST', '/api/v1/auth/login', 429, 'distributed-rate-limit', { email: 'blocked@example.test', password: 'invalid-password' }, null);
  // Real infrastructure fault: break only this run's namespace, then restore it.
  await pool.query('ALTER TABLE orders RENAME TO orders_temporarily_unavailable');
  try {
    await request(base, 'GET', `/api/v1/orders/${randomUUID()}`, 500, 'database-unavailable');
  } finally { await pool.query('ALTER TABLE orders_temporarily_unavailable RENAME TO orders'); }
  complete = true;
} catch (error) {
  process.stderr.write(`Integração HTTP falhou: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  for (const child of children) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolveExit => child.once('exit', resolveExit)), delay(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await pool?.end();
  try { execute('docker', ['rm', '--force', '--volumes', container]); } catch { /* only own container */ }
  try {
    const records = (await readFile(join(scratch, 'server.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
    const byId = new Map(records.map(record => [record.requestId, record]));
    for (const sample of samples) {
      const { requestId, ...publicSample } = sample;
      const server = byId.get(requestId);
      assert(server, 'Métrica do servidor ausente');
      assert.equal(server.route, sample.route);
      assert.equal(server.statusCode, sample.statusCode);
      assert.equal(server.outcome, 'completed');
      assert.equal(server.requestBodyBytes, sample.requestBodyBytes);
      publicSample.serverDurationMs = server.serverDurationMs;
      publicSample.cacheOutcome = server.cacheOutcome;
      sample.public = publicSample;
    }
  } catch (error) {
    complete = false;
    process.exitCode = 1;
    process.stderr.write(`Coleta HTTP incompleta: ${error.message}\n`);
  }
  await writeFile(join(metricsDirectory, 'samples.jsonl'), samples.filter(sample => sample.public).map(sample => JSON.stringify(sample.public)).join('\n')+'\n');
  await writeFile(join(metricsDirectory, 'manifest.json'), JSON.stringify({ runId,
    commit: execute('git', ['rev-parse', 'HEAD']).trim(), timestamp: new Date().toISOString(),
    runtime: process.version, complete, profile: 'full', compression: 'off' }, null, 2)+'\n');
  await rm(scratch, { recursive: true, force: true });
}
if (complete) process.stdout.write(`Integração HTTP aprovada: ${samples.length} requisições medidas.\n`);
