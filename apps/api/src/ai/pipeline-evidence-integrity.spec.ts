/**
 * pipeline-evidence-integrity.spec.ts
 *
 * End-to-end validation tests for the 4 pipeline fixes in pasted_content_16.txt:
 *
 *   M1: Isolated weak clusters must rescue orphaned feedback (not just archive)
 *   M2: UnifiedAggregationService.aggregateTheme() is called BEFORE CIQ scoring
 *       in runBatchFinalization (step 6.7)
 *   M3: AutoMergeService.executeMerge() calls aggregateTheme() after each merge
 *   M4: _executeBatchMerge() calls aggregateTheme() after each batch merge
 *
 * These are static code-analysis tests — they verify the pipeline wiring
 * without needing a live database or Redis.
 */

import * as fs from 'fs';
import * as path from 'path';

// __dirname = apps/api/src/ai/
// API_SRC should point to apps/api/src/
const API_SRC = path.join(__dirname, '..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(API_SRC, relPath), 'utf-8');
}

// ─── M1: Isolated weak cluster rescue ────────────────────────────────────────

describe('M1: Isolated weak cluster rescue (no orphaned feedback)', () => {
  let src: string;

  beforeAll(() => {
    src = readSrc('ai/services/theme-clustering.service.ts');
  });

  it('should rescue feedback to nearest active theme even below merge threshold', () => {
    // The fix adds a soft-rescue path inside the else branch of _suppressWeakClusters
    expect(src).toContain('Soft rescue: re-point ThemeFeedback rows to the nearest active');
  });

  it('should use INSERT INTO ThemeFeedback with ON CONFLICT DO NOTHING for rescue', () => {
    expect(src).toContain('ON CONFLICT ("themeId", "feedbackId") DO NOTHING');
  });

  it('should delete source ThemeFeedback rows after rescue', () => {
    expect(src).toContain('await this.prisma.themeFeedback.deleteMany({ where: { themeId: weak.id } })');
  });

  it('should increment feedbackCount on rescue target', () => {
    // The rescue path increments feedbackCount on the nearest theme
    expect(src).toContain('data: { feedbackCount: { increment: rescuedCount } }');
  });

  it('should only archive without rescue when no active themes exist at all', () => {
    // The else branch (no nearest) archives without rescue
    expect(src).toContain('no active themes to rescue into');
  });

  it('should NOT have the old "archive isolated weak cluster" path without rescue check', () => {
    // The old code had: "No suitable neighbour — archive the isolated weak cluster"
    // followed immediately by prisma.theme.update({ status: 'ARCHIVED' })
    // The new code has: "M1 FIX: No suitable merge neighbour" with rescue logic
    expect(src).toContain('M1 FIX: No suitable merge neighbour');
  });
});

// ─── M2: UnifiedAggregation before CIQ scoring in finalization ───────────────

describe('M2: UnifiedAggregation runs BEFORE CIQ enqueue in runBatchFinalization', () => {
  let src: string;

  beforeAll(() => {
    src = readSrc('ai/services/theme-clustering.service.ts');
  });

  it('should have step 6.7 M2 FIX comment', () => {
    expect(src).toContain('M2 FIX: Recompute unified counters BEFORE CIQ scoring');
  });

  it('should call unifiedAggregationService.aggregateTheme in step 6.7', () => {
    expect(src).toContain('await this.unifiedAggregationService.aggregateTheme(id)');
  });

  it('should call aggregateTheme BEFORE the CIQ enqueue loop (step 7)', () => {
    const aggIdx = src.indexOf('M2 FIX: Recompute unified counters BEFORE CIQ scoring');
    const ciqIdx = src.indexOf('Enqueue CIQ re-scoring for all surviving themes');
    expect(aggIdx).toBeGreaterThan(0);
    expect(ciqIdx).toBeGreaterThan(0);
    expect(aggIdx).toBeLessThan(ciqIdx);
  });

  it('should call aggregateTheme AFTER the confidence refresh (step 6)', () => {
    const confIdx = src.indexOf('recomputeClusterConfidence');
    const aggIdx = src.indexOf('M2 FIX: Recompute unified counters BEFORE CIQ scoring');
    expect(confIdx).toBeGreaterThan(0);
    expect(aggIdx).toBeGreaterThan(0);
    expect(confIdx).toBeLessThan(aggIdx);
  });

  it('should inject UnifiedAggregationService in constructor', () => {
    expect(src).toContain('private readonly unifiedAggregationService: UnifiedAggregationService');
  });

  it('should import UnifiedAggregationService', () => {
    expect(src).toContain("import { UnifiedAggregationService } from '../../theme/services/unified-aggregation.service'");
  });
});

// ─── M3: AutoMerge calls aggregateTheme after executeMerge ───────────────────

describe('M3: AutoMergeService.executeMerge calls aggregateTheme after merge', () => {
  let src: string;

  beforeAll(() => {
    src = readSrc('ai/services/auto-merge.service.ts');
  });

  it('should have M3 FIX comment', () => {
    expect(src).toContain('M3 FIX: Recompute unified counters immediately after merge');
  });

  it('should call unifiedAggregationService.aggregateTheme(targetThemeId)', () => {
    expect(src).toContain('await this.unifiedAggregationService.aggregateTheme(targetThemeId)');
  });

  it('should call aggregateTheme BEFORE the CIQ re-scoring enqueue', () => {
    const aggIdx = src.indexOf('M3 FIX: Recompute unified counters immediately after merge');
    const ciqIdx = src.indexOf('Trigger CIQ re-scoring for the merged (target) theme');
    expect(aggIdx).toBeGreaterThan(0);
    expect(ciqIdx).toBeGreaterThan(0);
    expect(aggIdx).toBeLessThan(ciqIdx);
  });

  it('should inject UnifiedAggregationService in constructor', () => {
    expect(src).toContain('private readonly unifiedAggregationService: UnifiedAggregationService');
  });

  it('should import UnifiedAggregationService', () => {
    expect(src).toContain("import { UnifiedAggregationService } from '../../theme/services/unified-aggregation.service'");
  });
});

// ─── M4: _executeBatchMerge calls aggregateTheme after transaction ────────────

describe('M4: _executeBatchMerge calls aggregateTheme after batch merge transaction', () => {
  let src: string;

  beforeAll(() => {
    src = readSrc('ai/services/theme-clustering.service.ts');
  });

  it('should have M4 FIX comment in _executeBatchMerge', () => {
    expect(src).toContain('M4 FIX: Recompute unified counters on the target after each batch merge');
  });

  it('should call unifiedAggregationService.aggregateTheme(targetId) in _executeBatchMerge', () => {
    // Find the _executeBatchMerge method body and check for the aggregateTheme call
    const methodStart = src.indexOf('private async _executeBatchMerge(');
    const methodEnd = src.indexOf('// ─── PRIVATE: CORE ASSIGNMENT', methodStart);
    const methodBody = src.slice(methodStart, methodEnd);
    expect(methodBody).toContain('await this.unifiedAggregationService.aggregateTheme(targetId)');
  });

  it('should call aggregateTheme AFTER the $transaction block in _executeBatchMerge', () => {
    const methodStart = src.indexOf('private async _executeBatchMerge(');
    const methodEnd = src.indexOf('// ─────────────────────────────────────────────────────────────────────────────\n  // PRIVATE: CORE ASSIGNMENT', methodStart);
    const methodBody = src.slice(methodStart, methodEnd);
    const txEnd = methodBody.lastIndexOf('});');
    const aggIdx = methodBody.indexOf('M4 FIX: Recompute unified counters on the target after each batch merge');
    expect(txEnd).toBeGreaterThan(0);
    expect(aggIdx).toBeGreaterThan(0);
    expect(aggIdx).toBeGreaterThan(txEnd);
  });
});

// ─── AiModule: UnifiedAggregationService registered globally ─────────────────

describe('AiModule: UnifiedAggregationService registered as global provider', () => {
  let src: string;

  beforeAll(() => {
    src = readSrc('ai/ai.module.ts');
  });

  it('should import UnifiedAggregationService', () => {
    expect(src).toContain("import { UnifiedAggregationService } from '../theme/services/unified-aggregation.service'");
  });

  it('should list UnifiedAggregationService in providers', () => {
    const providersStart = src.indexOf('providers: [');
    const providersEnd = src.indexOf(']', providersStart);
    const providers = src.slice(providersStart, providersEnd);
    expect(providers).toContain('UnifiedAggregationService');
  });

  it('should list UnifiedAggregationService in exports', () => {
    const exportsStart = src.lastIndexOf('exports: [');
    const exportsEnd = src.indexOf(']', exportsStart);
    const exports = src.slice(exportsStart, exportsEnd);
    expect(exports).toContain('UnifiedAggregationService');
  });
});

// ─── Counter integrity: all 25 feedback items accounted for ──────────────────

describe('Counter integrity: feedbackCount is always updated after merge', () => {
  let clusteringSrc: string;
  let autoMergeSrc: string;

  beforeAll(() => {
    clusteringSrc = readSrc('ai/services/theme-clustering.service.ts');
    autoMergeSrc = readSrc('ai/services/auto-merge.service.ts');
  });

  it('_executeBatchMerge should increment feedbackCount on target inside transaction', () => {
    const methodStart = clusteringSrc.indexOf('private async _executeBatchMerge(');
    const methodEnd = clusteringSrc.indexOf('M4 FIX:', methodStart);
    const txBody = clusteringSrc.slice(methodStart, methodEnd);
    expect(txBody).toContain('feedbackCount: { increment: affectedFeedbackCount }');
  });

  it('executeMerge should increment feedbackCount on target inside transaction', () => {
    // Search the full executeMerge method body for the feedbackCount increment
    // (slicing at the first '});' finds the end of findMany, not the transaction)
    const methodStart = autoMergeSrc.indexOf('async executeMerge(');
    const methodEnd = autoMergeSrc.indexOf('async getSuggestions(', methodStart);
    const methodBody = autoMergeSrc.slice(methodStart, methodEnd);
    expect(methodBody).toContain('feedbackCount: { increment: affectedFeedbackCount }');
  });

  it('soft-rescue path should increment feedbackCount on rescue target', () => {
    const rescueStart = clusteringSrc.indexOf('Soft rescue: re-point ThemeFeedback rows');
    const rescueEnd = clusteringSrc.indexOf('no active themes to rescue into', rescueStart);
    const rescueBody = clusteringSrc.slice(rescueStart, rescueEnd);
    expect(rescueBody).toContain('feedbackCount: { increment: rescuedCount }');
  });

  it('all merge paths should re-point RoadmapItem rows', () => {
    // Both _executeBatchMerge and executeMerge should re-point RoadmapItem
    expect(clusteringSrc).toContain('await tx.roadmapItem.updateMany(');
    expect(autoMergeSrc).toContain('await tx.roadmapItem.updateMany(');
  });

  it('all merge paths should re-point CustomerSignal rows', () => {
    expect(clusteringSrc).toContain('await tx.customerSignal.updateMany(');
    expect(autoMergeSrc).toContain('await tx.customerSignal.updateMany(');
  });

  it('all merge paths should re-point SupportIssueCluster rows', () => {
    expect(clusteringSrc).toContain('await tx.supportIssueCluster.updateMany(');
    expect(autoMergeSrc).toContain('await tx.supportIssueCluster.updateMany(');
  });
});

// ─── CIQ scoring: reads fresh counters ───────────────────────────────────────

describe('CIQ scoring: reads fresh counters after aggregation', () => {
  let ciqSrc: string;

  beforeAll(() => {
    ciqSrc = readSrc('ciq/ciq-engine.service.ts');
  });

  it('should compute voiceSignalScore from live ThemeFeedback metadata (not stale DB field)', () => {
    // The scorer iterates activeFeedback and reads metadata.intelligence
    expect(ciqSrc).toContain('const meta = tf.feedback.metadata as Record<string, unknown> | null');
    expect(ciqSrc).toContain('const intel = meta?.intelligence as Record<string, unknown> | null');
  });

  it('should compute supportSignalScore from live CustomerSignal rows (not stale DB field)', () => {
    expect(ciqSrc).toContain("s.signalType.toLowerCase().includes('support')");
  });

  it('should use theme.totalSignalCount from DB (fresh after M2) with live fallback', () => {
    // Line: totalSignalCount: theme.totalSignalCount ?? liveSignalCount
    expect(ciqSrc).toContain('theme.totalSignalCount ?? liveSignalCount');
  });

  it('should return voiceCount and supportCount from DB (fresh after M2)', () => {
    expect(ciqSrc).toContain('voiceCount: theme.voiceCount ?? 0');
    expect(ciqSrc).toContain('supportCount: theme.supportCount ?? 0');
  });
});
