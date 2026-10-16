import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../shared/database/prismaService.js';

interface ReadinessResponse {
  readonly status: 'ready' | 'unavailable';
}

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async checkReadiness(@Res() response: Response<ReadinessResponse>): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      response.status(HttpStatus.OK).json({ status: 'ready' });
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'unavailable' });
    }
  }
}
