import { Theme } from "@/lib/api-types";

// This can be a subset of the full Theme type, plus any related data needed for the view.
export interface ThemeClusterData extends Theme {
  feedbackCount: number;
  customerCount: number;
  priorityScore: number;
}
