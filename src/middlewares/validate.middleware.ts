import { BadRequestError } from '@/errors/app.error';
import type { RequestValidationConfig } from '@/types';
import type { NextFunction, Request, Response } from 'express';
import z from 'zod';

export const validate = (
  schemaOrConfig: z.ZodType | RequestValidationConfig,
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemaOrConfig instanceof z.ZodType) {
        req.body = await schemaOrConfig.parseAsync(req.body);
        next();
        return;
      }

      const config = schemaOrConfig as RequestValidationConfig;

      if (config.params) {
        req.params = (await config.params.parseAsync(req.params)) as Record<
          string,
          string
        >;
      }

      if (config.query) {
        req.query = (await config.query.parseAsync(
          req.query,
        )) as Request['query'];
      }

      if (config.body) {
        req.body = await config.body.parseAsync(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issue = error.issues[0];
        const fieldName = issue.path.join('.');
        const errorMessage = fieldName
          ? `${fieldName}: ${issue.message}`
          : issue.message;

        next(new BadRequestError(errorMessage));
      }
      next(error);
    }
  };
};
