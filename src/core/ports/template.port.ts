import { UserId } from '../types';

export interface PaymentTemplate {
  name: string;
  amount: number;
  recipient: string;
  memo?: string;
  createdAt: Date;
}

export interface TemplatePort {
  listTemplates(userId: UserId): Promise<PaymentTemplate[]>;
  addTemplate(
    userId: UserId,
    template: Omit<PaymentTemplate, 'createdAt'>,
  ): Promise<PaymentTemplate>;
  removeTemplate(userId: UserId, name: string): Promise<boolean>;
  getTemplate(userId: UserId, name: string): Promise<PaymentTemplate | null>;
}
