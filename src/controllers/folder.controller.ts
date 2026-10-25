import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { NotFoundError, UnauthorizedError } from '@/errors/app.error';
import type { AuthRequest } from '@/types';

import type {
  CreateFolderInput,
  UpdateFolderInput,
} from '@/validators/storage.validator';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Response } from 'express';

export const createFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const { name, parentId } = req.body as CreateFolderInput;

  if (parentId) {
    const [parent] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, parentId), eq(folders.userId, req.userId)));

    if (!parent) {
      throw new NotFoundError('Parent folder not found');
    }
  }

  const [newFolder] = await db
    .insert(folders)
    .values({
      name,
      userId: req.userId,
      parentId,
    })
    .returning();

  res.status(201).json({ folder: newFolder });
};

export const getFolders = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const userFolder = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.userId, req.userId),
        isNull(folders.deletedAt),
        isNull(folders.parentId),
      ),
    );

  res.json({ folders: userFolder });
};

export const getFolderContents = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const folderId = String(req.params.id);

  const [folder] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, req.userId),
        isNull(folders.deletedAt),
      ),
    );

  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  const subFolder = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.parentId, folderId),
        eq(folders.userId, req.userId),
        isNull(folders.deletedAt),
      ),
    );

  const folderFiles = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.folderId, folderId),
        eq(files.userId, req.userId),
        isNull(files.deletedAt),
      ),
    );

  res.json({
    folder,
    subFolder,
    files: folderFiles,
  });
};

export const updateFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const id = String(req.params.id);
  const { name } = req.body as UpdateFolderInput;

  const [updated] = await db
    .update(folders)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(folders.id, id),
        eq(folders.userId, req.userId),
        isNull(folders.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new NotFoundError('Folder not found');
  }

  res.json({ folder: updated });
};

export const deleteFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const folderId = String(req.params.id);

  const [folder] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, req.userId),
        isNull(folders.deletedAt),
      ),
    );

  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  const allFolderIds: string[] = [folderId];
  let currentParentIds = [folderId];

  while (currentParentIds.length > 0) {
    const subFolders = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          isNull(folders.deletedAt),
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
    .set({ deletedAt: now, updatedAt: now })
    .where(and(isNull(files.deletedAt), inArray(files.folderId, allFolderIds)));

  await db
    .update(folders)
    .set({ deletedAt: now, updatedAt: now })
    .where(inArray(folders.id, allFolderIds));

  res.json({ message: 'Folders and its content moved to trash' });
};
