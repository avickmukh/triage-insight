import { InboxItem } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Badge } from "@/components/shared/ui/badge";
import { cn } from "@/lib/utils";

interface InboxListProps {
  items: InboxItem[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
}

export function InboxList({ items, selectedItemId, onSelectItem }: InboxListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbox</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={cn(
                "w-full text-left p-4 hover:bg-muted/50",
                item.id === selectedItemId && "bg-muted"
              )}
            >
              <div className="flex items-start gap-4">
                {!item.isRead && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-primary" />
                )}
                <div className={cn("flex-1", item.isRead && "pl-4")}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{item.customerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground truncate">{item.summary}</p>
                  <Badge variant="outline" className="mt-2">{item.source}</Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
