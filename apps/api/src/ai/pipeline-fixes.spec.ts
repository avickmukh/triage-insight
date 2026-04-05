/**
 * pipeline-fixes.spec.ts
 *
 * Targeted regression tests for the 6 pipeline fixes applied 2026-04-05:
 *
 * Fix #1 — FEEDBACK_SCORED race condition: moved from feedback.service.ts (fires
 *           immediately on create) to analysis.processor.ts (fires after analysis
 *           completes and clustering is done). Tests verify the ordering invariant.
 *
 * Fix #2 — Idempotency bypass: post-finalization THEME_SCORED jobs now carry
 *           bypassIdempotency=true so they always run even if an incremental job
 *           completed within the 10-min TTL.
 *
 * Fix #3 — bypassIdempotency in finalization enqueue: theme-clustering.service.ts
 *           sets bypassIdempotency=true on the post-finalization THEME_SCORED jobs.
 *
 * Fix #4 — Merge omissions: _runBatchMergePass and _suppressWeakClusters now use
 *           _executeBatchMerge which re-points RoadmapItem, CustomerSignal,
 *           SupportIssueCluster, and updates feedbackCount on the target.
 *
 * Fix #5 — Inbox UI: theme badge reads theme?.title instead of theme?.name.
 *
 * Fix #6 — Theme title upgrade: after narration, if shortLabelAt was null,
 *           theme.title is upgraded to the LLM-generated shortLabel.
 */

// ─── Fix #1: FEEDBACK_SCORED ordering invariant ─────────────────────────────

describe('Fix #1 — FEEDBACK_SCORED ordering invariant', () => {
  it('FEEDBACK_SCORED must not be enqueued before analysis completes', () => {
    // The invariant: FEEDBACK_SCORED depends on sentiment and embedding being set.
    // Both are written by analysis.processor.ts. If FEEDBACK_SCORED fires before
    // analysis, scoreFeedback reads null sentiment → returns 0.
    //
    // Verification: feedback.service.ts must NOT contain a FEEDBACK_SCORED enqueue.
    // analysis.processor.ts MUST contain a FEEDBACK_SCORED enqueue.
    const fs = require('fs');
    const feedbackServiceSrc = fs.readFileSync(
      require('path').join(__dirname, '../feedback/feedback.service.ts'),
      'utf8',
    );
    const analysisSrc = fs.readFileSync(
      require('path').join(__dirname, 'processors/analysis.processor.ts'),
      'utf8',
    );

    // feedback.service.ts must NOT enqueue FEEDBACK_SCORED (only a comment is allowed)
    // Check that there is no actual enqueue call — only comments are acceptable
    const feedbackScoredEnqueuePattern = /type:\s*['"]FEEDBACK_SCORED['"]/;
    expect(feedbackServiceSrc).not.toMatch(feedbackScoredEnqueuePattern);

    // analysis.processor.ts MUST enqueue FEEDBACK_SCORED after clustering
    expect(analysisSrc).toMatch(/FEEDBACK_SCORED/);

    // The FEEDBACK_SCORED enqueue in analysis.processor.ts must appear AFTER
    // the clustering call (assignFeedbackToTheme or runBatchFinalization)
    const clusteringIdx = analysisSrc.indexOf('assignFeedbackToTheme');
    // Find the actual enqueue call (not comments)
    const feedbackScoredIdx = analysisSrc.indexOf("type: 'FEEDBACK_SCORED'");
    expect(clusteringIdx).toBeGreaterThan(-1);
    expect(feedbackScoredIdx).toBeGreaterThan(-1);
    expect(feedbackScoredIdx).toBeGreaterThan(clusteringIdx);
  });
});

// ─── Fix #2: bypassIdempotency field in CiqJobPayload ───────────────────────

describe('Fix #2 — bypassIdempotency field in CiqJobPayload', () => {
  it('CiqJobPayload interface must include bypassIdempotency?: boolean', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    expect(src).toMatch(/bypassIdempotency\?\s*:\s*boolean/);
  });

  it('CIQ scoring processor must skip idempotency guard when bypassIdempotency=true', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    // The guard must be wrapped in a conditional
    expect(src).toMatch(/if\s*\(\s*!job\.data\.bypassIdempotency\s*\)/);
    // The isDuplicate call must be inside that conditional
    const guardIdx = src.indexOf('if (!job.data.bypassIdempotency)');
    const isDupIdx = src.indexOf('isDuplicate', guardIdx);
    expect(isDupIdx).toBeGreaterThan(guardIdx);
    // The isDuplicate call must come before the closing brace of the if block
    const closingBraceIdx = src.indexOf('\n    }', guardIdx);
    expect(isDupIdx).toBeLessThan(closingBraceIdx);
  });

  it('idempotency guard must NOT block markStarted (logId must always be set)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    // markStarted must appear AFTER the if block closes
    const guardIdx = src.indexOf('if (!job.data.bypassIdempotency)');
    const markStartedIdx = src.indexOf('markStarted', guardIdx);
    const closingBraceIdx = src.indexOf('\n    }', guardIdx);
    expect(markStartedIdx).toBeGreaterThan(closingBraceIdx);
  });
});

// ─── Fix #3: finalization THEME_SCORED carries bypassIdempotency=true ────────

describe('Fix #3 — finalization THEME_SCORED carries bypassIdempotency=true', () => {
  it('theme-clustering.service.ts finalization enqueue must set bypassIdempotency: true', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    // Find the finalization CIQ enqueue section (the one inside runBatchFinalization)
    const finalizationIdx = src.indexOf('Enqueue CIQ re-scoring for all surviving themes');
    expect(finalizationIdx).toBeGreaterThan(-1);
    // bypassIdempotency: true must appear in this section
    const bypassIdx = src.indexOf('bypassIdempotency: true', finalizationIdx);
    expect(bypassIdx).toBeGreaterThan(finalizationIdx);
    // It must appear before the next major section (Stage 8)
    const stage8Idx = src.indexOf('Stage 8', finalizationIdx);
    expect(bypassIdx).toBeLessThan(stage8Idx);
  });

  it('incremental THEME_SCORED enqueue must NOT set bypassIdempotency (only finalization should)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    // Count occurrences of bypassIdempotency: true in actual code (not comments)
    // Filter out comment lines (lines starting with //)
    const nonCommentLines = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    const matches = nonCommentLines.match(/bypassIdempotency:\s*true/g);
    // Should be exactly 1 (only in the finalization enqueue)
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });
});

// ─── Fix #4: _executeBatchMerge re-points all related entities ───────────────

describe('Fix #4 — _executeBatchMerge re-points all related entities', () => {
  it('_executeBatchMerge must exist in theme-clustering.service.ts', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    expect(src).toMatch(/private async _executeBatchMerge/);
  });

  it('_executeBatchMerge must re-point RoadmapItem, CustomerSignal, SupportIssueCluster', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    const helperStart = src.indexOf('private async _executeBatchMerge');
    const helperEnd = src.indexOf('\n  }', helperStart + 100);
    const helperBody = src.slice(helperStart, helperEnd);

    expect(helperBody).toMatch(/roadmapItem\.updateMany/);
    expect(helperBody).toMatch(/customerSignal\.updateMany/);
    expect(helperBody).toMatch(/supportIssueCluster\.updateMany/);
  });

  it('_executeBatchMerge must update feedbackCount on target theme', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    const helperStart = src.indexOf('private async _executeBatchMerge');
    const helperEnd = src.indexOf('\n  }', helperStart + 100);
    const helperBody = src.slice(helperStart, helperEnd);

    expect(helperBody).toMatch(/feedbackCount.*increment/);
  });

  it('_runBatchMergePass must call _executeBatchMerge (not inline merge)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    const batchMergeStart = src.indexOf('private async _runBatchMergePass');
    const batchMergeEnd = src.indexOf('\n  private async', batchMergeStart + 100);
    const batchMergeBody = src.slice(batchMergeStart, batchMergeEnd);

    expect(batchMergeBody).toMatch(/this\._executeBatchMerge/);
    // Must NOT contain the old inline INSERT INTO ThemeFeedback
    expect(batchMergeBody).not.toMatch(/INSERT INTO "ThemeFeedback"/);
  });

  it('_suppressWeakClusters must call _executeBatchMerge (not inline merge)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    const suppressStart = src.indexOf('private async _suppressWeakClusters');
    const suppressEnd = src.indexOf('\n  }', suppressStart + 100);
    const suppressBody = src.slice(suppressStart, suppressEnd);

    expect(suppressBody).toMatch(/this\._executeBatchMerge/);
    // Must NOT contain the old inline INSERT INTO ThemeFeedback
    expect(suppressBody).not.toMatch(/INSERT INTO "ThemeFeedback"/);
  });
});

// ─── Fix #5: Inbox UI reads theme?.title not theme?.name ────────────────────

describe('Fix #5 — Inbox UI reads theme?.title not theme?.name', () => {
  it('inbox page must not read theme?.name (Theme model has no name field)', () => {
    const fs = require('fs');
    const inboxPath = require('path').join(
      __dirname,
      '../../../../web/src/app/(workspace)/[orgSlug]/app/inbox/page.tsx',
    );
    if (!fs.existsSync(inboxPath)) {
      // Skip if running in API-only test environment
      return;
    }
    const src = fs.readFileSync(inboxPath, 'utf8');
    // Must not read theme?.name
    expect(src).not.toMatch(/theme\?\.name/);
    // Must read theme?.title
    expect(src).toMatch(/theme\?\.title/);
  });
});

// ─── Fix #6: CIQ processor upgrades theme.title after narration ─────────────

describe('Fix #6 — CIQ processor upgrades theme.title after narration', () => {
  it('ciq-scoring.processor.ts must call themeLabelService.generateLabel', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    expect(src).toMatch(/themeLabelService\.generateLabel/);
  });

  it('ciq-scoring.processor.ts must upgrade theme.title when wasUnlabelled=true', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    // Must check wasUnlabelled before upgrading title
    expect(src).toMatch(/wasUnlabelled/);
    // Must update theme.title with the new label
    expect(src).toMatch(/data:\s*\{\s*title:\s*newLabel\s*\}/);
  });

  it('ThemeLabelService must be injected in CiqScoringProcessor constructor', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    expect(src).toMatch(/import.*ThemeLabelService.*theme-label\.service/);
    expect(src).toMatch(/private readonly themeLabelService:\s*ThemeLabelService/);
  });

  it('title upgrade must be non-fatal (wrapped in try/catch)', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    const labelIdx = src.indexOf('themeLabelService.generateLabel');
    // There must be a try block before the generateLabel call
    const tryIdx = src.lastIndexOf('try {', labelIdx);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeLessThan(labelIdx);
    // There must be a catch block after the generateLabel call
    const catchIdx = src.indexOf('} catch (labelErr)', labelIdx);
    expect(catchIdx).toBeGreaterThan(labelIdx);
  });
});

// ─── Combined: full pipeline ordering invariants ─────────────────────────────

describe('Combined pipeline ordering invariants', () => {
  it('analysis.processor.ts must enqueue FEEDBACK_SCORED after clustering AND after sentiment/embedding are written', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/analysis.processor.ts'),
      'utf8',
    );
    // Sentiment assignment (let sentiment = ...) must appear before FEEDBACK_SCORED enqueue
    const sentimentIdx = src.indexOf('let sentiment =');
    // Find the actual enqueue call (not comments)
    const feedbackScoredIdx = src.indexOf("type: 'FEEDBACK_SCORED'");
    expect(sentimentIdx).toBeGreaterThan(-1);
    expect(feedbackScoredIdx).toBeGreaterThan(-1);
    expect(feedbackScoredIdx).toBeGreaterThan(sentimentIdx);
  });

  it('CIQ scoring processor must import both ThemeNarrationService and ThemeLabelService', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'processors/ciq-scoring.processor.ts'),
      'utf8',
    );
    expect(src).toMatch(/ThemeNarrationService/);
    expect(src).toMatch(/ThemeLabelService/);
  });

  it('_executeBatchMerge must wrap all DB operations in a single transaction', () => {
    const fs = require('fs');
    const src = fs.readFileSync(
      require('path').join(__dirname, 'services/theme-clustering.service.ts'),
      'utf8',
    );
    const helperStart = src.indexOf('private async _executeBatchMerge');
    // Find the next top-level private method to bound the helper body
    const helperEnd = src.indexOf('\n  private async', helperStart + 100);
    const helperBody = src.slice(helperStart, helperEnd > -1 ? helperEnd : helperStart + 5000);
    // Must use a transaction
    expect(helperBody).toMatch(/\$transaction/);
    // All 4 entity re-points must be in the helper body
    expect(helperBody).toMatch(/roadmapItem\.updateMany/);
    expect(helperBody).toMatch(/customerSignal\.updateMany/);
    expect(helperBody).toMatch(/supportIssueCluster\.updateMany/);
    expect(helperBody).toMatch(/feedbackCount.*increment/);
  });
});
