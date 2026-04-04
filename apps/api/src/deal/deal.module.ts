import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DealController } from './deal.controller';
import { DealService } from './deal.service';

@Module({
  imports: [PrismaModule],
  controllers: [DealController],
  providers: [DealService],
  exports: [DealService],
})
export class DealModule {}
