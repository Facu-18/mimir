import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { isDatabaseUnavailableError } from './database-errors.js';

/**
 * Turns "database unreachable" failures into a uniform 503 so the desktop
 * shell can tell the user the database is down; any other Prisma error
 * keeps Nest's default handling.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
)
export class DatabaseUnavailableFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (!isDatabaseUnavailableError(exception)) {
      super.catch(exception, host);
      return;
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: 'Service Unavailable',
        message: 'Database unavailable',
      });
  }
}
