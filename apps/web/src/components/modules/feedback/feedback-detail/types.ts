export interface FeedbackDetailData {
  id: string;
  title: string;
  description: string;
  source: string;
  status: string;
  customer: {
    id: string;
    name: string;
    arr: number;
  };
  attachments: { id: string; fileName: string; url: string }[];
  createdAt: Date;
}
