import { DigestSettingsData } from "./types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shared/ui/card";
import { Label } from "@/components/shared/ui/label";
import { Switch } from "@/components/shared/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shared/ui/select";
import { Input } from "@/components/shared/ui/input";
import { Button } from "@/components/shared/ui/button";

interface DigestSettingsProps {
  settings: DigestSettingsData;
  onSave: (newSettings: DigestSettingsData) => void;
}

export function DigestSettings({ settings, onSave }: DigestSettingsProps) {
  // This would be a form with react-hook-form in a real app
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Digest</CardTitle>
        <CardDescription>Configure automated email summaries of new feedback.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <Label htmlFor="digest-enabled">Enable Digest</Label>
          <Switch id="digest-enabled" checked={settings.isEnabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="frequency">Frequency</Label>
          <Select defaultValue={settings.frequency}>
            <SelectTrigger id="frequency">
              <SelectValue placeholder="Select frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recipients">Recipients</Label>
          <Input id="recipients" placeholder="comma, separated, emails" defaultValue={settings.recipientEmails.join(', ')} />
        </div>
        <Button onClick={() => onSave(settings)}>Save Settings</Button>
      </CardContent>
    </Card>
  );
}
