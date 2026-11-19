import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { createPool, Pool } from 'mysql2/promise';

export const MYSQL_POOL = 'MYSQL_POOL';

@Global()
@Module({
  providers: [
    {
      provide: MYSQL_POOL,
      useFactory: (): Pool => {
        return createPool({
          host: process.env.DB_HOST ?? 'localhost',
          port: Number(process.env.DB_PORT ?? 3306),
          database: process.env.DB_NAME ?? 'horse_transport_system',
          user: process.env.DB_USER ?? 'root',
          password: process.env.DB_PASSWORD ?? '',
          connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 20),
          waitForConnections: true,
          queueLimit: 0,
        });
      },
    },
  ],
  exports: [MYSQL_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
