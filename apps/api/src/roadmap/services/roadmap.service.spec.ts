import { Test, TestingModule } from "@nestjs/testing";
import { RoadmapService } from "./roadmap.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../ai/services/audit.service";
import { PrioritizationService } from "../../prioritization/services/prioritization.service";
import { NotFoundException } from "@nestjs/common";
import { RoadmapStatus, AuditLogAction } from "@prisma/client";

describe("RoadmapService", () => {
  let service: RoadmapService;
  let prisma: any;
  let auditService: any;
  let prioritizationService: any;

  const mockRoadmapItem = {
    id: "roadmap-1",
    workspaceId: "ws-1",
    title: "Test Item",
    status: RoadmapStatus.EXPLORING,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoadmapService,
        { provide: PrismaService, useValue: { roadmapItem: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() }, theme: { findUnique: jest.fn() }, themeFeedback: { count: jest.fn() } } },
        { provide: AuditService, useValue: { logAction: jest.fn() } },
        { provide: PrioritizationService, useValue: { getThemeScoreExplanation: jest.fn() } },
      ],
    }).compile();

    service = module.get<RoadmapService>(RoadmapService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
    prioritizationService = module.get<PrioritizationService>(PrioritizationService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("should create a roadmap item and log the action", async () => {
      prisma.roadmapItem.create.mockResolvedValue(mockRoadmapItem);
      const result = await service.create("ws-1", "user-1", { title: "Test Item" });
      expect(prisma.roadmapItem.create).toHaveBeenCalled();
      expect(auditService.logAction).toHaveBeenCalledWith("ws-1", "user-1", AuditLogAction.ROADMAP_ITEM_CREATE, expect.any(Object));
      expect(result.title).toBe("Test Item");
    });
  });

  describe("createFromTheme", () => {
    it("should throw NotFoundException if theme does not exist", async () => {
      prisma.theme.findUnique.mockResolvedValue(null);
      await expect(service.createFromTheme("ws-1", "user-1", "theme-1")).rejects.toThrow(NotFoundException);
    });

    it("should create a roadmap item from a theme with snapshot values", async () => {
      prisma.theme.findUnique.mockResolvedValue({ id: "theme-1", title: "Theme Title" });
      prioritizationService.getThemeScoreExplanation.mockResolvedValue({ priorityScore: 100, revenueImpactValue: 5000, dealInfluenceValue: 2000 });
      prisma.themeFeedback.count.mockResolvedValue(10);
      prisma.roadmapItem.create.mockResolvedValue({ ...mockRoadmapItem, title: "Theme Title" });

      const result = await service.createFromTheme("ws-1", "user-1", "theme-1");

      expect(prioritizationService.getThemeScoreExplanation).toHaveBeenCalledWith("ws-1", "theme-1");
      expect(prisma.roadmapItem.create).toHaveBeenCalledWith(expect.objectContaining({ priorityScore: 100, customerCount: 10 }));
      expect(result.title).toBe("Theme Title");
    });
  });

  describe("update", () => {
    it("should log status change when status is updated", async () => {
      prisma.roadmapItem.findUnique.mockResolvedValue(mockRoadmapItem);
      prisma.roadmapItem.update.mockResolvedValue({ ...mockRoadmapItem, status: RoadmapStatus.PLANNED });

      await service.update("ws-1", "user-1", "roadmap-1", { status: RoadmapStatus.PLANNED });

      expect(auditService.logAction).toHaveBeenCalledWith("ws-1", "user-1", AuditLogAction.ROADMAP_ITEM_STATUS_CHANGE, expect.any(Object));
    });

    it("should log a generic update when other fields are changed", async () => {
      prisma.roadmapItem.findUnique.mockResolvedValue(mockRoadmapItem);
      prisma.roadmapItem.update.mockResolvedValue({ ...mockRoadmapItem, title: "New Title" });

      await service.update("ws-1", "user-1", "roadmap-1", { title: "New Title" });

      expect(auditService.logAction).toHaveBeenCalledWith("ws-1", "user-1", AuditLogAction.ROADMAP_ITEM_UPDATE, expect.any(Object));
    });
  });

  describe("findAll", () => {
    it("should group roadmap items by status for Kanban view", async () => {
      const items = [
        { ...mockRoadmapItem, status: RoadmapStatus.EXPLORING },
        { ...mockRoadmapItem, id: "rm-2", status: RoadmapStatus.PLANNED },
        { ...mockRoadmapItem, id: "rm-3", status: RoadmapStatus.EXPLORING },
      ];
      prisma.roadmapItem.findMany.mockResolvedValue(items);

      const result = await service.findAll("ws-1", {});

      expect(result.EXPLORING).toHaveLength(2);
      expect(result.PLANNED).toHaveLength(1);
      expect(result.COMMITTED).toHaveLength(0);
      expect(result.SHIPPED).toHaveLength(0);
    });
  });
});
