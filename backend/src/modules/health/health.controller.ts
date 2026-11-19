import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../../common/database/database.module';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  @Get()
  @ApiOperation({ summary: 'Backend & MySQL database health check' })
  async check() {
    try {
      await this.pool.query('SELECT 1');
      return {
        status: 'ok',
        db: 'up',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'down',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
