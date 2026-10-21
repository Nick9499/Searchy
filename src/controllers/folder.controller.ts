import { db } from '@/db';
import { files, folders } from '@/db/schema';
import type { AuthRequest } from '@/middlewares/auth.middleware';
import { deleteFromS3 } from '@/services/storage.service';
import type {
  CreateFolderInput,
  UpdateFolderInput,
} from '@/validators/storage.validator';
import { and, eq } from 'drizzle-orm';
import type { Response } from 'express';

export const createFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const { name, parentId } = req.body as CreateFolderInput;

  if (parentId) {
    const [parent] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, parentId), eq(folders.userId, req.userId)));

    if (!parent) {
      res.status(404).json({ message: 'Parent folder not found' });
      return;
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
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const userFolder = await db
    .select()
    .from(folders)
    .where(eq(folders.userId, req.userId));

  res.json({ folders: userFolder });
};

export const getFolderContents = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  const id = String(req.params.id);

  const [folder] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, req.userId)));

  if (!folder) {
    res.status(404).json({ message: 'Folder not found' });
    return;
  }

  const subFolder = await db
    .select()
    .from(folders)
    .where(and(eq(folders.parentId, id), eq(folders.userId, req.userId)));

  const folderFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, id), eq(files.userId, req.userId)));

  res.json({
    folder,
    subFolder,
    files: folderFiles,
  });
};

export const updateFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorize' });
    return;
  }

  const id = String(req.params.id);
  const { name } = req.body as UpdateFolderInput;

  const [updated] = await db
    .update(folders)
    .set({
      name,
      updatedAt: new Date(),
    })
    .where(and(eq(folders.id, id), eq(folders.userId, req.userId)))
    .returning();

  if (!updated) {
    res.status(404).json('Folder not found');
    return;
  }

  res.json({ folder: updated });
};

export const deleteFolder = async (req: AuthRequest, res: Response) => {
  if (!req.userId) {
    res.status(401).json({ message: 'Unauthorize' });
    return;
  }

  const id = String(req.params.id);

  const filesToDelete = await db
    .select()
    .from(files)
    .where(and(eq(files.folderId, id), eq(files.userId, req.userId)));

  await Promise.all(filesToDelete.map((f) => deleteFromS3(f.storageKey)));

  const [deleted] = await db
    .delete(folders)
    .where(and(eq(folders.id, id), eq(folders.userId, req.userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ message: 'Folder not found' });
    return;
  }

  res.json({ message: 'Folders and its content deleted successfully' });
};
