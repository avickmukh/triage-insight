import { RootCauseAnalysisData } from "./types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shared/ui/table";

interface RootCauseAnalysisProps {
  analysis: RootCauseAnalysisData;
}

export function RootCauseAnalysis({ analysis }: RootCauseAnalysisProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Root Cause Analysis</CardTitle>
        <CardDescription>AI-generated summary of factors contributing to churn risk.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Contributing Factor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analysis.causes.map((cause, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{cause.category}</TableCell>
                <TableCell>{cause.description}</TableCell>
                <TableCell className="text-right">{(cause.contributingFactor * 100).toFixed(0)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
