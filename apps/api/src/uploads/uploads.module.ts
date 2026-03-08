import { Module } from '@nestjs/common';
import { S3Service } from './services/s3.service';
import { UploadsController } from './uploads.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [S3Service],
  controllers: [UploadsController],
  exports: [S3Service],
})
export class UploadsModule {}
