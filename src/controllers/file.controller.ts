import { BadRequestError, UnauthorizedError } from '@/errors/app.error';

import type { AuthRequest } from '@/types';
import type {
  FileIdParamInput,
  searchFilesQueryInput,
  UploadFileInput,
} from '@/validators/storage.validator';
import * as fileService from '@/services/file.service';
import type { Response } from 'express';

export const uploadFile = async (
  req: AuthRequest<Record<string, never>, unknown, UploadFileInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  if (!req.file) {
    throw new BadRequestError('No file provided');
  }

  const newFile = await fileService.uploadUserFile(
    req.userId,
    req.file,
    req.body.folderId,
  );

  res.status(201).json({ file: newFile });
};

export const getRootFiles = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const files = await fileService.getUserRootFiles(req.userId);

  res.json({ files });
};

export const getFileDownloadUrl = async (
  req: AuthRequest<FileIdParamInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await fileService.getFileDownloadUrl(
    req.userId,
    req.params.id,
  );

  res.json(result);
};

export const deleteFile = async (
  req: AuthRequest<FileIdParamInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await fileService.deleteUserFile(req.userId, req.params.id);

  res.json(result);
};

export const searchFiles = async (
  req: AuthRequest<
    Record<string, never>,
    unknown,
    unknown,
    searchFilesQueryInput
  >,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const query = req.query.query ? req.query.query.trim() : '';

  if (!query) {
    throw new BadRequestError('Search query is required');
  }

  const result = await fileService.searchUserFiles(req.userId, query);
  res.json(result);
};
