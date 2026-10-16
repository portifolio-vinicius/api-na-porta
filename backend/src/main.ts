import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { json } from 'express';
import { createAppModule } from './appModule.js';
import { loadAppConfig } from './shared/config/appConfig.js';
import { HttpErrorFilter } from './shared/http/httpErrorFilter.js';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig(process.env);
  const app = await NestFactory.create(createAppModule(config), { logger: ['error', 'warn'], bodyParser: false });
  app.getHttpAdapter().getInstance().set('trust proxy', config.trustProxy ? 1 : false);
  app.use(json({ limit: '1mb' }));
  if (config.corsOrigins.length > 0) {
    app.enableCors({ origin: [...config.corsOrigins], methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'] });
  }
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health/ready', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();
  await app.listen(config.apiPort, '0.0.0.0');
}

void bootstrap().catch(() => {
  process.stderr.write('Falha ao iniciar a API: verifique a configuração e a disponibilidade dos serviços.\n');
  process.exitCode = 1;
});
