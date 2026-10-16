import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasherInterface } from './passwordHasherInterface.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherInterface {
  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
  }
}
