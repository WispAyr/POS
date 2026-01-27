import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
    Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(LoggingInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<Request>();
        const { method, url, body, query, params } = request;
        
        // Generate correlation ID if not present
        const correlationId = (request.headers['x-correlation-id'] as string) || uuidv4();
        (request as any).correlationId = correlationId;

        const startTime = Date.now();
        const userAgent = request.get('user-agent') || '';
        const ip = request.ip || request.connection.remoteAddress;

        // Log request
        this.logger.log(
            `→ ${method} ${url} [${correlationId}] - IP: ${ip}`
        );

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const duration = Date.now() - startTime;
                    this.logger.log(
                        `← ${method} ${url} [${correlationId}] ${duration}ms - 200 OK`
                    );
                },
                error: (error) => {
                    const duration = Date.now() - startTime;
                    const status = error?.status || 500;
                    this.logger.error(
                        `✗ ${method} ${url} [${correlationId}] ${duration}ms - ${status} ${error?.message || 'Error'}`
                    );
                },
            })
        );
    }
}
