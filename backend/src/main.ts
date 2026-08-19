// ============================================================================
// مِران (Miran) — Main Entrypoint
// National Health Training Management Platform
// ============================================================================

import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { AuditInterceptor } from './common/interceptors';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(helmet());

  // CORS setup — explicit list; includes staging frontend, env overrides, and dev origins
  const envOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const defaultAllowedOrigins = [
    'https://miraan.netlify.app',
    'https://miran-brh.pages.dev',
  ];
  const devOrigins = process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5173'];
  const allowedOrigins = Array.from(
    new Set([...defaultAllowedOrigins, ...envOrigins, ...devOrigins]),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Organization-Id',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Authorization'],
  });

  // Global Prefix & API Versioning
  const apiPrefix = process.env.API_PREFIX || 'api';
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['/', 'api/docs'],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Audit Interceptor
  const prismaService = app.get(PrismaService);
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new AuditInterceptor(reflector, prismaService));

  // Production-Safe Swagger Documentation Setup
  //
  // Outside production the docs stay on unless explicitly switched off. In
  // production they are OFF unless SWAGGER_ENABLED is exactly 'true' — the old
  // `!== 'false'` default meant an unset variable published the entire API
  // surface, including request examples, to anonymous callers at /api/docs.
  const isProduction = process.env.NODE_ENV === 'production';
  const isSwaggerEnabled = isProduction
    ? process.env.SWAGGER_ENABLED === 'true'
    : process.env.SWAGGER_ENABLED !== 'false';
  if (isSwaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('مِران (Miran) API Documentation')
      .setDescription('المكتبة البرمجية لمنصة مِران الوطنية لإدارة التدريب الصحي ( v3.0 Enterprise )')
      .setVersion('3.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'أدخل رمز JWT هنا',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Miran Platform backend running on port: ${port}`);
  if (isSwaggerEnabled) {
    console.log(`📚 Swagger documentation enabled at /api/docs`);
  }
}

bootstrap();
