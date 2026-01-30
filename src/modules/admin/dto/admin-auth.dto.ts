import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminLoginDto {
  @ApiProperty({
    description: 'Admin phone number',
    example: '+1234567890',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Invalid phone number format',
  })
  phoneNumber: string;
}

export class AdminVerifyOtpDto {
  @ApiProperty({
    description: 'Temporary session ID from login',
  })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({
    description: 'OTP verification code',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp: string;
}

export class AdminRefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AdminSessionDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty()
  phoneNumber: string;

  @ApiProperty()
  sessionId: string;
}
