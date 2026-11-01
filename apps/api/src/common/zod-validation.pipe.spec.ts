import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.strictObject({
  name: z.string().trim().min(1, { error: 'Name is required' }),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value', () => {
    expect(
      new ZodValidationPipe(schema).transform({ name: ' Mimir ' }),
    ).toEqual({
      name: 'Mimir',
    });
  });

  it('throws 400 listing every issue with its path', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ name: '' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: [{ path: 'name', message: 'Name is required' }],
      });
    }
  });
});
