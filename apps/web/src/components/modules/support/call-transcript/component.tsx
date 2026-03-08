import { CallTranscriptData, TranscriptSegment } from "./types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { ScrollArea } from "@/components/shared/ui/scroll-area";
import { cn } from "@/lib/utils";

function formatTimestamp(seconds: number) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

interface CallTranscriptProps {
  transcript: CallTranscriptData;
}

export function CallTranscript({ transcript }: CallTranscriptProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{transcript.title}</CardTitle>
        <CardDescription>{transcript.summary}</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] border rounded-md p-4">
          <div className="space-y-4">
            {transcript.segments.map((segment, i) => (
              <div key={i} className="flex gap-3">
                <div className="text-xs text-muted-foreground w-12 text-right pt-1">
                  {formatTimestamp(segment.timestamp)}
                </div>
                <div className={cn(
                  "flex-1 rounded-lg p-3",
                  segment.speaker === 'Agent' ? "bg-muted" : "bg-primary/10"
                )}>
                  <p className="text-sm">{segment.text}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
