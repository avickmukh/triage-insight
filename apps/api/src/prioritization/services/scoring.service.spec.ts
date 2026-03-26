import { Test, TestingModule } from "@nestjs/testing";
import { ScoringService } from "./scoring.service";
import { PrioritizationSettings } from "@prisma/client";
import { ThemeData } from "./aggregation.service";

describe("ScoringService", () => {
  let service: ScoringService;

  const mockSettings: PrioritizationSettings = {
    workspaceId: "ws-1",
    requestFrequencyWeight: 0.2,
    customerCountWeight: 0.2,
    arrValueWeight: 0.2,
    accountPriorityWeight: 0.1,
    dealValueWeight: 0.2,
    strategicWeight: 0.1,
    voteWeight: 0.15,
    sentimentWeight: 0.1,
    recencyWeight: 0.05,
    dealStageProspecting: 0.1,
    dealStageQualifying: 0.3,
    dealStageProposal: 0.6,
    dealStageNegotiation: 0.8,
    dealStageClosedWon: 1.0,
    updatedAt: new Date(),
    demandStrengthWeight: 0.30,
    revenueImpactWeight: 0.35,
    strategicImportanceWeight: 0.20,
    urgencySignalWeight: 0.15,
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

  it("should return a priorityScore in the 0–100 range", () => {
    const result = service.calculateScore(mockSettings, mockThemeData, 0.5);
    expect(result.priorityScore).toBeGreaterThanOrEqual(0);
    expect(result.priorityScore).toBeLessThanOrEqual(100);
  });

  it("should generate a detailed score explanation with all required fields", () => {
    const result = service.calculateScore(mockSettings, mockThemeData, 0.5);

    expect(result.scoreExplanation).toHaveProperty("requestFrequencyWeight");
    expect(result.scoreExplanation).toHaveProperty("customerCountWeight");
    expect(result.scoreExplanation).toHaveProperty("arrValueWeight");
    expect(result.scoreExplanation).toHaveProperty("accountPriorityWeight");
    expect(result.scoreExplanation).toHaveProperty("dealValueWeight");
    expect(result.scoreExplanation).toHaveProperty("strategicWeight");

    const component = result.scoreExplanation.requestFrequencyWeight;
    expect(component).toHaveProperty("value");
    expect(component).toHaveProperty("normalisedValue");
    expect(component).toHaveProperty("weight");
    expect(component).toHaveProperty("contribution");
    expect(component).toHaveProperty("label");
  });

  it("should preserve raw revenue and deal values in the output", () => {
    const result = service.calculateScore(mockSettings, mockThemeData);
    expect(result.revenueImpactValue).toBe(50000);
    expect(result.dealInfluenceValue).toBe(10000);
  });

  it("should identify a dominant driver in the score", () => {
    const result = service.calculateScore(mockSettings, mockThemeData, 0.5);
    expect(result.dominantDriver).toBeTruthy();
    expect(Object.keys(result.scoreExplanation)).toContain(result.dominantDriver);
  });

  it("should clamp the score to 100 even for extreme input values", () => {
    const extremeData: ThemeData = {
      themeId: "theme-extreme",
      requestFrequency: 999999,
      uniqueCustomerCount: 999999,
      arrValue: 999_999_999,
      accountPriorityValue: 999999,
      dealInfluenceValue: 999_999_999,
    };

    const result = service.calculateScore(mockSettings, extremeData, 1.0);
    expect(result.priorityScore).toBeLessThanOrEqual(100);
  });

  it("should return a score of 0 for all-zero input data", () => {
    const zeroData: ThemeData = {
      themeId: "theme-zero",
      requestFrequency: 0,
      uniqueCustomerCount: 0,
      arrValue: 0,
      accountPriorityValue: 0,
      dealInfluenceValue: 0,
    };

    const result = service.calculateScore(mockSettings, zeroData, 0);
    expect(result.priorityScore).toBe(0);
  });

  it("should normalise weights so scores are stable even if weights do not sum to 1", () => {
    const unevenSettings: PrioritizationSettings = {
      ...mockSettings,
      requestFrequencyWeight: 10,
      customerCountWeight: 10,
      arrValueWeight: 10,
      accountPriorityWeight: 10,
      dealValueWeight: 10,
      strategicWeight: 10,
    };

    const evenSettings: PrioritizationSettings = {
      ...mockSettings,
      requestFrequencyWeight: 1,
      customerCountWeight: 1,
      arrValueWeight: 1,
      accountPriorityWeight: 1,
      dealValueWeight: 1,
      strategicWeight: 1,
    };

    const result1 = service.calculateScore(unevenSettings, mockThemeData, 0.5);
    const result2 = service.calculateScore(evenSettings, mockThemeData, 0.5);

    // Both should produce the same score because weights are normalised
    expect(result1.priorityScore).toBeCloseTo(result2.priorityScore, 1);
  });

  it("should produce a higher score for a theme with more requests and ARR", () => {
    const lowData: ThemeData = {
      themeId: "theme-low",
      requestFrequency: 1,
      uniqueCustomerCount: 1,
      arrValue: 100,
      accountPriorityValue: 1,
      dealInfluenceValue: 100,
    };

    const highData: ThemeData = {
      themeId: "theme-high",
      requestFrequency: 150,
      uniqueCustomerCount: 80,
      arrValue: 500000,
      accountPriorityValue: 400,
      dealInfluenceValue: 300000,
    };

    const lowResult = service.calculateScore(mockSettings, lowData);
    const highResult = service.calculateScore(mockSettings, highData);

    expect(highResult.priorityScore).toBeGreaterThan(lowResult.priorityScore);
  });
});
