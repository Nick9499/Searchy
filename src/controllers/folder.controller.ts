import { UnauthorizedError } from '@/errors/app.error';
import type { AuthRequest } from '@/types';

import type {
  CreateFolderInput,
  FolderIdParamInput,
  UpdateFolderInput,
} from '@/validators/storage.validator';
import * as folderService from '@/services/folder.service';
import type { Response } from 'express';

export const createFolder = async (
  req: AuthRequest<Record<string, never>, unknown, CreateFolderInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const folder = await folderService.createFolder(req.userId, req.body);
  res.status(201).json({ folder });
};

export const getFolders = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const folders = await folderService.getUserRootFolder(req.userId);
  res.json({ folders });
};

export const getFolderContents = async (
  req: AuthRequest<FolderIdParamInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const content = await folderService.getFolderContents(
    req.userId,
    req.params.id,
  );
  res.json(content);
};

export const updateFolder = async (
  req: AuthRequest<FolderIdParamInput, unknown, UpdateFolderInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const folder = await folderService.updateFolder(
    req.userId,
    req.params.id,
    req.body,
  );

  res.json({ folder });
};

export const deleteFolder = async (
  req: AuthRequest<FolderIdParamInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await folderService.deleteFolder(req.userId, req.params.id);
  res.json(result);
};
