import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { NotFoundError, UnauthorizedError } from '@/errors/app.error';
import { deleteFromS3 } from '@/services/storage.service';
import type { AuthRequest } from '@/types';
import type { RestoreTrashInput } from '@/validators/storage.validator';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Response } from 'express';

export const getTrash = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const trashedFolders = await db
    .select()
    .from(folders)
    .where(and(eq(folders.userId, req.userId), isNotNull(folders.deletedAt)));

  const trashedFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.userId, req.userId), isNotNull(files.deletedAt)));

  res.json({
    folders: trashedFolders,
    files: trashedFiles,
  });
};

export const restoreItem = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const { id, type } = req.body as RestoreTrashInput;

  if (type === 'file') {
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.userId, req.userId),
          eq(files.id, id),
          isNotNull(files.deletedAt),
        ),
      );

    if (!file) {
      throw new NotFoundError('File not found');
    }

    await db
      .update(files)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(files.id, id));

    res.json({ message: 'File restored successfully' });
    return;
  }

  const [folder] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.userId, req.userId),
        isNotNull(folders.deletedAt),
      ),
    );

  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  const allFolderIds: string[] = [id];
  let currentParentIds = [id];

  while (currentParentIds.length > 0) {
    const subFolders = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          isNotNull(folders.deletedAt),
          inArray(folders.parentId, currentParentIds),
        ),
      );

    if (subFolders.length === 0) break;

    const subIds = subFolders.map((f) => f.id);
    allFolderIds.push(...subIds);
    currentParentIds = subIds;
  }

  const now = new Date();

  await db
    .update(files)
    .set({ deletedAt: null, updatedAt: now })
    .where(inArray(files.folderId, allFolderIds));

  await db
    .update(folders)
    .set({ deletedAt: null, updatedAt: now })
    .where(inArray(folders.id, allFolderIds));

  res.json({ message: 'Folders and contents restored successfully' });
};

export const emptyTrash = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const trashedFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.userId, req.userId), isNotNull(files.deletedAt)));

  for (const file of trashedFiles) {
    await deleteFromS3(file.storageKey);
  }

  await db
    .delete(files)
    .where(and(eq(files.userId, req.userId), isNotNull(files.deletedAt)));

  await db
    .delete(folders)
    .where(and(eq(folders.userId, req.userId), isNotNull(folders.deletedAt)));

  res.json({
    message: 'Trash emptied successfully',
    deletedFilesCount: trashedFiles.length,
  });
};
