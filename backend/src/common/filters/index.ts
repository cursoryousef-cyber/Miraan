import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'حدث خطأ داخلي في الخادم';
    let errors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;

        if (Array.isArray(resp.message)) {
          errors = { validation: resp.message as string[] };
          message = resp.message as any;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;

      // Capacity is enforced by database triggers (RAISE EXCEPTION 'CAPACITY_EXCEEDED: …'),
      // which Prisma surfaces as an *unknown* request error — so it missed the known-error
      // mapping below and left the raw driver text, including the query and absolute source
      // paths, as a 500 body. The trigger already produces the Arabic sentence to show, so
      // it is lifted out and returned as the conflict this actually is; callers could not
      // otherwise tell a full department from a broken server.
      const capacityMatch = /CAPACITY_EXCEEDED:\s*([^\n"\\]+)/.exec(message);
      if (capacityMatch) {
        status = HttpStatus.CONFLICT;
        message = capacityMatch[1].trim();
      } else if (exception.constructor.name === 'PrismaClientKnownRequestError') {
        const prismaError = exception as unknown as { code: string; meta?: Record<string, unknown> };
        switch (prismaError.code) {
          case 'P2002': {
            status = HttpStatus.CONFLICT;
            const target = Array.isArray(prismaError.meta?.target)
              ? (prismaError.meta?.target as string[]).join(', ')
              : String(prismaError.meta?.target || '');

            if (target.includes('email')) {
              message = 'البريد الإلكتروني مسجل بحساب آخر مسبقاً';
            } else if (target.includes('national_id') || target.includes('nationalId')) {
              message = 'رقم الهوية الوطنية مسجل لشخص آخر مسبقاً';
            } else if (target.includes('username')) {
              message = 'اسم المستخدم مسجل مسبقاً';
            } else {
              message = 'بيانات الحساب متعارضة مع سجل آخر موجود مسبقاً';
            }
            break;
          }
          case 'P2025':
            status = HttpStatus.NOT_FOUND;
            message = 'السجل غير موجود';
            break;
          case 'P2003':
            status = HttpStatus.BAD_REQUEST;
            message = 'مرجع غير صالح — السجل المطلوب غير موجود';
            break;
          default:
            status = HttpStatus.BAD_REQUEST;
            message = 'خطأ في قاعدة البيانات';
        }
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Exception:', exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }
}
