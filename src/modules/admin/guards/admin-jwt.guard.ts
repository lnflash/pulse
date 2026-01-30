import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminAuthService } from '../services/admin-auth.service';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const payload = await this.adminAuthService.validateToken(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = payload;
    return true;
  }
}
