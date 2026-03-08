export type RoadmapStatus = "EXPLORING" | "PLANNED" | "COMMITTED" | "SHIPPED";

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  status: RoadmapStatus;
  targetQuarter: string;
  targetYear: number;
  feedbackCount: number;
}

export type RoadmapBoardData = Record<RoadmapStatus, RoadmapItem[]>;
