import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prismaService.js';

interface ReadinessResponse {
  readonly status: 'ready' | 'unavailable';
}

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async checkReadiness(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
