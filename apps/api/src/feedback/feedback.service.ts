import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { QueryFeedbackDto } from './dto/query-feedback.dto';
import { S3Service } from '../uploads/services/s3.service';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { AI_ANALYSIS_QUEUE } from '../ai/processors/analysis.processor';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue(AI_ANALYSIS_QUEUE) private readonly analysisQueue: Queue,
  ) {}

  async create(workspaceId: string, createFeedbackDto: CreateFeedbackDto) {
    const newFeedback = await this.prisma.feedback.create({
      data: {
        ...createFeedbackDto,
        status: createFeedbackDto.status ?? 'NEW',
        workspaceId,
      },
    });

    // Dispatch AI analysis job
    await this.analysisQueue.add({ feedbackId: newFeedback.id });

    return newFeedback;
  }

  async findAll(workspaceId: string, query: QueryFeedbackDto) {
    const { page = 1, limit = 10, search, status, sourceType, customerId } = query;
    const where: Prisma.FeedbackWhereInput = {
      workspaceId,
      status,
      sourceType,
      customerId,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { attachments: true },
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(workspaceId: string, id: string) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, workspaceId },
      include: { attachments: true },
    });
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }
    return feedback;
  }

  async update(workspaceId: string, id: string, updateFeedbackDto: UpdateFeedbackDto) {
    await this.findOne(workspaceId, id); // Check existence and ownership
    return this.prisma.feedback.update({
      where: { id },
      data: updateFeedbackDto,
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id); // Check existence and ownership
    return this.prisma.feedback.delete({ where: { id } });
  }

  async createAttachmentPresignedUrl(workspaceId: string, feedbackId: string, fileName: string, contentType: string) {
    await this.findOne(workspaceId, feedbackId);
    const { signedUrl, key } = await this.s3.createPresignedUrl(workspaceId, fileName, contentType);

    return { signedUrl, key };
  }

  async confirmAttachment(workspaceId: string, feedbackId: string, key: string, fileName: string, mimeType: string, sizeBytes: number) {
    await this.findOne(workspaceId, feedbackId);
    
    return this.prisma.feedbackAttachment.create({
      data: {
        feedbackId,
        s3Key: key,
        s3Bucket: this.s3.getBucketName(),
        fileName,
        mimeType,
        sizeBytes,
      },
    });
  }
}
