import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
  Query as _Query,
  Body,
  Param,
  Delete,
} from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppWebService } from '../services/whatsapp-web.service';
import { SendTestMessageDto } from '../dto/send-test-message.dto';

@Controller('whatsapp-web')
export class WhatsAppWebController {
  private readonly logger = new Logger(WhatsAppWebController.name);

  constructor(private readonly whatsAppWebService: WhatsAppWebService) {}

  /**
   * Get WhatsApp Web status for all instances
   */
  @Get('status')
  @HttpCode(HttpStatus.OK)
  getStatus() {
    const status = this.whatsAppWebService.getStatus();
    const metrics = this.whatsAppWebService.getMetrics();

    return {
      status: metrics.ready > 0 ? 'connected' : 'disconnected',
      ready: metrics.ready > 0,
      instances: status.instances,
      metrics: metrics,
      service: 'Pulse - WhatsApp Web.js Multi-Instance',
    };
  }

  /**
   * Get status for a specific instance
   */
  @Get('instances/:phoneNumber/status')
  @HttpCode(HttpStatus.OK)
  getInstanceStatus(@Param('phoneNumber') phoneNumber: string) {
    const status = this.whatsAppWebService.getInstanceStatus(phoneNumber);

    return {
      phoneNumber,
      ...status,
    };
  }

  /**
   * Get QR codes for all instances
   */
  @Get('qr')
  async getQRCode(@Res() res: Response) {
    try {
      const qrCodes = await this.whatsAppWebService.getAllQRCodes();
      const pendingInstances = qrCodes.filter((item) => item.qrCode !== null);

      if (pendingInstances.length === 0) {
        return res.status(200).json({
          status: 'all_authenticated',
          message: 'All WhatsApp instances are authenticated',
          instances: qrCodes,
        });
      }

      // Generate QR code images for pending instances
      const qrData = pendingInstances.map((item) => ({
        phoneNumber: item.phoneNumber,
        qrCode: item.qrCode,
        qrImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(item.qrCode || '')}`,
      }));

      return res.status(200).json({
        status: 'pending_authentication',
        message: 'Scan QR codes with WhatsApp',
        instances: qrData,
      });
    } catch (error) {
      this.logger.error('Error getting QR codes:', error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to generate QR codes',
      });
    }
  }

  /**
   * Get QR code for a specific instance
   */
  @Get('instances/:phoneNumber/qr')
  async getInstanceQRCode(@Param('phoneNumber') phoneNumber: string, @Res() res: Response) {
    try {
      const qrCode = await this.whatsAppWebService.getQRCode(phoneNumber);

      if (!qrCode) {
        return res.status(200).json({
          status: 'already_authenticated',
          message: 'WhatsApp instance is already authenticated',
          phoneNumber,
        });
      }

      // Generate QR code image using a service
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`;

      return res.status(200).json({
        status: 'pending_authentication',
        phoneNumber,
        qrCode: qrCode,
        qrImageUrl: qrImageUrl,
        message: 'Scan this QR code with WhatsApp',
      });
    } catch (error) {
      this.logger.error(`Error getting QR code for instance ${phoneNumber}:`, error);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to generate QR code',
      });
    }
  }

  /**
   * Logout all instances
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    try {
      await this.whatsAppWebService.logout();
      return {
        status: 'success',
        message: 'All instances logged out successfully',
      };
    } catch (error) {
      this.logger.error('Error during logout:', error);
      return {
        status: 'error',
        message: 'Failed to logout',
      };
    }
  }

  /**
   * Logout a specific instance
   */
  @Post('instances/:phoneNumber/logout')
  @HttpCode(HttpStatus.OK)
  async logoutInstance(@Param('phoneNumber') phoneNumber: string) {
    try {
      await this.whatsAppWebService.disconnect(phoneNumber, true);
      return {
        status: 'success',
        message: `Instance ${phoneNumber} logged out successfully`,
      };
    } catch (error) {
      this.logger.error(`Error during logout of instance ${phoneNumber}:`, error);
      return {
        status: 'error',
        message: 'Failed to logout instance',
      };
    }
  }

  /**
   * Restart a specific instance
   */
  @Post('instances/:phoneNumber/restart')
  @HttpCode(HttpStatus.OK)
  async restartInstance(@Param('phoneNumber') phoneNumber: string) {
    try {
      await this.whatsAppWebService.restartInstance(phoneNumber);
      return {
        status: 'success',
        message: `Instance ${phoneNumber} restarted successfully`,
      };
    } catch (error) {
      this.logger.error(`Error restarting instance ${phoneNumber}:`, error);
      return {
        status: 'error',
        message: 'Failed to restart instance',
      };
    }
  }

  /**
   * Clear session for a specific instance
   */
  @Delete('instances/:phoneNumber/session')
  @HttpCode(HttpStatus.OK)
  async clearInstanceSession(@Param('phoneNumber') phoneNumber: string) {
    try {
      await this.whatsAppWebService.clearSession(phoneNumber);
      return {
        status: 'success',
        message: `Session cleared for instance ${phoneNumber}`,
      };
    } catch (error) {
      this.logger.error(`Error clearing session for instance ${phoneNumber}:`, error);
      return {
        status: 'error',
        message: 'Failed to clear session',
      };
    }
  }

  /**
   * Send a test message
   */
  @Post('test-message')
  @HttpCode(HttpStatus.OK)
  async sendTestMessage(@Body() dto: SendTestMessageDto & { instancePhone?: string }) {
    try {
      // Remove any non-numeric characters from phone number
      const phoneNumber = dto.to.replace(/\D/g, '');

      await this.whatsAppWebService.sendMessage(
        phoneNumber,
        dto.message || 'Hello from Pulse!',
        undefined,
        dto.instancePhone,
      );

      return {
        status: 'success',
        message: 'Test message sent successfully',
        to: phoneNumber,
        instance: dto.instancePhone || 'auto-selected',
      };
    } catch (error) {
      this.logger.error('Error sending test message:', error);
      return {
        status: 'error',
        message: error.message || 'Failed to send test message',
      };
    }
  }

  /**
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return {
      status: 'ok',
      service: 'Pulse WhatsApp Web.js Prototype',
      timestamp: new Date().toISOString(),
      ready: this.whatsAppWebService.isClientReady(),
    };
  }
}
