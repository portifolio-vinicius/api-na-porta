import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AUTH_REPOSITORY } from './authRepositoryInterface.js';
import { AuthRepository } from './authRepository.js';
import { AuthController } from './authController.js';
import { AuthUseCases } from './authUseCases.js';
import { Argon2PasswordHasher } from './argon2PasswordHasher.js';
import { JwtAuthGuard } from './jwtAuthGuard.js';
import { PASSWORD_HASHER } from './passwordHasherInterface.js';
import { JwtTokenIssuer } from './jwtTokenIssuer.js';
import { TOKEN_ISSUER } from './tokenIssuerInterface.js';
import { APP_CONFIG } from '../../shared/config/appConfig.js';
import type { AppConfig } from '../../shared/config/appConfig.js';

@Module({
  controllers: [AuthController],
  providers: [
    JwtService,
    AuthUseCases,
    AuthRepository,
    JwtAuthGuard,
    { provide: AUTH_REPOSITORY, useExisting: AuthRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
    {
      provide: 'JWT_TTL_SECONDS',
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): number => config.jwtTtlSeconds,
    },
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
