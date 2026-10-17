import { Module, type DynamicModule } from '@nestjs/common';
import { HealthModule } from '@library/kit';
import type pg from 'pg';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CirculationModule } from './circulation/circulation.module.js';
import type { AuthConfig } from './common/auth.js';
import { DbModule, POOL } from './db/db.module.js';
import { MembersModule } from './members/members.module.js';
import { OpenApiController } from './openapi.js';

@Module({})
export class AppModule {
  static register(databaseUrl: string, auth: AuthConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DbModule.forRoot(databaseUrl),
        AuthModule.forRoot(auth),
        HealthModule.registerAsync({
          inject: [POOL],
          useFactory: ((pool: pg.Pool) => ({
            database: async () => {
              await pool.query('select 1');
            },
          })) as never,
        }),
        CatalogModule,
        MembersModule,
        CirculationModule,
      ],
      controllers: [OpenApiController],
    };
  }
}
