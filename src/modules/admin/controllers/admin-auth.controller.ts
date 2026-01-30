import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminAuthService } from '../services/admin-auth.service';
import {
  AdminLoginDto,
  AdminVerifyOtpDto,
  AdminRefreshTokenDto,
  AdminSessionDto,
} from '../dto/admin-auth.dto';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate admin login with phone number' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized phone number' })
  async login(@Body() loginDto: AdminLoginDto) {
    return this.adminAuthService.initiateLogin(loginDto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and create admin session' })
  @ApiResponse({ status: 200, description: 'Session created', type: AdminSessionDto })
  @ApiResponse({ status: 401, description: 'Invalid OTP or session' })
  async verify(@Body() verifyDto: AdminVerifyOtpDto): Promise<AdminSessionDto> {
    return this.adminAuthService.verifyOtp(verifyDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh admin session' })
  @ApiResponse({ status: 200, description: 'Session refreshed', type: AdminSessionDto })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshDto: AdminRefreshTokenDto): Promise<AdminSessionDto> {
    return this.adminAuthService.refreshSession(refreshDto.refreshToken);
  }
}
