import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { cpus, totalmem, platform, arch } from 'node:os';
import { Agent, request as httpRequest } from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import * as argon2 from 'argon2';

const root = resolve(import.meta.dirname, '../../..');
const run = promisify(execFile);
function integer(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  assert(Number.isInteger(value) && value >= min && value <= max, `${name} fora de ${min}..${max}`);
  return value;
}
const config = {
  orders: integer('LOAD_ORDERS', 100000, 100, 1000000),
  seconds: integer('LOAD_SECONDS', 15, 1, 120),
  warmupSeconds: integer('LOAD_WARMUP_SECONDS', 3, 0, 30),
  instances: integer('LOAD_INSTANCES', 2, 1, 4),
  maxRequests: integer('LOAD_MAX_REQUESTS', 250000, 100, 1000000),
  cache: process.env.LOAD_CACHE || 'file',
  stages: (process.env.LOAD_STAGES || '1,10,25,50,100').split(',').map(Number),
};
assert(['file', 'disabled'].includes(config.cache), 'LOAD_CACHE inválido');
assert(config.stages.length <= 10 && config.stages.length > 0 && config.stages.every(n => Number.isInteger(n) && n > 0 && n <= 200), 'LOAD_STAGES exige até dez valores entre 1 e 200');
const runId = randomUUID();
const suffix = randomBytes(6).toString('hex');
const database = `naporta_test_volume_${suffix}`;
const dbContainer = `naporta-volume-db-${suffix}`;
const volume = `naporta-volume-data-${suffix}`;
const apiNames = Array.from({ length: config.instances }, (_, i) => `naporta-volume-api-${suffix}-${i}`);
const network = `naporta-volume-${suffix}`;
const imageTag = `naporta-volume:${suffix}`;
const output = resolve(root, process.env.LOAD_OUTPUT || `artifacts/volume/${suffix}`);
assert(output.startsWith(join(root, 'artifacts/volume/')), 'LOAD_OUTPUT deve ficar em artifacts/volume/<execucao>');
await mkdir(dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const secret = randomBytes(48).toString('hex');
const dbPassword = randomBytes(32).toString('hex');
const appPassword = randomBytes(32).toString('hex');
const loginPassword = randomBytes(18).toString('hex');
const postgresImage = (await readFile(join(root, 'config/postgres-image.txt'), 'utf8')).trim();
const cancellation = new AbortController();
let interrupted = false;
let cleaning = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; cancellation.abort(); });
const command = (cmd, args, options = {}) => run(cmd, args, { cwd: root, signal: cleaning ? undefined : cancellation.signal, timeout: 240000, maxBuffer: 8 * 1024 * 1024, ...options });
const clients = [];
const serverSamples = new Map();
const startedIds = new Set();
const samples = [];
const phases = [];
const resources = [];
const created = { image: false, network: false, volume: false, db: false, apis: new Set() };
const logReaders = [];
let pool;
let references = [];
let bearer;
let sequence = 0;
let reachedLimit = false;
let sampler;
let sampling = false;
let setup;
let seedAudit;
let finalAudit;
let failure = null;
let setupPhase = 'build';
let cleanupOk = true;
const agent = new Agent({ keepAlive: true, maxSockets: Math.max(...config.stages), maxFreeSockets: Math.max(...config.stages) });
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function waitFor(check, description, seconds = 90) {
  const deadline = performance.now() + seconds * 1000;
  while (performance.now() < deadline) {
    try { if (await check()) return; } catch { /* bounded readiness retries */ }
    await delay(250);
  }
  throw new Error(description);
}
function orderShape(order) {
  assert(uuidPattern.test(order.id), 'UUID público inválido');
  assert(!('publicId' in order) && !('order_id' in order), 'Identificador interno exposto');
  assert(order.items.length > 0 && order.items.every(item => !('id' in item) && !('orderId' in item)), 'Item inválido ou ID interno exposto');
}
function wire(base, method, path, body, authenticated = true, requestId = randomUUID()) {
  const encoded = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  const began = performance.now();
  return new Promise(resolveRequest => {
    let done = false;
    let timer;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolveRequest({ ...result, durationMs: performance.now() - began, requestBodyBytes: encoded?.length || 0 });
    };
    const req = httpRequest(new URL(path, base), { method, agent, headers: {
      'X-Request-ID': requestId,
      ...(authenticated ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(encoded ? { 'Content-Type': 'application/json', 'Content-Length': encoded.length } : {}),
    } }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024) {
          finish({ status: null, error: 'response-limit', responseBodyBytes: bytes });
          req.destroy();
        } else chunks.push(chunk);
      });
      response.on('error', () => finish({ status: null, error: 'transport', responseBodyBytes: bytes }));
      response.on('end', () => {
        try {
          finish({ status: response.statusCode, body: bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined, responseBodyBytes: bytes });
        } catch { finish({ status: response.statusCode, error: 'invalid-json', responseBodyBytes: bytes }); }
      });
    });
    req.on('error', () => finish({ status: null, error: 'transport', responseBodyBytes: 0 }));
    timer = setTimeout(() => {
      finish({ status: null, error: 'timeout', responseBodyBytes: 0 });
      req.destroy();
    }, 15000);
    req.end(encoded);
  });
}
function listenLogs(name) {
  const child = spawn('docker', ['logs', '--follow', name], { stdio: ['ignore', 'pipe', 'pipe'] });
  let rest = '';
  child.stdout.on('data', data => {
    rest += data.toString('utf8');
    const lines = rest.split('\n');
    rest = lines.pop();
    if (rest.length > 65536) rest = '';
    for (const line of lines) {
      try {
        const value = JSON.parse(line);
        if (value.event === 'http_request' && startedIds.has(value.requestId)) serverSamples.set(value.requestId, value);
      } catch { /* Nest startup lines are not measurements */ }
    }
  });
  child.stderr.resume();
  logReaders.push(child);
}
async function captureResources() {
  if (sampling) return;
  sampling = true;
  try {
    const result = await command('docker', ['stats', '--no-stream', '--format', '{{json .}}', dbContainer, ...apiNames], { timeout: 10000 });
    resources.push({ timestamp: new Date().toISOString(), containers: result.stdout.trim().split('\n').filter(Boolean).map(line => {
      const r = JSON.parse(line);
      return { role: r.Name === dbContainer ? 'database' : 'api', cpu: r.CPUPerc, memory: r.MemUsage, memoryPercent: r.MemPerc, blockIO: r.BlockIO, networkIO: r.NetIO, pids: r.PIDs };
    }) });
  } catch { resources.push({ timestamp: new Date().toISOString(), unavailable: true }); }
  finally { sampling = false; }
}
async function phase(concurrency, warmup) {
  const label = `${warmup ? 'warmup' : 'measured'}-${concurrency}`;
  const seconds = warmup ? config.warmupSeconds : config.seconds;
  if (seconds === 0) return;
  console.log(`Etapa ${label}: ${seconds}s, ${concurrency} clientes`);
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const cpuStart = process.cpuUsage();
  const began = performance.now();
  const first = samples.length;
  const deadline = began + seconds * 1000;
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    let iteration = 0;
    let lastCreated;
    while (!interrupted && performance.now() < deadline) {
      if (startedIds.size >= config.maxRequests) { reachedLimit = true; break; }
      const n = sequence++;
      const reference = references[(n * 7919 + worker * 31) % references.length];
      const slot = iteration++ % 10;
      let scenario = 'detail';
      let method = 'GET';
      let path = `/api/v1/orders/${reference.public_id}`;
      let body;
      let expected = 200;
      if (slot === 4) { scenario = 'hot-list'; path = '/api/v1/orders?status=PENDING&page=1&pageSize=20'; }
      if (slot === 5) { scenario = 'filtered-list'; path = `/api/v1/orders?status=IN_TRANSIT&page=${1 + n % 20}&pageSize=20`; }
      if (slot === 6) { scenario = 'number-filter'; path = `/api/v1/orders?number=${reference.number}`; }
      if (slot === 7) {
        scenario = 'create'; method = 'POST'; path = '/api/v1/orders'; expected = 201;
        body = { number: `SYN-HTTP-${suffix}-${n}`, expectedDeliveryDate: '2027-02-15',
          customer: { name: `Cliente SYN Fictício ${n % 10000}`, document: `SYN-DOC-${n % 10000}` },
          deliveryAddress: { street: `Rua SYN Simulada ${n % 500}`, number: String(1 + n % 900), district: 'Bairro SYN Simulado', city: 'São Paulo', state: 'SP', postalCode: '00000000', country: 'BR' },
          items: [{ description: 'Produto SYN fictício', price: `${10 + n % 990}.90` }, { description: 'Embalagem SYN fictícia', price: '2.50' }] };
      }
      if (slot === 8 && lastCreated) { scenario = 'update'; method = 'PATCH'; path = `/api/v1/orders/${lastCreated}`; body = { expectedDeliveryDate: '2027-02-16' }; }
      if (slot === 9 && lastCreated) { scenario = 'delete'; method = 'DELETE'; path = `/api/v1/orders/${lastCreated}`; expected = 204; }
      const requestId = randomUUID();
      startedIds.add(requestId);
      const base = clients[n % clients.length];
      const result = await wire(base, method, path, body, true, requestId);
      let error = result.error || (result.status !== expected ? 'unexpected-status' : null);
      if (!error) {
        try {
          if (['create', 'update', 'detail'].includes(scenario)) {
            orderShape(result.body);
            if (scenario === 'detail') assert.equal(result.body.id, reference.public_id);
            if (scenario === 'create') lastCreated = result.body.id;
          } else if (scenario === 'delete') {
            assert.equal(result.responseBodyBytes, 0);
            lastCreated = undefined;
          } else {
            assert(Array.isArray(result.body.data) && Number.isInteger(result.body.meta.total));
            result.body.data.forEach(orderShape);
            if (scenario === 'number-filter') {
              assert.equal(result.body.meta.total, 1);
              assert.equal(result.body.data[0].id, reference.public_id);
            }
          }
        } catch { error = 'invalid-response'; }
      }
      samples.push({ requestId, phase: label, warmup, concurrency, scenario, method,
        route: path.startsWith('/api/v1/orders/') ? '/api/v1/orders/:id' : '/api/v1/orders',
        status: result.status, expectedStatus: expected, error,
        clientDurationMs: result.durationMs, requestBodyBytes: result.requestBodyBytes, responseBodyBytes: result.responseBodyBytes });
    }
  }));
  const elapsedMs = performance.now() - began;
  const cpu = process.cpuUsage(cpuStart);
  histogram.disable();
  phases.push({ phase: label, warmup, concurrency, issuingSeconds: seconds, elapsedSeconds: elapsedMs / 1000,
    requests: samples.length - first, generatorCpuPercentOfOneCore: (cpu.user + cpu.system) / (elapsedMs * 10),
    generatorEventLoopP99Ms: histogram.percentile(99) / 1e6 });
}
function distribution(values) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const percentile = p => values[Math.ceil(values.length * p) - 1];
  return { count: values.length, min: values[0], p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: values.at(-1) };
}
try {
  console.log(`Volume: ${config.orders} pedidos; ${config.instances} instâncias; dados inteiramente fictícios.`);
  await command('docker', ['info']);
  const buildStart = performance.now();
  await command('docker', ['build', '-t', imageTag, '-f', 'backend/Dockerfile', '.'], { timeout: 600000 });
  created.image = true;
  await command('docker', ['network', 'create', network]); created.network = true;
  await command('docker', ['volume', 'create', volume]); created.volume = true;
  setupPhase = 'database-start';
  await command('docker', ['run', '--detach', '--name', dbContainer, '--network', network, '--network-alias', 'db',
    '--cpus', '2', '--memory', '1024m', '--publish', '127.0.0.1::5432', '--mount', `type=volume,src=${volume},dst=/var/lib/postgresql`,
    '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2', postgresImage],
    { env: { ...process.env, POSTGRES_PASSWORD: dbPassword, POSTGRES_DB: database } });
  created.db = true;
  const mapped = (await command('docker', ['port', dbContainer, '5432/tcp'])).stdout.trim();
  pool = new pg.Pool({ connectionString: `postgresql://postgres:${dbPassword}@${mapped}/${database}`, max: 2, connectionTimeoutMillis: 2000, statement_timeout: 180000 });
  await waitFor(async () => { await pool.query('SELECT 1'); return true; }, 'Banco não ficou pronto');
  setupPhase = 'migrations';
  await command('make', ['migrate', 'ENV=test'], { env: { ...process.env, ENV: 'test', DB_CONTAINER: dbContainer,
    PGDATABASE: database, PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: 'postgres', PGPASSWORD: dbPassword, MIGRATIONS_DIR: join(root, 'database/prisma/migrations') } });
  setupPhase = 'roles';
  const role = await pool.query("SELECT format('CREATE ROLE naporta_app LOGIN PASSWORD %L', $1::text)", [appPassword]);
  await pool.query(role.rows[0].format);
  await pool.query('CREATE ROLE naporta_reader NOLOGIN');
  // execFile does not accept stdin; send the versioned grants over an explicit pipe.
  await new Promise((resolveGrants, rejectGrants) => {
    const child = spawn('docker', ['exec', '-i', '--env', 'PGPASSWORD', dbContainer, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', database, '-Xq', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
      { env: { ...process.env, PGPASSWORD: dbPassword }, stdio: ['pipe', 'ignore', 'pipe'] });
    child.stderr.resume();
    child.on('error', rejectGrants);
    child.on('exit', code => code === 0 ? resolveGrants() : rejectGrants(new Error('Grants reais falharam')));
    readFile(join(root, 'database/security/grants.sql')).then(data => child.stdin.end(data)).catch(rejectGrants);
  });
  setupPhase = 'synthetic-seed';
  const seedStart = performance.now();
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    setup = (await connection.query(await readFile(join(root, 'database/seeds/volume.sql'), 'utf8'), [config.orders])).rows[0];
    await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
  const seedSeconds = (performance.now() - seedStart) / 1000;
  assert.equal(Number(setup.orders), config.orders);
  await pool.query('ANALYZE');
  seedAudit = (await pool.query(`SELECT count(*)::int AS orders, count(DISTINCT public_id)::int AS unique_public_ids,
    bool_and(uuid_extract_version(public_id)=4) AS uuid_v4, pg_typeof(min(id))::text AS internal_type,
    count(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted,
    (SELECT count(*)::int FROM order_items) AS items,
    (SELECT count(*)::int FROM orders o WHERE NOT EXISTS(SELECT 1 FROM order_customers c WHERE c.order_id=o.id) OR NOT EXISTS(SELECT 1 FROM order_addresses a WHERE a.order_id=o.id) OR NOT EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id)) AS missing_relations FROM orders`)).rows[0];
  assert(seedAudit.uuid_v4 && seedAudit.unique_public_ids === config.orders && seedAudit.internal_type === 'integer' && seedAudit.missing_relations === 0);
  references = (await pool.query('SELECT public_id,number FROM orders WHERE deleted_at IS NULL')).rows;
  const userId = randomUUID();
  await pool.query('INSERT INTO users(public_id,email,password_hash) VALUES($1,$2,$3)', [userId, 'volume@example.test', await argon2.hash(loginPassword, { type: argon2.argon2id })]);
  setupPhase = 'api-start';
  for (const name of apiNames) {
    await command('docker', ['run', '--detach', '--name', name, '--network', network, '--cpus', '1', '--memory', '512m',
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:rw,size=96m,mode=1777',
      '--publish', '127.0.0.1::3000', '--log-opt', 'max-size=10m', '--log-opt', 'max-file=2',
      ...['DATABASE_URL', 'JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_TTL_SECONDS', 'CACHE_DRIVER', 'CACHE_DIRECTORY', 'API_PORT', 'TRUST_PROXY', 'CORS_ORIGINS'].flatMap(k => ['--env', k]), imageTag],
      { env: { ...process.env, DATABASE_URL: `postgresql://naporta_app:${appPassword}@db:5432/${database}`, JWT_SECRET: secret,
        JWT_ISSUER: 'volume', JWT_AUDIENCE: 'volume', JWT_TTL_SECONDS: '3600', CACHE_DRIVER: config.cache,
        CACHE_DIRECTORY: '/tmp/naporta-cache', API_PORT: '3000', TRUST_PROXY: 'false', CORS_ORIGINS: '' } });
    created.apis.add(name);
    const port = (await command('docker', ['port', name, '3000/tcp'])).stdout.trim();
    const base = `http://${port}`;
    clients.push(base);
    listenLogs(name);
    await waitFor(async () => (await wire(base, 'GET', '/health/ready', undefined, false)).status === 200, 'API não ficou pronta');
  }
  setupPhase = 'login';
  const login = await wire(clients[0], 'POST', '/api/v1/auth/login', { email: 'volume@example.test', password: loginPassword }, false);
  assert.equal(login.status, 200, 'Login real falhou');
  bearer = login.body.accessToken;
  assert.equal(JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url')).sub, userId);
  setup = { ...setup, seedSeconds, preparationSeconds: (performance.now() - buildStart) / 1000, seedAudit };
  console.log(`Base pronta: ${seedAudit.orders} pedidos, ${seedAudit.items} itens, UUIDs/FKs verificados.`);
  await captureResources();
  sampler = setInterval(() => { void captureResources(); }, 5000);
  setupPhase = 'workload';
  for (const concurrency of config.stages) {
    await phase(concurrency, true);
    await phase(concurrency, false);
    if (reachedLimit || interrupted) break;
  }
  clearInterval(sampler);
  await captureResources();
  setupPhase = 'final-audit';
  finalAudit = (await pool.query(`SELECT count(*)::int AS orders, count(DISTINCT public_id)::int AS unique_public_ids,
    bool_and(uuid_extract_version(public_id)=4) AS uuid_v4,
    count(*) FILTER(WHERE number LIKE 'SYN-HTTP-%')::int AS http_created,
    count(*) FILTER(WHERE number LIKE 'SYN-HTTP-%' AND deleted_at IS NOT NULL)::int AS http_deleted,
    (SELECT count(*)::int FROM order_items i LEFT JOIN orders o ON o.id=i.order_id WHERE o.id IS NULL) AS orphan_items FROM orders`)).rows[0];
  assert(finalAudit.orders === finalAudit.unique_public_ids && finalAudit.uuid_v4 && finalAudit.orphan_items === 0);
} catch (error) {
  // Do not print DB/HTTP errors: they may include connection strings or fixture data.
  failure = error instanceof assert.AssertionError ? 'assertion-failed' : error instanceof Error ? error.name : 'setup-failed';
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,24}$/.test(error.code) ? error.code : null;
  failure = `${setupPhase}:${failure}${code ? ':' + code : ''}`;
  console.error(`Execução interrompida: ${failure}`);
} finally {
  cleaning = true;
  clearInterval(sampler);
  agent.destroy();
  for (const name of created.apis) {
    try { await command('docker', ['stop', '--time', '20', name], { timeout: 30000 }); } catch { cleanupOk = false; }
  }
  await delay(500);
  for (const reader of logReaders) reader.kill('SIGTERM');
  await pool?.end().catch(() => { cleanupOk = false; });
  for (const name of created.apis) {
    try { await command('docker', ['rm', '--force', name]); } catch { cleanupOk = false; }
  }
  if (created.db) { try { await command('docker', ['rm', '--force', dbContainer]); } catch { cleanupOk = false; } }
  if (created.volume) { try { await command('docker', ['volume', 'rm', volume]); } catch { cleanupOk = false; } }
  if (created.network) { try { await command('docker', ['network', 'rm', network]); } catch { cleanupOk = false; } }
  if (created.image) { try { await command('docker', ['image', 'rm', imageTag]); } catch { cleanupOk = false; } }
}
let missingServerSamples = 0;
for (const sample of samples) {
  const server = serverSamples.get(sample.requestId);
  sample.serverDurationMs = server?.durationMs ?? null;
  if (!server) missingServerSamples += 1;
  delete sample.requestId;
}
const summary = phases.map(p => {
  const rows = samples.filter(s => s.phase === p.phase);
  const errors = rows.filter(s => s.error).length;
  return { ...p, errors, errorRate: rows.length ? errors / rows.length : null,
    achievedRequestsPerSecond: rows.length / p.elapsedSeconds,
    statusCounts: rows.reduce((a, r) => { const k = r.status ?? r.error; a[k] = (a[k] || 0) + 1; return a; }, {}),
    clientLatencyMs: distribution(rows.map(s => s.clientDurationMs)),
    serverLatencyMs: distribution(rows.filter(s => s.serverDurationMs !== null).map(s => s.serverDurationMs)),
    generatorMayLimitResults: p.generatorCpuPercentOfOneCore >= 85 || p.generatorEventLoopP99Ms > 50,
    scenarios: [...new Set(rows.map(s => s.scenario))].map(scenario => {
      const selected = rows.filter(s => s.scenario === scenario);
      return { scenario, requests: selected.length, errors: selected.filter(s => s.error).length,
        clientLatencyMs: distribution(selected.map(s => s.clientDurationMs)) };
    }) };
});
const errors = samples.filter(s => s.error).length;
const complete = !interrupted && !failure && !reachedLimit && missingServerSamples === 0 && phases.length === config.stages.length * (config.warmupSeconds ? 2 : 1);
const passed = complete && errors === 0 && cleanupOk;
const report = { runId, timestamp: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  complete, passed, failure, interrupted, cleanupOk, reachedLimit, errors, missingServerSamples, config, setup, finalAudit,
  environment: { runtime: process.version, platform: platform(), arch: arch(), hostCpuCount: cpus().length, hostMemoryBytes: totalmem(),
    postgresImage, apiImage: imageTag, apiCpuLimit: 1, apiMemoryMiB: 512, databaseCpuLimit: 2, databaseMemoryMiB: 1024,
    poolConnectionsPerInstance: 10, compression: 'off', topology: 'client round-robin -> API containers -> single primary PostgreSQL; no Nginx, standby or TLS',
    clientModel: 'closed-loop constant concurrency; achieved rate, no fixed arrival rate; includes in-flight drain',
    observability: 'production request logs, streamed and correlated; resource samples every5s',
    capacityClaim: 'local exploratory run; no production SLA or failover claim' }, phases: summary, resources };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(join(output, 'samples.jsonl'), samples.map(s => JSON.stringify(s)).join('\n') + '\n');
const measured = summary.filter(s => !s.warmup);
const markdown = `# Volume API — execução local\n\nCommit: ${report.commit}\n\nBase: ${setup?.seedAudit?.orders ?? 'indisponível'} pedidos; ${setup?.seedAudit?.items ?? 'indisponível'} itens fictícios. Instâncias: ${config.instances}. Resultado: ${passed ? 'aprovado' : 'reprovado/incompleto'}.\n\n| Clientes | Requisições | Req/s efetivas | Erros | p50 cliente ms | p95 cliente ms | p99 cliente ms | Gerador pode limitar |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${measured.map(p => `| ${p.concurrency} | ${p.requests} | ${p.achievedRequestsPerSecond.toFixed(2)} | ${p.errors} | ${p.clientLatencyMs?.p50.toFixed(2)} | ${p.clientLatencyMs?.p95.toFixed(2)} | ${p.clientLatencyMs?.p99.toFixed(2)} | ${p.generatorMayLimitResults ? 'sim' : 'não detectado'} |`).join('\n')}\n\nModelo fechado: concorrência constante, sem taxa de chegada fixa. Aquecimento separado no JSON. Latências incluem transporte local e leitura completa; req/s incluem a drenagem das requisições iniciadas. Percentis nearest-rank. Há detalhes por cenário, status e métricas do servidor no JSON.\n\nNão comprova capacidade produtiva, failover, balanceador, HTTPS ou leitura em réplica. Cliente e serviços compartilham a máquina; limites dos containers e sinais de saturação do gerador estão no JSON. Documentos/endereços são inteiramente fictícios. Não há corpos, tokens nem identificadores de clientes nos artefatos.\n`;
await writeFile(join(output, 'report.md'), markdown);
console.log(markdown);
console.log(`Artefatos: ${output}`);
if (!passed) process.exitCode = 1;
