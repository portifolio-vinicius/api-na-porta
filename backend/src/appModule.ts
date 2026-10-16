import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_CONFIG } from './shared/config/appConfig.js';
import type { AppConfig } from './shared/config/appConfig.js';
import { HealthController } from './features/health/healthController.js';
import { PrismaService } from './shared/database/prismaService.js';

@Module({
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}

export function createAppModule(config: AppConfig): DynamicModule {
  return {
    module: AppModule,
    providers: [{ provide: APP_CONFIG, useValue: config }],
  };
}
