import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY } from './authRepositoryInterface.js';
import type { AuthRepositoryInterface } from './authRepositoryInterface.js';
import { PASSWORD_HASHER } from './passwordHasherInterface.js';
import type { PasswordHasherInterface } from './passwordHasherInterface.js';
import { TOKEN_ISSUER } from './tokenIssuerInterface.js';
import type { TokenIssuerInterface } from './tokenIssuerInterface.js';
import type { LoginCredentials, LoginOutcome } from './authTypes.js';

@Injectable()
export class AuthUseCases {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepositoryInterface,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasherInterface,
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuerInterface,
    @Inject('JWT_TTL_SECONDS') private readonly expiresIn: number,
  ) {}

  async login(credentials: LoginCredentials, clientAddress: string): Promise<LoginOutcome> {
    const email = credentials.email.trim().toLowerCase();
    if (await this.repository.isBlocked(email, clientAddress)) {
      return { kind: 'rateLimited' };
    }

    const user = await this.repository.findByEmail(email);
    const validPassword = user
      ? await this.passwordHasher.verify(user.passwordHash, credentials.password)
      : await this.passwordHasher.hash(credentials.password).then(() => false);

    if (!user || !validPassword) {
      await this.repository.recordFailure(email, clientAddress);
      return { kind: 'invalidCredentials' };
    }

    await this.repository.clearFailures(email, clientAddress);
    const accessToken = await this.tokenIssuer.issue(user.publicId);
    return { kind: 'authenticated', accessToken, expiresIn: this.expiresIn };
  }
}
