import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','it','its','was','are','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might','shall',
  'can','need','must','am','i','we','you','he','she','they','this','that','these',
  'those','my','your','our','their','not','no','so','if','as','up','out','about',
  'into','through','during','before','after','above','below','between','each',
  'than','too','very','just','because','while','although','however','therefore',
  'also','when','where','how','what','which','who','whom','all','any','both',
  'few','more','most','other','some','such','only','own','same','than','then',
  'there','here','again','further','once','get','got','getting','please','hi',
  'hello','thanks','thank','dear','regards','sincerely','re','fwd','issue',
  'problem','error','help','support','ticket','request','question',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function computeTfIdf(docs: string[][]): Map<string, number>[] {
  const N = docs.length;
  const df = new Map<string, number>();
  for (const tokens of docs) {
    const unique = new Set(tokens);
    for (const t of unique) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return docs.map((tokens) => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const tfidf = new Map<string, number>();
    for (const [term, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      tfidf.set(term, (count / tokens.length) * idf);
    }
    return tfidf;
  });
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    normA += v * v;
  }
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function topTerms(tfidf: Map<string, number>, n = 5): string[] {
  return [...tfidf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

@Injectable()
export class ClusteringService {
  private readonly logger = new Logger(ClusteringService.name);

  constructor(private readonly prisma: PrismaService) {}

  async clusterTickets(workspaceId: string): Promise<{ clustersCreated: number; ticketsMapped: number }> {
    this.logger.log(`[Clustering] Starting for workspace ${workspaceId}`);

    const tickets = await this.prisma.supportTicket.findMany({
      where: { workspaceId },
      select: { id: true, subject: true, description: true },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });

    if (tickets.length === 0) return { clustersCreated: 0, ticketsMapped: 0 };

    const docs = tickets.map((t) => tokenize(`${t.subject} ${t.description ?? ''}`));
    const vectors = computeTfIdf(docs);

    const THRESHOLD = 0.25;
    const clusterAssignments: number[] = new Array(tickets.length).fill(-1);
    const clusterCentroids: Map<string, number>[] = [];

    for (let i = 0; i < tickets.length; i++) {
      let bestCluster = -1;
      let bestSim = THRESHOLD;
      for (let c = 0; c < clusterCentroids.length; c++) {
        const sim = cosineSimilarity(vectors[i], clusterCentroids[c]);
        if (sim > bestSim) { bestSim = sim; bestCluster = c; }
      }
      if (bestCluster === -1) {
        bestCluster = clusterCentroids.length;
        clusterCentroids.push(new Map(vectors[i]));
      } else {
        const centroid = clusterCentroids[bestCluster];
        const clusterSize = clusterAssignments.filter((a) => a === bestCluster).length + 1;
        for (const [k, v] of vectors[i]) {
          centroid.set(k, ((centroid.get(k) ?? 0) * (clusterSize - 1) + v) / clusterSize);
        }
      }
      clusterAssignments[i] = bestCluster;
    }

    const clusterGroups = new Map<number, number[]>();
    for (let i = 0; i < clusterAssignments.length; i++) {
      const c = clusterAssignments[i];
      if (!clusterGroups.has(c)) clusterGroups.set(c, []);
      clusterGroups.get(c)!.push(i);
    }

    await this.prisma.supportIssueClusterMap.deleteMany({ where: { cluster: { workspaceId } } });
    await this.prisma.supportIssueCluster.deleteMany({ where: { workspaceId } });

    let clustersCreated = 0;
    let ticketsMapped = 0;

    for (const [clusterIdx, ticketIndices] of clusterGroups) {
      if (ticketIndices.length < 2) continue;
      const centroid = clusterCentroids[clusterIdx];
      const terms = topTerms(centroid, 5);
      const title = terms.slice(0, 3).join(' / ') || 'Uncategorised Issue';
      const description = `Top terms: ${terms.join(', ')}`;
      const clusterTicketIds = ticketIndices.map((i) => tickets[i].id);
      const arrAgg = await this.prisma.supportTicket.aggregate({
        where: { id: { in: clusterTicketIds } },
        _sum: { arrValue: true },
      });
      const cluster = await this.prisma.supportIssueCluster.create({
        data: { workspaceId, title, description, ticketCount: ticketIndices.length, arrExposure: arrAgg._sum.arrValue ?? 0 },
      });
      clustersCreated++;
      await this.prisma.supportIssueClusterMap.createMany({
        data: ticketIndices.map((i) => ({
          clusterId: cluster.id,
          ticketId: tickets[i].id,
          score: cosineSimilarity(vectors[i], centroid),
        })),
      });
      ticketsMapped += ticketIndices.length;
    }

    this.logger.log(`[Clustering] Done: ${clustersCreated} clusters, ${ticketsMapped} tickets mapped`);
    return { clustersCreated, ticketsMapped };
  }

  async correlateWithFeedback(workspaceId: string): Promise<{ linked: number }> {
    this.logger.log(`[ThemeLinkage] Starting for workspace ${workspaceId}`);
    const [clusters, themes] = await Promise.all([
      this.prisma.supportIssueCluster.findMany({
        where: { workspaceId, themeId: null },
        select: { id: true, title: true, description: true },
      }),
      this.prisma.theme.findMany({
        where: { workspaceId },
        select: { id: true, title: true, description: true },
      }),
    ]);
    if (clusters.length === 0 || themes.length === 0) return { linked: 0 };

    const allDocs = [
      ...clusters.map((c) => tokenize(`${c.title} ${c.description ?? ''}`)),
      ...themes.map((t) => tokenize(`${t.title} ${t.description ?? ''}`)),
    ];
    const allVectors = computeTfIdf(allDocs);
    const clusterVectors = allVectors.slice(0, clusters.length);
    const themeVectors = allVectors.slice(clusters.length);

    const LINK_THRESHOLD = 0.15;
    let linked = 0;
    for (let i = 0; i < clusters.length; i++) {
      let bestTheme = -1;
      let bestSim = LINK_THRESHOLD;
      for (let j = 0; j < themes.length; j++) {
        const sim = cosineSimilarity(clusterVectors[i], themeVectors[j]);
        if (sim > bestSim) { bestSim = sim; bestTheme = j; }
      }
      if (bestTheme !== -1) {
        await this.prisma.supportIssueCluster.update({
          where: { id: clusters[i].id },
          data: { themeId: themes[bestTheme].id },
        });
        linked++;
      }
    }
    this.logger.log(`[ThemeLinkage] Linked ${linked} clusters to themes`);
    return { linked };
  }
}
