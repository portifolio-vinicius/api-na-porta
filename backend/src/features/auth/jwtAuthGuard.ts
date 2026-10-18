import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { APP_CONFIG } from '../../shared/config/appConfig.js';
import type { AppConfig } from '../../shared/config/appConfig.js';
import type { AuthenticatedPrincipal } from './authTypes.js';

interface JwtClaims {
  readonly sub?: unknown;
  readonly exp?: unknown;
}

type AuthenticatedRequest = Request & { user?: AuthenticatedPrincipal };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de acesso inválido');
    }

    const token = authorization.slice('Bearer '.length).trim();
    try {
      const claims = await this.jwt.verifyAsync<JwtClaims>(token, {
        secret: this.config.jwtSecret,
        algorithms: ['HS256'],
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
      });
      if (typeof claims.sub !== 'string' || !isUuid(claims.sub) || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp)) {
        throw new UnauthorizedException('Token de acesso inválido');
      }
      request.user = { publicId: claims.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido');
    }
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
