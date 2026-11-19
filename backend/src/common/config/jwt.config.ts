import { Logger } from '@nestjs/common';

const logger = new Logger('JwtConfig');
let warnedFallback = false;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (secret) {
    if (isProd && secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be at least 32 characters in production environments.',
      );
    }
    return secret;
  }

  if (isProd) {
    throw new Error(
      'JWT_SECRET is required in production environments and cannot use a fallback.',
    );
  }

  if (!warnedFallback) {
    warnedFallback = true;
    logger.warn(
      'JWT_SECRET is not set; using development-only fallback secret. Configure JWT_SECRET in backend/.env.',
    );
  }
  return 'development-only-secret-change-in-env';
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || '24h';
}
