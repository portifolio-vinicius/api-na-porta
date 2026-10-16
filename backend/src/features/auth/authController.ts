import { Body, Controller, Header, HttpCode, HttpException, HttpStatus, Inject, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUseCases } from './authUseCases.js';
// ValidationPipe needs this DTO class at runtime for whitelist validation.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto } from './loginDto.js';

interface LoginResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthUseCases) private readonly auth: AuthUseCases) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(@Body() input: LoginDto, @Req() request: Request): Promise<LoginResponse> {
    const clientAddress = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const result = await this.auth.login(input, clientAddress);
    if (result.kind === 'rateLimited') {
      throw new HttpException('Muitas tentativas. Tente novamente mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (result.kind === 'invalidCredentials') {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    return { accessToken: result.accessToken, tokenType: 'Bearer', expiresIn: result.expiresIn };
  }
}
