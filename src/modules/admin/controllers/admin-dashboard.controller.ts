import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminJwtGuard } from '../guards/admin-jwt.guard';
import { AdminDashboardService, BroadcastRequest } from '../services/admin-dashboard.service';
import { FeatureFlagsService } from '../services/feature-flags.service';

@ApiTags('admin-dashboard')
@Controller('admin')
@UseGuards(AdminJwtGuard)
@ApiBearerAuth()
export class AdminDashboardController {
  constructor(
    private readonly dashboardService: AdminDashboardService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get system status' })
  @ApiResponse({ status: 200, description: 'System status retrieved' })
  async getStatus() {
    return this.dashboardService.getSystemStatus();
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Lookup user by ID' })
  @ApiResponse({ status: 200, description: 'User info retrieved' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserInfo(@Param('userId') userId: string) {
    return this.dashboardService.getUserInfo(userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get message statistics' })
  @ApiResponse({ status: 200, description: 'Message stats retrieved' })
  async getStats() {
    return this.dashboardService.getMessageStats();
  }

  @Post('broadcast')
  @ApiOperation({ summary: 'Broadcast message to users' })
  @ApiResponse({ status: 200, description: 'Broadcast sent' })
  async broadcast(@Body() request: BroadcastRequest) {
    return this.dashboardService.broadcastMessage(request);
  }

  @Get('features')
  @ApiOperation({ summary: 'Get all feature flags' })
  @ApiResponse({ status: 200, description: 'Feature flags retrieved' })
  async getFeatures() {
    return this.featureFlagsService.getAllFeatureFlags();
  }

  @Put('features/:name')
  @ApiOperation({ summary: 'Update feature flag' })
  @ApiResponse({ status: 200, description: 'Feature flag updated' })
  async updateFeature(@Param('name') name: string, @Body() body: { enabled: boolean }) {
    await this.featureFlagsService.setFeatureFlag(name, body.enabled);
    return { name, enabled: body.enabled };
  }
}
