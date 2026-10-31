import 'dotenv/config';
import { config } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';

config({ path: join(__dirname, '../.env.sepay.local'), quiet: true });

async function bootstrap() {
  if (process.env.SEPAY_ENABLED === 'true' && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('SePay requires a JWT_SECRET with at least 32 characters.');
  }
  const uploadDir = join(process.cwd(), 'uploads', 'documents');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const horsesUploadDir = join(process.cwd(), 'uploads', 'horses');
  if (!fs.existsSync(horsesUploadDir)) {
    fs.mkdirSync(horsesUploadDir, { recursive: true });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [
      process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cross-Border Racehorse Transport API')
    .setDescription('Authentication API for the racehorse transport management system')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(Number(process.env.PORT ?? 5000));
}

void bootstrap();
