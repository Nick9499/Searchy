import type { NextFunction, Request, Response } from 'express';
import z from 'zod';

export const validate =
  (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ errors: z.treeifyError(result.error) });
      return;
    }

    req.body = result.data;
    next();
  };
