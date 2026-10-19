import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

async function seedDemoUser(): Promise<void> {
  const environment = process.env.ENV;
  if (environment !== 'local' && environment !== 'demo') {
    throw new Error('O seed de usuário só pode rodar com ENV=local ou ENV=demo.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_USER_PASSWORD;
  if (!databaseUrl || !email || !password) {
    throw new Error('DATABASE_URL, DEMO_USER_EMAIL e DEMO_USER_PASSWORD são obrigatórios.');
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('DEMO_USER_EMAIL inválido.');
  }
  if (Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 128) {
    throw new Error('A senha de demonstração deve ter entre 12 e 128 bytes.');
  }

  const parsedUrl = new URL(databaseUrl);
  const expectedDatabase = `naporta_${environment}`;
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol) || parsedUrl.username !== 'naporta_migrator' || !new RegExp(`^/${expectedDatabase}(?:_[a-z0-9]+)*$`).test(parsedUrl.pathname)) {
    throw new Error('DATABASE_URL deve apontar para o banco de demonstração usando naporta_migrator.');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  const prisma = new PrismaClient({ adapter });
  try {
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: { publicId: randomUUID(), email, passwordHash },
    });
    process.stdout.write('Usuário fictício de demonstração preparado.\n');
  } finally {
    await prisma.$disconnect();
  }
}

void seedDemoUser().catch(() => {
  process.stderr.write('Falha no seed do usuário fictício. Verifique ambiente e configuração.\n');
  process.exitCode = 1;
});
