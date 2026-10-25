import { db } from '@/db';
import { files, folders } from '@/db/schema';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from '@/errors/app.error';

import {
  getPresignedDownloadUrl,
  uploadToS3,
} from '@/services/storage.service';
import type { AuthRequest } from '@/types';
import type { UploadFileInput } from '@/validators/storage.validator';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import type { Response } from 'express';

export const uploadFile = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  if (!req.file) {
    throw new BadRequestError('No file provided');
  }

  const body = req.body as UploadFileInput;
  const folderId = body.folderId || null;

  if (folderId) {
    const [folder] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, folderId), eq(folders.userId, req.userId)));

    if (!folder) {
      throw new NotFoundError('Folder not found');
    }
  }

  const fileUuid = crypto.randomUUID();
  const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storageKey = `uploads/${req.userId}/${fileUuid}-${safeFileName}`;

  await uploadToS3({
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    key: storageKey,
  });

  const [newFile] = await db
    .insert(files)
    .values({
      mimeType: req.file.mimetype,
      name: req.file.originalname,
      size: req.file.size,
      storageKey,
      userId: req.userId,
      folderId,
    })
    .returning();

  res.status(201).json({ file: newFile });
};

export const getRootFiles = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const rootFiles = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, req.userId),
        isNull(files.folderId),
        isNull(files.deletedAt),
      ),
    );

  res.json({ files: rootFiles });
};

export const getFileDownloadUrl = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const id = String(req.params.id);

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, id),
        eq(files.userId, req.userId),
        isNull(files.deletedAt),
      ),
    );

  if (!file) {
    throw new NotFoundError('File not found');
  }

  const downloadUrl = await getPresignedDownloadUrl(file.storageKey);

  res.json({ file, downloadUrl });
};

export const deleteFile = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const fileId = String(req.params.id);

  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.userId, req.userId),
        isNull(files.deletedAt),
      ),
    );

  if (!file) {
    throw new NotFoundError('File not found');
  }

  await db
    .update(files)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(files.id, fileId));

  res.json({ message: 'File moved to trash' });
};

export const searchFiles = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const query =
    typeof req.query.query === 'string' ? req.query.query.trim() : '';

  if (!query) {
    throw new BadRequestError('Search query is required');
  }

  const matchedFiles = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, req.userId),
        ilike(files.name, `%${query}%`),
        isNull(files.deletedAt),
      ),
    );

  res.json({ files: matchedFiles, count: matchedFiles.length });
};
