import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_CONFIG } from '../config/appConfig.js';
import type { AppConfig } from '../config/appConfig.js';
import { PrismaService } from './prismaService.js';

@Global()
@Module({})
export class DatabaseModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        PrismaService,
      ],
      exports: [APP_CONFIG, PrismaService],
    };
  }
}
