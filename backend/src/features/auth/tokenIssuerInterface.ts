export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');

export interface TokenIssuerInterface {
  issue(publicId: string): Promise<string>;
}
