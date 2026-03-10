import { RoadmapItem as ApiRoadmapItem, RoadmapStatus } from "@/lib/api-types";

// Extend the API type if you need additional client-side properties
export interface RoadmapItem extends ApiRoadmapItem {}

export { RoadmapStatus }; // Re-export the enum for use in components

export type RoadmapBoardData = Record<RoadmapStatus, RoadmapItem[]>;
