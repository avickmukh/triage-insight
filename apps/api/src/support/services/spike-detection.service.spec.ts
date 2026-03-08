import { Test, TestingModule } from "@nestjs/testing";
import { SpikeDetectionService } from "./spike-detection.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("SpikeDetectionService", () => {
  let service: SpikeDetectionService;
  let prisma: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpikeDetectionService,
        {
          provide: PrismaService,
          useValue: {
            supportTicket: { groupBy: jest.fn() },
            supportIssueCluster: { findFirst: jest.fn() },
            issueSpikeEvent: { create: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get<SpikeDetectionService>(SpikeDetectionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should not create a spike event if ticket count is below threshold", async () => {
    // baseline=10, stdDev=3, threshold=3 → spike if ticketCount > 10 + 3*3 = 19
    prisma.supportTicket.groupBy.mockResolvedValue([{ _count: { id: 15 } }]);
    const result = await service.detectSpikes("ws-1", 24, 3);
    expect(prisma.issueSpikeEvent.create).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });

  it("should create a spike event if ticket count exceeds z-score threshold", async () => {
    prisma.supportTicket.groupBy.mockResolvedValue([{ _count: { id: 20 } }]);
    prisma.supportIssueCluster.findFirst.mockResolvedValue({ id: "cluster-1", ticketCount: 20 });
    prisma.issueSpikeEvent.create.mockResolvedValue({ id: "spike-1", zScore: 3.33 });

    const result = await service.detectSpikes("ws-1", 24, 3);

    expect(prisma.issueSpikeEvent.create).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("spike-1");
  });

  it("should not create a spike event if no cluster exists", async () => {
    prisma.supportTicket.groupBy.mockResolvedValue([{ _count: { id: 20 } }]);
    prisma.supportIssueCluster.findFirst.mockResolvedValue(null);

    const result = await service.detectSpikes("ws-1", 24, 3);

    expect(prisma.issueSpikeEvent.create).not.toHaveBeenCalled();
    expect(result).toHaveLength(0);
  });
});
