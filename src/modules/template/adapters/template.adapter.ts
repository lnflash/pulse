import { Injectable, Logger } from '@nestjs/common';
import { TemplatePort, PaymentTemplate } from '../../../core/ports/template.port';
import { UserId } from '../../../core/types';
import { PaymentTemplatesService } from '../../whatsapp/services/payment-templates.service';

@Injectable()
export class TemplateAdapter implements TemplatePort {
  private readonly logger = new Logger(TemplateAdapter.name);

  constructor(private readonly paymentTemplatesService: PaymentTemplatesService) {}

  async listTemplates(userId: UserId): Promise<PaymentTemplate[]> {
    try {
      const templates = await this.paymentTemplatesService.getUserTemplates(userId.toString());
      return templates.map((t) => ({
        name: t.name,
        amount: t.amount,
        recipient: t.recipient,
        memo: t.memo,
        createdAt: t.createdAt,
      }));
    } catch (error) {
      this.logger.error(`Error listing templates for ${userId}: ${error.message}`);
      return [];
    }
  }

  async addTemplate(
    userId: UserId,
    template: Omit<PaymentTemplate, 'createdAt'>,
  ): Promise<PaymentTemplate> {
    try {
      const result = await this.paymentTemplatesService.createTemplate(
        userId.toString(),
        template.name,
        template.amount,
        template.recipient,
        template.memo,
      );

      if (!result.success || !result.template) {
        throw new Error(result.message);
      }

      return {
        name: result.template.name,
        amount: result.template.amount,
        recipient: result.template.recipient,
        memo: result.template.memo,
        createdAt: result.template.createdAt,
      };
    } catch (error) {
      this.logger.error(`Error adding template for ${userId}: ${error.message}`);
      throw error;
    }
  }

  async removeTemplate(userId: UserId, name: string): Promise<boolean> {
    try {
      const result = await this.paymentTemplatesService.deleteTemplate(userId.toString(), name);
      return result.success;
    } catch (error) {
      this.logger.error(`Error removing template for ${userId}: ${error.message}`);
      return false;
    }
  }

  async getTemplate(userId: UserId, name: string): Promise<PaymentTemplate | null> {
    try {
      const template = await this.paymentTemplatesService.getTemplateByName(
        userId.toString(),
        name,
      );
      if (!template) {
        return null;
      }

      return {
        name: template.name,
        amount: template.amount,
        recipient: template.recipient,
        memo: template.memo,
        createdAt: template.createdAt,
      };
    } catch (error) {
      this.logger.error(`Error getting template for ${userId}: ${error.message}`);
      return null;
    }
  }
}
