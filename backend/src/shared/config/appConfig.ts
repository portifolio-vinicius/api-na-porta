export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  readonly apiPort: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly jwtTtlSeconds: number;
  readonly cacheDirectory: string;
}

export function loadAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const portValue = environment.API_PORT ?? '3000';
  const apiPort = Number(portValue);
  const databaseUrl = environment.DATABASE_URL;
  const jwtSecret = environment.JWT_SECRET;
  const jwtIssuer = environment.JWT_ISSUER;
  const jwtAudience = environment.JWT_AUDIENCE;
  const jwtTtlSeconds = Number(environment.JWT_TTL_SECONDS ?? '900');
  const cacheDirectory = environment.CACHE_DIRECTORY ?? '/tmp/naporta-cache';

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('Configuração inválida: API_PORT deve ser uma porta entre 1 e 65535.');
  }

  if (!databaseUrl) {
    throw new Error('Configuração inválida: DATABASE_URL é obrigatória.');
  }

  if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('Configuração inválida: JWT_SECRET deve possuir ao menos 32 bytes.');
  }
  if (!jwtIssuer || !jwtAudience) {
    throw new Error('Configuração inválida: JWT_ISSUER e JWT_AUDIENCE são obrigatórios.');
  }
  if (!Number.isInteger(jwtTtlSeconds) || jwtTtlSeconds < 60 || jwtTtlSeconds > 3600) {
    throw new Error('Configuração inválida: JWT_TTL_SECONDS deve ficar entre 60 e 3600.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('Configuração inválida: DATABASE_URL deve ser uma URL PostgreSQL válida.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    !parsedUrl.pathname.slice(1)
  ) {
    throw new Error('Configuração inválida: DATABASE_URL deve identificar um banco PostgreSQL.');
  }

  if (!cacheDirectory || !cacheDirectory.startsWith('/')) {
    throw new Error('Configuração inválida: CACHE_DIRECTORY deve ser um caminho absoluto.');
  }

  return { apiPort, databaseUrl, jwtSecret, jwtIssuer, jwtAudience, jwtTtlSeconds, cacheDirectory };
}
