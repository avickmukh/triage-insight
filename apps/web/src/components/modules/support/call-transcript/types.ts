export interface TranscriptSegment {
  speaker: 'Agent' | 'Customer';
  timestamp: number; // in seconds
  text: string;
}

export interface CallTranscriptData {
  id: string;
  title: string;
  summary: string;
  segments: TranscriptSegment[];
}
