export interface AuthUser {
  readonly publicId: string;
  readonly email: string;
  readonly passwordHash: string;
}

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

export interface AuthenticatedPrincipal {
  readonly publicId: string;
}

export type LoginOutcome =
  | { readonly kind: 'authenticated'; readonly accessToken: string; readonly expiresIn: number }
  | { readonly kind: 'invalidCredentials' }
  | { readonly kind: 'rateLimited' };
