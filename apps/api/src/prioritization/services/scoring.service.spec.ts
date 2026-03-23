import { Test, TestingModule } from "@nestjs/testing";
import { ScoringService } from "./scoring.service";
import { PrioritizationSettings } from "@prisma/client";
import { ThemeData } from "./aggregation.service";

describe("ScoringService", () => {
  let service: ScoringService;

  const mockSettings: PrioritizationSettings = {
    workspaceId: "ws-1",
    requestFrequencyWeight: 0.1,
    customerCountWeight: 0.2,
    arrValueWeight: 0.3,
    accountPriorityWeight: 0.15,
    dealValueWeight: 0.2,
    strategicWeight: 0.05,
    voteWeight: 0.15,
    sentimentWeight: 0.1,
    recencyWeight: 0.05,
    dealStageProspecting: 0.1,
    dealStageQualifying: 0.3,
    dealStageProposal: 0.6,
    dealStageNegotiation: 0.8,
    dealStageClosedWon: 1.0,
    updatedAt: new Date(),
  };

  const mockThemeData: ThemeData = {
    themeId: "theme-1",
    requestFrequency: 100,
    uniqueCustomerCount: 20,
    arrValue: 50000,
    accountPriorityValue: 80,
    dealInfluenceValue: 10000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScoringService],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should calculate the priority score correctly", () => {
    const result = service.calculateScore(mockSettings, mockThemeData, 50);

    const expectedScore =
      100 * 0.1 + // requestFrequency
      20 * 0.2 + // uniqueCustomerCount
      50000 * 0.3 + // arrValue
      80 * 0.15 + // accountPriorityValue
      10000 * 0.2 + // dealValue
      50 * 0.05; // strategicWeight

    expect(result.priorityScore).toBeCloseTo(expectedScore);
  });

  it("should generate a detailed score explanation", () => {
    const result = service.calculateScore(mockSettings, mockThemeData, 50);

    expect(result.scoreExplanation).toHaveProperty("requestFrequencyWeight");
    expect(result.scoreExplanation.requestFrequencyWeight.value).toBe(100);
    expect(result.scoreExplanation.requestFrequencyWeight.weight).toBe(0.1);
    expect(result.scoreExplanation.requestFrequencyWeight.score).toBe(10);

    expect(result.scoreExplanation).toHaveProperty("arrValueWeight");
    expect(result.scoreExplanation.arrValueWeight.value).toBe(50000);
    expect(result.scoreExplanation.arrValueWeight.weight).toBe(0.3);
    expect(result.scoreExplanation.arrValueWeight.score).toBe(15000);
  });

  it("should return the raw revenue and deal values", () => {
    const result = service.calculateScore(mockSettings, mockThemeData);
    expect(result.revenueImpactValue).toBe(50000);
    expect(result.dealInfluenceValue).toBe(10000);
  });
});
