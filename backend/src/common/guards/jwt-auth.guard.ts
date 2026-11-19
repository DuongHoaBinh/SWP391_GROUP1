import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool, RowDataPacket } from 'mysql2/promise';
import { getJwtSecret } from '../config/jwt.config';
import { MYSQL_POOL } from '../database/database.module';

interface HttpRequest {
  headers: {
    authorization?: string;
  };
  user?: unknown;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Optional() @Inject(MYSQL_POOL) private readonly pool?: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    let payload: { sub: string | number; email: string; role: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    if (this.pool) {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        'SELECT status FROM `user` WHERE user_id = ? LIMIT 1',
        [Number(payload.sub)],
      );
      if (rows.length === 0 || (rows[0].status && rows[0].status !== 'active')) {
        throw new UnauthorizedException('Tài khoản không còn hoạt động hoặc đã bị tạm khóa');
      }
    }

    request['user'] = {
      id: String(payload.sub),
      email: payload.email,
      role: payload.role,
    };

    return true;
  }

  private extractTokenFromHeader(request: HttpRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
