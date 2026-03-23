import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { JobIdempotencyService } from './queue/job-idempotency.service';

/**
 * CommonModule
 *
 * Global module that provides shared infrastructure services to all modules.
 * Marked @Global() so it does not need to be imported explicitly in every module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [JobIdempotencyService],
  exports: [JobIdempotencyService],
})
export class CommonModule {}
