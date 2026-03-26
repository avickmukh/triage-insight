import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Marked @Global() so PrismaService is available in every module in the
 * application context — including WorkerProcessorsModule — without each
 * module needing to import PrismaModule explicitly.
 *
 * This is the standard NestJS pattern for database service modules.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
