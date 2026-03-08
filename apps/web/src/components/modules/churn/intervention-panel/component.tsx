import { InterventionPanelData } from "./types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/shared/ui/accordion";
import { Badge } from "@/components/shared/ui/badge";

interface InterventionPanelProps {
  panel: InterventionPanelData;
}

export function InterventionPanel({ panel }: InterventionPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Intervention Suggestions</CardTitle>
        <CardDescription>Recommended actions to mitigate churn risk.</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {panel.suggestions.map(suggestion => (
            <AccordionItem key={suggestion.id} value={suggestion.id}>
              <AccordionTrigger>{suggestion.title}</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <p>{suggestion.description}</p>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <p className="font-medium">Impact</p>
                      <Badge variant="outline">{suggestion.impact}</Badge>
                    </div>
                    <div>
                      <p className="font-medium">Effort</p>
                      <Badge variant="outline">{suggestion.effort}</Badge>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
