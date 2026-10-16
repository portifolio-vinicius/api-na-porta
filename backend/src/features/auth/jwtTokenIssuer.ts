import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG } from '../../shared/config/appConfig.js';
import type { AppConfig } from '../../shared/config/appConfig.js';
import type { TokenIssuerInterface } from './tokenIssuerInterface.js';

@Injectable()
export class JwtTokenIssuer implements TokenIssuerInterface {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(publicId: string): Promise<string> {
    return this.jwt.signAsync(
      {},
      {
        secret: this.config.jwtSecret,
        subject: publicId,
        issuer: this.config.jwtIssuer,
        audience: this.config.jwtAudience,
        expiresIn: this.config.jwtTtlSeconds,
      },
    );
  }
}
