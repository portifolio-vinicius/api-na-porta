export const APP_CONFIG = Symbol('APP_CONFIG');

export interface AppConfig {
  readonly apiPort: number;
  readonly databaseUrl: string;
}

export function loadAppConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const portValue = environment.API_PORT ?? '3000';
  const apiPort = Number(portValue);
  const databaseUrl = environment.DATABASE_URL;

  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error('Configuração inválida: API_PORT deve ser uma porta entre 1 e 65535.');
  }

  if (!databaseUrl) {
    throw new Error('Configuração inválida: DATABASE_URL é obrigatória.');
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

  return { apiPort, databaseUrl };
}
