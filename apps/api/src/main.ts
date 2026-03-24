import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Capture raw body for Stripe webhook signature verification
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';

  // ── Security Headers (helmet) ────────────────────────────────────────────
  // Sets X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Strict-Transport-Security (HSTS), Content-Security-Policy, and more.
  // HSTS enforces HTTPS-only transport — passwords and tokens are never sent
  // in plaintext once the browser has seen the HSTS header.
  app.use(
    helmet({
      // Enforce HTTPS for 1 year (including subdomains) in production.
      // In development this is disabled to allow localhost HTTP.
      hsts: isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      // Allow Swagger UI to load its own scripts in development
      contentSecurityPolicy: isProduction
        ? undefined
        : false,
    }),
  );

  // ── Stripe Webhook Raw Body ───────────────────────────────────────────────
  // Must be registered BEFORE the global JSON parser
  app.use(
    '/api/v1/billing/webhook',
    express.raw({ type: 'application/json' }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  // In production: read allowed origins from CORS_ORIGIN env var (comma-separated).
  // In development: allow localhost origins for convenience.
  // Credentials are enabled so the browser sends cookies/auth headers.
  const corsOriginEnv = configService.get<string>('CORS_ORIGIN', '');
  const productionOrigins = corsOriginEnv
    ? corsOriginEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const developmentOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost:3003',
  ];

  app.enableCors({
    origin: isProduction ? productionOrigins : developmentOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // ── Global API Prefix ────────────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global Validation Pipe ───────────────────────────────────────────────
  // whitelist: strips any properties not in the DTO
  // forbidNonWhitelisted: throws 400 if unknown properties are present
  // transform: auto-converts query params to their declared types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ── Global Exception Filter ──────────────────────────────────────────────
  // Returns structured JSON error responses; never leaks stack traces in production
  app.useGlobalFilters(new HttpExceptionFilter());

  // ── Global Logging Interceptor ───────────────────────────────────────────
  // Logs method, path, and duration. Does NOT log request bodies (no password leakage).
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── Swagger UI (development only) ────────────────────────────────────────
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Triage Insight API')
      .setDescription('API documentation for the Triage Insight platform')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
}
bootstrap();
