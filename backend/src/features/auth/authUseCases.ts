import type { AuthRepositoryInterface } from './authRepositoryInterface.js';
import type { PasswordHasherInterface } from './passwordHasherInterface.js';
import type { TokenIssuerInterface } from './tokenIssuerInterface.js';
import type { LoginCredentials, LoginOutcome } from './authTypes.js';

export class AuthUseCases {
  constructor(
    private readonly repository: AuthRepositoryInterface,
    private readonly passwordHasher: PasswordHasherInterface,
    private readonly tokenIssuer: TokenIssuerInterface,
    private readonly expiresIn: number,
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
