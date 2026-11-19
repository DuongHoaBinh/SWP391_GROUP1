import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';

function buildAllowedCorsOrigins(): string[] {
  const configured = (process.env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production') {
    return configured.length > 0 ? configured : ['http://localhost:3001'];
  }

  return Array.from(
    new Set([
      ...configured,
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]),
  );
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const uploadDir = join(process.cwd(), 'uploads', 'documents');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const horsesUploadDir = join(process.cwd(), 'uploads', 'horses');
  if (!fs.existsSync(horsesUploadDir)) {
    fs.mkdirSync(horsesUploadDir, { recursive: true });
  }
  for (const sub of ['disbursements', 'refund-receipts', 'health-logs', 'incidents', 'handovers']) {
    const dir = join(process.cwd(), 'uploads', sub);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Only expose horse avatar images statically with strict sandbox headers.
  // Sensitive legal/quarantine documents in uploads/documents MUST be served via GET /api/documents/:id/file with JWT & ownership checks.
  app.useStaticAssets(horsesUploadDir, {
    prefix: '/uploads/horses',
    setHeaders: (res: Response) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: buildAllowedCorsOrigins(),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EquiTransit Logistics API')
      .setDescription('Cross-Border Racehorse Transport Management System API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = Number(process.env.PORT ?? 5000);
  await app.listen(port, '0.0.0.0');
  logger.log(`EquiTransit API listening on http://0.0.0.0:${port}/api`);
}

bootstrap().catch((err) => {
  console.error('Failed to start backend server:', err);
  process.exit(1);
});
