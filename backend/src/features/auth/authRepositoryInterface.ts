import type { AuthUser } from './authTypes.js';

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface AuthRepositoryInterface {
  findByEmail(email: string): Promise<AuthUser | null>;
  isBlocked(email: string, clientAddress: string): Promise<boolean>;
  recordFailure(email: string, clientAddress: string): Promise<void>;
  clearFailures(email: string, clientAddress: string): Promise<void>;
}
