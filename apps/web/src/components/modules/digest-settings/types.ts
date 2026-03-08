export interface DigestSettingsData {
  isEnabled: boolean;
  frequency: 'daily' | 'weekly';
  recipientEmails: string[];
}
