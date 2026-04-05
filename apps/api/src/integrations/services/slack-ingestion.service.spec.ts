import { Test, TestingModule } from '@nestjs/testing';
import { SlackIngestionService } from './slack-ingestion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SlackService } from '../providers/slack.service';
import { getQueueToken } from '@nestjs/bull';
import { AI_ANALYSIS_QUEUE } from '../../ai/processors/analysis.processor';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  integrationConnection: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  feedback: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockSlackService = {
  fetchMessages: jest.fn(),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-id' }),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('SlackIngestionService', () => {
  let service: SlackIngestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackIngestionService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SlackService, useValue: mockSlackService },
        { provide: getQueueToken(AI_ANALYSIS_QUEUE), useValue: mockQueue },
        { provide: getQueueToken(CIQ_SCORING_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SlackIngestionService>(SlackIngestionService);
    jest.clearAllMocks();
  });

  // ── ingestWorkspace ─────────────────────────────────────────────────────────

  describe('ingestWorkspace', () => {
    it('should return empty result when no Slack connection is found', async () => {
      mockPrismaService.integrationConnection.findUnique.mockResolvedValue(
        null,
      );

      const result = await service.ingestWorkspace('ws-id');

      expect(result.ingested).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(mockSlackService.fetchMessages).not.toHaveBeenCalled();
    });

    it('should return empty result when no channels are configured', async () => {
      mockPrismaService.integrationConnection.findUnique.mockResolvedValue({
        workspaceId: 'ws-id',
        provider: 'SLACK',
        accessToken: 'xoxb-token',
        metadata: { channels: [] },
        lastSyncedAt: null,
      });

      const result = await service.ingestWorkspace('ws-id');

      expect(result.ingested).toBe(0);
      expect(mockSlackService.fetchMessages).not.toHaveBeenCalled();
    });

    it('should ingest new messages and skip duplicates', async () => {
      mockPrismaService.integrationConnection.findUnique.mockResolvedValue({
        workspaceId: 'ws-id',
        provider: 'SLACK',
        accessToken: 'xoxb-token',
        metadata: {
          channels: [{ id: 'C123', name: 'general' }],
        },
        lastSyncedAt: null,
      });

      const mockMessages = [
        {
          ts: '1700000001.000000',
          text: 'This is a new feedback message',
          userId: 'U123',
          username: 'alice',
          permalink: 'https://slack.com/archives/C123/p1700000001000000',
          channelId: 'C123',
          channelName: 'general',
        },
        {
          ts: '1700000002.000000',
          text: 'This is a duplicate message',
          userId: 'U456',
          username: 'bob',
          permalink: 'https://slack.com/archives/C123/p1700000002000000',
          channelId: 'C123',
          channelName: 'general',
        },
      ];
      mockSlackService.fetchMessages.mockResolvedValue(mockMessages);

      // First message is new, second is a duplicate
      mockPrismaService.feedback.findFirst
        .mockResolvedValueOnce(null) // new
        .mockResolvedValueOnce({ id: 'existing-feedback-id' }); // duplicate

      mockPrismaService.feedback.create.mockResolvedValue({
        id: 'new-feedback-id',
      });
      mockPrismaService.integrationConnection.update.mockResolvedValue({});

      const result = await service.ingestWorkspace('ws-id');

      expect(result.ingested).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockPrismaService.feedback.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(2); // analysis + ciq for the 1 new message
    });

    it('should count errors when feedback creation fails', async () => {
      mockPrismaService.integrationConnection.findUnique.mockResolvedValue({
        workspaceId: 'ws-id',
        provider: 'SLACK',
        accessToken: 'xoxb-token',
        metadata: {
          channels: [{ id: 'C123', name: 'general' }],
        },
        lastSyncedAt: null,
      });

      mockSlackService.fetchMessages.mockResolvedValue([
        {
          ts: '1700000001.000000',
          text: 'Feedback that will fail',
          userId: 'U123',
          username: 'alice',
          permalink: 'https://slack.com/archives/C123/p1700000001000000',
          channelId: 'C123',
          channelName: 'general',
        },
      ]);

      mockPrismaService.feedback.findFirst.mockResolvedValue(null);
      mockPrismaService.feedback.create.mockRejectedValue(
        new Error('DB error'),
      );
      mockPrismaService.integrationConnection.update.mockResolvedValue({});

      const result = await service.ingestWorkspace('ws-id');

      expect(result.ingested).toBe(0);
      expect(result.errors).toBe(1);
    });
  });
});
