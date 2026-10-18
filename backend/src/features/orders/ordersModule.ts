import type { OrdersRepositoryInterface } from './ordersRepositoryInterface.js';
import type { CacheInterface } from '../../shared/cache/cacheTypes.js';
import { DisabledCacheAdapter } from '../../shared/cache/disabledCacheAdapter.js';
import { APP_CONFIG } from '../../shared/config/appConfig.js';
import type { AppConfig } from '../../shared/config/appConfig.js';
import { recordHttpCacheOutcome } from '../../shared/http/httpMetricsMiddleware.js';
import { Module } from '@nestjs/common';
import { CACHE_INTERFACE } from '../../shared/cache/cacheTypes.js';
import { FileCacheAdapter } from '../../shared/cache/fileCacheAdapter.js';
import { AuthModule } from '../auth/authModule.js';
import { ORDERS_REPOSITORY } from './ordersTypes.js';
import { OrdersController } from './ordersController.js';
import { OrdersRepository } from './ordersRepository.js';
import { OrdersUseCases } from './ordersUseCases.js';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [
    {
      provide: OrdersUseCases,
      inject: [ORDERS_REPOSITORY, CACHE_INTERFACE],
      useFactory: (repository: OrdersRepositoryInterface, cache: CacheInterface): OrdersUseCases =>
        new OrdersUseCases(repository, cache, recordHttpCacheOutcome),
    },
    FileCacheAdapter,
    {
      provide: CACHE_INTERFACE,
      inject: [APP_CONFIG, FileCacheAdapter],
      useFactory: (config: AppConfig, file: FileCacheAdapter): CacheInterface =>
        ('cacheDriver' in config && config.cacheDriver === 'disabled') ? new DisabledCacheAdapter() : file,
    },
    OrdersRepository,
    { provide: ORDERS_REPOSITORY, useExisting: OrdersRepository },
  ],
})
export class OrdersModule {}
