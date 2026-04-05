import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ThemeService, AI_CLUSTERING_QUEUE } from './theme.service';
import { CIQ_SCORING_QUEUE } from '../../ai/processors/ciq-scoring.processor';
import { ThemeRepository } from '../repositories/theme.repository';
import { AuditService } from '../../ai/services/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogAction, ThemeStatus } from '@prisma/client';

// ─── Minimal stubs ────────────────────────────────────────────────────────────

const mockTheme = {
  id: 'theme-1',
  workspaceId: 'ws-1',
  title: 'Bug Reports',
  description: null,
  status: ThemeStatus.AI_GENERATED,
  pinned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { feedbacks: 3 },
};

const mockThemeRepository = {
  findById: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  addFeedback: jest.fn(),
  removeFeedback: jest.fn(),
};

const mockAuditService = {
  logAction: jest.fn(),
};

const mockPrisma = {
  $transaction: jest.fn(),
  themeFeedback: {
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  theme: {
    deleteMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  feedback: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  customer: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
};

const mockClusteringQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};
const mockCiqQueue = { add: jest.fn() };

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThemeService,
        { provide: ThemeRepository, useValue: mockThemeRepository },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: getQueueToken(AI_CLUSTERING_QUEUE),
          useValue: mockClusteringQueue,
        },
        {
          provide: getQueueToken(CIQ_SCORING_QUEUE),
          useValue: mockCiqQueue,
        },
      ],
    }).compile();

    service = module.get<ThemeService>(ThemeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a theme and write an audit log', async () => {
      mockThemeRepository.create.mockResolvedValue(mockTheme);

      const result = await service.create('ws-1', 'user-1', {
        title: 'Bug Reports',
      });

      expect(mockThemeRepository.create).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ title: 'Bug Reports' }),
      );
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        AuditLogAction.THEME_CREATE,
        expect.any(Object),
      );
      expect(result.title).toBe('Bug Reports');
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a theme with aggregated fields', async () => {
      // findOne calls prisma.theme.findFirst directly (not themeRepository)
      const themeWithRelations = { ...mockTheme, _count: { feedbacks: 0 }, feedbacks: [], dealLinks: [], customerSignals: [] };
      mockPrisma.theme.findFirst.mockResolvedValue(themeWithRelations);
      const result = await service.findOne('ws-1', 'theme-1');
      expect(result.id).toBe('theme-1');
    });

    it('should throw NotFoundException when theme does not exist', async () => {
      mockPrisma.theme.findFirst.mockResolvedValue(null);
      await expect(service.findOne('ws-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a theme and write an audit log', async () => {
      // update calls findOne internally which calls prisma.theme.findFirst
      const themeWithRelations = { ...mockTheme, _count: { feedbacks: 0 }, feedbacks: [], dealLinks: [], customerSignals: [] };
      mockPrisma.theme.findFirst.mockResolvedValue(themeWithRelations);
      const updated = { ...mockTheme, title: 'Renamed' };
      mockThemeRepository.update.mockResolvedValue(updated);

      const result = await service.update('ws-1', 'user-1', 'theme-1', {
        title: 'Renamed',
      });

      expect(mockThemeRepository.update).toHaveBeenCalledWith('theme-1', {
        title: 'Renamed',
      });
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        AuditLogAction.THEME_UPDATE,
        expect.any(Object),
      );
      expect(result.title).toBe('Renamed');
    });
  });

  // ─── merge ───────────────────────────────────────────────────────────────────

  describe('merge', () => {
    it('should throw BadRequestException when target is in source list', async () => {
      await expect(
        service.merge('ws-1', 'user-1', 'theme-1', ['theme-1']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should run merge inside a transaction', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
          fn(mockPrisma),
      );
      // merge calls findOne inside the tx which calls prisma.theme.findFirst
      const themeWithRelations = { ...mockTheme, _count: { feedbacks: 0 }, feedbacks: [], dealLinks: [], customerSignals: [] };
      mockPrisma.theme.findFirst.mockResolvedValue(themeWithRelations);
      mockPrisma.themeFeedback.findMany.mockResolvedValue([]);

      await service.merge('ws-1', 'user-1', 'theme-1', ['theme-2', 'theme-3']);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // merge uses deleteMany (not updateMany) to remove source feedback links
      expect(mockPrisma.themeFeedback.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { themeId: { in: ['theme-2', 'theme-3'] } },
        }),
      );
      expect(mockPrisma.theme.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['theme-2', 'theme-3'] }, workspaceId: 'ws-1' },
        }),
      );
    });
  });

  // ─── split ───────────────────────────────────────────────────────────────────

  describe('split', () => {
    it('should create a new theme and move feedback inside a transaction', async () => {
      const newTheme = { ...mockTheme, id: 'theme-new', title: 'New Theme' };
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
          fn(mockPrisma),
      );
      mockPrisma.theme.create.mockResolvedValue(newTheme);
      // split uses findMany + upsert + deleteMany (not updateMany)
      mockPrisma.themeFeedback.findMany.mockResolvedValue([
        { themeId: 'theme-1', feedbackId: 'fb-1', assignedBy: 'ai', confidence: 0.9 },
        { themeId: 'theme-1', feedbackId: 'fb-2', assignedBy: 'ai', confidence: 0.8 },
      ]);
      mockPrisma.themeFeedback.upsert.mockResolvedValue({});

      const result = await service.split('ws-1', 'user-1', 'theme-1', {
        newThemeTitle: 'New Theme',
        feedbackIdsToMove: ['fb-1', 'fb-2'],
      });

      expect(mockPrisma.theme.create).toHaveBeenCalled();
      // deleteMany removes source links after upsert to new theme
      expect(mockPrisma.themeFeedback.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { themeId: 'theme-1', feedbackId: { in: ['fb-1', 'fb-2'] } },
        }),
      );
      expect(result.title).toBe('New Theme');
    });
  });

  // ─── triggerReclustering ─────────────────────────────────────────────────────

  describe('triggerReclustering', () => {
    it('should dispatch a job to the clustering queue', async () => {
      const result = await service.triggerReclustering('ws-1');

      expect(mockClusteringQueue.add).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
      });
      expect(result).toMatchObject({
        message: expect.any(String),
        jobId: 'job-1',
      });
    });
  });
});
