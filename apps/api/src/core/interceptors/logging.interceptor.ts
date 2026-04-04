import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

/**
 * LoggingInterceptor
 *
 * Emits a structured JSON log line for every HTTP request processed by the API.
 * Uses NestJS's built-in Logger so output integrates with the standard
 * NestJS logging pipeline.
 *
 * Each log line includes:
 *   - method:      HTTP verb (GET, POST, etc.)
 *   - path:        Request URL path (without query string)
 *   - statusCode:  HTTP response status code
 *   - durationMs:  Time from request receipt to response send
 *   - workspaceId: Extracted from the JWT payload if present (for tracing)
 *   - userId:      Extracted from the JWT payload if present
 *
 * Sensitive fields (request body, Authorization header) are never logged.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { userId?: string; workspaceId?: string };
    }>();

    const method = request.method;
    // Strip query string from the path to avoid logging sensitive query params
    const path = request.url.split('?')[0];
    const userId = request.user?.userId;
    const workspaceId = request.user?.workspaceId;

    return next.handle().pipe(
      tap(() => {
        const response = context
          .switchToHttp()
          .getResponse<{ statusCode: number }>();
        const durationMs = Date.now() - startedAt;
        this.logger.log(
          JSON.stringify({
            method,
            path,
            statusCode: response.statusCode,
            durationMs,
            ...(userId && { userId }),
            ...(workspaceId && { workspaceId }),
          }),
        );
      }),
      catchError((err: unknown) => {
        const durationMs = Date.now() - startedAt;
        const statusCode =
          err && typeof err === 'object' && 'status' in err
            ? (err as { status: number }).status
            : 500;
        this.logger.error(
          JSON.stringify({
            method,
            path,
            statusCode,
            durationMs,
            error: err instanceof Error ? err.message : String(err),
            ...(userId && { userId }),
            ...(workspaceId && { workspaceId }),
          }),
        );
        return throwError(() => err);
      }),
    );
  }
}
