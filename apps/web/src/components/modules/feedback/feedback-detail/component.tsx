import { FeedbackDetailData } from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Badge } from "@/components/shared/ui/badge";
import { Button } from "@/components/shared/ui/button";
import { Separator } from "@/components/shared/ui/separator";
import { Paperclip } from "lucide-react";

interface FeedbackDetailProps {
  data: FeedbackDetailData;
}

export function FeedbackDetail({ data }: FeedbackDetailProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{data.title}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{data.status}</Badge>
          <Button size="sm">Create Theme</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-muted-foreground">{data.description}</p>
          <Separator />
          <div className="grid grid-cols-2 gap-4 text-sm">
            {data.customer && (
              <>
                <div>
                  <p className="font-medium">Customer</p>
                  <p>{data.customer.name}</p>
                </div>
                <div>
                  <p className="font-medium">ARR</p>
                  <p>${data.customer.arr.toLocaleString()}</p>
                </div>
              </>
            )}
            <div>
              <p className="font-medium">Source</p>
              <p>{data.sourceType}</p>
            </div>
            <div>
              <p className="font-medium">Received</p>
              <p>{new Date(data.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
          {data.attachments && data.attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium">Attachments</h4>
                <ul className="mt-2 space-y-2">
                  {data.attachments.map((att) => (
                    <li key={att.id}>
                      {/* Presigned URL endpoint not yet implemented in the backend.
                          Rendered as plain text until the backend exposes a download URL. */}
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Paperclip className="h-4 w-4" />
                        {att.fileName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
