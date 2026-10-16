import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { createAppModule } from './appModule.js';
import { loadAppConfig } from './shared/config/appConfig.js';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig(process.env);
  const app = await NestFactory.create(createAppModule(config), { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health/ready', method: RequestMethod.GET }],
  });
  app.enableShutdownHooks();
  await app.listen(config.apiPort, '0.0.0.0');
}

void bootstrap().catch(() => {
  process.stderr.write('Falha ao iniciar a API: verifique a configuração e a disponibilidade dos serviços.\n');
  process.exitCode = 1;
});
