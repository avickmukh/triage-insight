import { Test, TestingModule } from '@nestjs/testing';
import { SpikeDetectionService } from './spike-detection.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('SpikeDetectionService', () => {
  let service: SpikeDetectionService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpikeDetectionService,
        {
          provide: PrismaService,
          useValue: {
            supportTicket: {
              groupBy: jest.fn(),
              count: jest.fn().mockResolvedValue(0),
            },
            supportIssueCluster: {
              findMany: jest.fn().mockResolvedValue([]),
            },
            issueSpikeEvent: {
              create: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
              update: jest.fn(),
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
      ],
    }).compile();

    service = module.get<SpikeDetectionService>(SpikeDetectionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array when no clusters exist', async () => {
    prisma.supportIssueCluster.findMany.mockResolvedValue([]);
    const result = await service.detectSpikes('ws-1', 24, 3);
    expect(prisma.issueSpikeEvent.create).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('should not create a spike event if ticket count is below z-score threshold', async () => {
    // Cluster with tickets in current window; baseline mean >> current → z < threshold
    prisma.supportIssueCluster.findMany.mockResolvedValue([
      {
        id: 'cluster-1',
        title: 'Login failures',
        arrExposure: null,
        ticketMaps: [{ ticketId: 't1' }, { ticketId: 't2' }],
      },
    ]);
    // current window count = 2; baseline sub-window counts all = 10 → mean=10, z=(2-10)/stdDev < 3
    prisma.supportTicket.count
      .mockResolvedValueOnce(2)   // current window
      .mockResolvedValue(10);     // 7 baseline sub-windows
    const result = await service.detectSpikes('ws-1', 24, 3);
    expect(prisma.issueSpikeEvent.create).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it('should create a spike event if ticket count exceeds z-score threshold', async () => {
    prisma.supportIssueCluster.findMany.mockResolvedValue([
      {
        id: 'cluster-1',
        title: 'Login failures',
        arrExposure: null,
        ticketMaps: [{ ticketId: 't1' }, { ticketId: 't2' }],
      },
    ]);
    // current window = 50; baseline sub-windows all = 5 → mean=5, stdDev≈0 (floor=1) → z=45 > 3
    prisma.supportTicket.count
      .mockResolvedValueOnce(50)  // current window
      .mockResolvedValue(5);      // 7 baseline sub-windows
    prisma.issueSpikeEvent.findFirst.mockResolvedValue(null);
    prisma.issueSpikeEvent.create.mockResolvedValue({ id: 'spike-1', zScore: 45 });

    const result = await service.detectSpikes('ws-1', 24, 3);

    expect(prisma.issueSpikeEvent.create).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    // detectSpikes returns SpikeResult objects (not issueSpikeEvent rows)
    expect(result[0].clusterId).toBe('cluster-1');
    expect(result[0].zScore).toBeGreaterThan(3);
  });
});
