import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // Get correlation ID from request (if set by interceptor)
        const correlationId = (request as any).correlationId || 'unknown';

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Internal server error';
        let error = 'Internal Server Error';
        let details: any = null;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();
            
            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                const responseObj = exceptionResponse as any;
                message = responseObj.message || exception.message;
                error = responseObj.error || error;
                details = responseObj.details || null;
            }
        } else if (exception instanceof Error) {
            message = exception.message;
            error = exception.name;
            details = exception.stack;
        }

        // Log error with full context
        const errorLog = {
            correlationId,
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            message,
            error,
            details: status >= 500 ? details : undefined, // Only log stack in dev or for 5xx
            userAgent: request.get('user-agent'),
            ip: request.ip,
        };

        if (status >= 500) {
            this.logger.error('Internal Server Error', JSON.stringify(errorLog, null, 2));
        } else {
            this.logger.warn('Client Error', JSON.stringify(errorLog, null, 2));
        }

        // Return structured error response
        const errorResponse = {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method,
            message: Array.isArray(message) ? message : [message],
            error,
            correlationId, // Include correlation ID for tracking
            ...(process.env.NODE_ENV === 'development' && details ? { details } : {}),
        };

        response.status(status).json(errorResponse);
    }
}
