import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('System Root & Health (فحص النظام والبيئة)')
@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'الصفحة الرئيسية للباك إند وحالة النظام' })
  async getRoot() {
    return {
      status: 'ok',
      service: 'Miran Health Platform API',
      version: '3.0 Enterprise',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'فحص سلامة النظام وقاعدة البيانات' })
  async getHealth() {
    let dbStatus = 'down';
    try {
      await (this.prisma as any).$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
