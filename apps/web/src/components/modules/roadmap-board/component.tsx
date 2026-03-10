import { RoadmapBoardData, RoadmapItem, RoadmapStatus } from "./types";
import { Card, CardContent } from "@/components/shared/ui/card";

interface RoadmapColumnProps {
  title: string;
  items: RoadmapItem[];
}

function RoadmapCard({ item }: { item: RoadmapItem }) {
  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <h4 className="font-semibold">{item.title}</h4>
        {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
        <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
          <span>{item.targetQuarter} {item.targetYear}</span>
          <span>{item.feedbackCount} pieces</span>
        </div>
      </CardContent>
    </Card>
  );
}

function RoadmapColumn({ title, items }: RoadmapColumnProps) {
  return (
    <div className="flex-1">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="bg-muted/50 rounded-lg p-4 h-full">
        {items.map(item => <RoadmapCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

interface RoadmapBoardProps {
  data: RoadmapBoardData;
}

const STATUS_MAP: Record<RoadmapStatus, string> = {
  [RoadmapStatus.EXPLORING]: "Exploring",
  [RoadmapStatus.PLANNED]: "Planned",
  [RoadmapStatus.COMMITTED]: "Committed",
  [RoadmapStatus.SHIPPED]: "Shipped",
  [RoadmapStatus.BACKLOG]: "Backlog",
};

export function RoadmapBoard({ data }: RoadmapBoardProps) {
  return (
    <div className="flex gap-8">
      {(Object.keys(data) as RoadmapStatus[]).map(status => (
        <RoadmapColumn key={status} title={STATUS_MAP[status]} items={data[status]} />
      ))}
    </div>
  );
}
