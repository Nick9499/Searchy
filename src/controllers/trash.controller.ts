import { UnauthorizedError } from '@/errors/app.error';
import type { AuthRequest } from '@/types';
import type { RestoreTrashInput } from '@/validators/storage.validator';
import * as trashService from '@/services/trash.service';
import type { Response } from 'express';

export const getTrash = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const trash = await trashService.getUserTrash(req.userId);
  res.json(trash);
};

export const restoreItem = async (
  req: AuthRequest<Record<string, never>, unknown, RestoreTrashInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await trashService.restoreTrashItem(req.userId, req.body);
  res.json(result);
};

export const emptyTrash = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await trashService.emptyUserTrash(req.userId);
  res.json(result);
};
