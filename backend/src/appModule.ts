import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { AppConfig } from './shared/config/appConfig.js';
import { AuthModule } from './features/auth/authModule.js';
import { OrdersModule } from './features/orders/ordersModule.js';
import { HealthController } from './features/health/healthController.js';
import { DatabaseModule } from './shared/database/databaseModule.js';

@Module({
  controllers: [HealthController],
})
export class AppModule {}

export function createAppModule(config: AppConfig, flushMetrics: () => Promise<void> = async () => undefined): DynamicModule {
  return {
    module: AppModule,
    providers: [{ provide: 'HTTP_METRICS_LIFECYCLE', useValue: { onApplicationShutdown: flushMetrics } }],
    imports: [DatabaseModule.register(config), AuthModule, OrdersModule],
  };
}
