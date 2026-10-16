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
    OrdersUseCases,
    FileCacheAdapter,
    { provide: CACHE_INTERFACE, useExisting: FileCacheAdapter },
    OrdersRepository,
    { provide: ORDERS_REPOSITORY, useExisting: OrdersRepository },
  ],
})
export class OrdersModule {}
