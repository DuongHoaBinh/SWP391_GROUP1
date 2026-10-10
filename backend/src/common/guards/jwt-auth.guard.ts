import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface HttpRequest {
  headers: {
    authorization?: string;
  };
  user?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    // Allow seamless role-switching in development mode with mock tokens
    if (token.startsWith('mock-jwt-token-')) {
      const roleKey = token.replace('mock-jwt-token-', '').toLowerCase();
      const mockProfiles: Record<string, { id: string; email: string; role: string }> = {
        manager: { id: '2', email: 'manager@example.com', role: 'LOGISTICS_MANAGER' },
        specialist: { id: '3', email: 'specialist@example.com', role: 'TRANSPORT_SPECIALIST' },
        coordinator: { id: '4', email: 'coordinator@example.com', role: 'FLEET_ROUTE_COORDINATOR' },
        driver: { id: '5', email: 'driver@example.com', role: 'DRIVER_ESCORT' },
        customer: { id: '6', email: 'customer@example.com', role: 'CUSTOMER' },
      };

      const matched = mockProfiles[roleKey] || mockProfiles.customer;
      request['user'] = matched;
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET ?? 'development-only-secret',
      });
      request['user'] = {
        id: String(payload.sub),
        email: payload.email,
        role: payload.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    return true;
  }

  private extractTokenFromHeader(request: HttpRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
