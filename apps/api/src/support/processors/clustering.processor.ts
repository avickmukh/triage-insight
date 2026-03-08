import { Processor, Process } from "@nestjs/bull";
import type { Job } from "bull";
import { ClusteringService } from "../services/clustering.service";

interface ClusteringJobData {
  workspaceId: string;
}

@Processor("support-clustering")
export class ClusteringProcessor {
  constructor(private readonly clusteringService: ClusteringService) {}

  @Process()
  async handleClustering(job: Job<ClusteringJobData>) {
    const { workspaceId } = job.data;
    await this.clusteringService.clusterTickets(workspaceId);
    await this.clusteringService.correlateWithFeedback(workspaceId);
  }
}
