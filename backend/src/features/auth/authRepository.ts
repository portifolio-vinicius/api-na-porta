import { createHmac, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../shared/config/appConfig.js';
import type { AppConfig } from '../../shared/config/appConfig.js';
import { PrismaService } from '../../shared/database/prismaService.js';
import type { AuthRepositoryInterface } from './authRepositoryInterface.js';
import type { AuthUser } from './authTypes.js';

interface LoginAttemptRow {
  readonly blocked: boolean;
}

@Injectable()
export class AuthRepository implements AuthRepositoryInterface {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async findByEmail(email: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { publicId: true, email: true, passwordHash: true },
    });
    return user;
  }

  async isBlocked(email: string, clientAddress: string): Promise<boolean> {
    await this.pruneOldAttemptsOccasionally();
    const key = this.createAttemptKey(email, clientAddress);
    const rows = await this.prisma.$queryRaw<LoginAttemptRow[]>`
      SELECT (blocked_until > now()) AS blocked
      FROM public.login_attempts
      WHERE key = ${key}
    `;
    return rows[0]?.blocked ?? false;
  }

  async recordFailure(email: string, clientAddress: string): Promise<void> {
    const key = this.createAttemptKey(email, clientAddress);
    await this.prisma.$executeRaw`
      INSERT INTO public.login_attempts AS current_attempts
        (key, window_started_at, attempts, blocked_until, updated_at)
      VALUES (${key}, now(), 1, NULL, now())
      ON CONFLICT (key) DO UPDATE SET
        window_started_at = CASE
          WHEN current_attempts.window_started_at <= now() - interval '15 minutes' THEN now()
          ELSE current_attempts.window_started_at
        END,
        attempts = CASE
          WHEN current_attempts.window_started_at <= now() - interval '15 minutes' THEN 1
          ELSE LEAST(current_attempts.attempts + 1, 5)
        END,
        blocked_until = CASE
          WHEN current_attempts.blocked_until > now() THEN current_attempts.blocked_until
          WHEN current_attempts.window_started_at <= now() - interval '15 minutes' THEN NULL
          WHEN current_attempts.attempts >= 4 THEN now() + interval '15 minutes'
          ELSE NULL
        END,
        updated_at = now()
    `;
  }

  async clearFailures(email: string, clientAddress: string): Promise<void> {
    const key = this.createAttemptKey(email, clientAddress);
    await this.prisma.loginAttempt.updateMany({
      where: { key },
      data: { attempts: 0, blockedUntil: null, windowStartedAt: new Date(), updatedAt: new Date() },
    });
  }

  private createAttemptKey(email: string, clientAddress: string): string {
    return createHmac('sha256', this.config.jwtSecret)
      .update(`${email}\u0000${clientAddress}`)
      .digest('hex');
  }

  private async pruneOldAttemptsOccasionally(): Promise<void> {
    if (randomInt(0, 1024) !== 0) {
      return;
    }
    await this.prisma.$queryRaw<Array<{ prune_login_attempts: number }>>`
      SELECT public.prune_login_attempts()
    `;
  }
}
