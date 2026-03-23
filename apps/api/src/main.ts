import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Capture raw body for Stripe webhook signature verification
    rawBody: true,
  });

  // Stripe webhook needs the raw body — must be registered BEFORE global JSON parser
  app.use(
    '/api/v1/billing/webhook',
    express.raw({ type: 'application/json' }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3002',
      'http://localhost:3003',
    ],
    credentials: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Global API prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe: strips unknown fields, auto-transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter: structured JSON error responses
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor: logs method, path, and duration
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger UI only in development
  if (nodeEnv === 'development') {
    const config = new DocumentBuilder()
      .setTitle('NestJS Backend API')
      .setDescription('API documentation for the NestJS backend bootstrap')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
}
bootstrap();
