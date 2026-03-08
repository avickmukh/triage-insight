import { Processor, Process } from "@nestjs/bull";
import type { Job } from "bull";
import { SpikeDetectionService } from "../services/spike-detection.service";

interface SpikeDetectionJobData {
  workspaceId: string;
}

@Processor("support-spike-detection")
export class SpikeDetectionProcessor {
  constructor(private readonly spikeDetectionService: SpikeDetectionService) {}

  @Process()
  async handleSpikeDetection(job: Job<SpikeDetectionJobData>) {
    const { workspaceId } = job.data;
    await this.spikeDetectionService.detectSpikes(workspaceId);
  }
}
