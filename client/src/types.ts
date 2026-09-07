export const CONTACT_STATUSES = ["lead", "active", "won", "churned"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export interface Contact {
  id: number;
  name: string;
  email: string;
  company: string;
  phone: string;
  status: ContactStatus;
  value: number;
  notes: string;
  createdAt: string;
  lastContactedAt: string | null;
}

export interface Stats {
  total: number;
  byStatus: Record<ContactStatus, number>;
  pipelineValue: number;
}

export interface ContactInput {
  name: string;
  email: string;
  company: string;
  phone: string;
  status: ContactStatus;
  value: number;
  notes: string;
}
