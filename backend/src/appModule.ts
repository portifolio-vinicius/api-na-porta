import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AppConfig } from './shared/config/appConfig.js';
import { AuthModule } from './features/auth/authModule.js';
import { HealthController } from './features/health/healthController.js';
import { DatabaseModule } from './shared/database/databaseModule.js';

@Module({
  controllers: [HealthController],
})
export class AppModule {}

export function createAppModule(config: AppConfig): DynamicModule {
  return {
    module: AppModule,
    imports: [DatabaseModule.register(config), AuthModule],
  };
}
