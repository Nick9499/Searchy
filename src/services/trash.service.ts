import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { deleteFromS3 } from './storage.service';
import type { RestoreTrashInput } from '@/validators/storage.validator';
import { NotFoundError } from '@/errors/app.error';

export const getUserTrash = async (userId: string) => {
  const trashedFolders = await db
    .select()
    .from(folders)
    .where(and(eq(folders.userId, userId), isNotNull(folders.deletedAt)));

  const trashedFiles = await db
    .select()
    .from(files)
    .where(and(eq(files.userId, userId), isNotNull(files.deletedAt)));

  return {
    trashedFolders,
    trashedFiles,
  };
};

export const restoreTrashItem = async (
  userId: string,
  input: RestoreTrashInput,
) => {
  const { id, type } = input;

  if (type === 'file') {
    const [file] = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(
          eq(files.id, id),
          eq(files.userId, userId),
          isNotNull(files.deletedAt),
        ),
      )
      .limit(1);

    if (!file) {
      throw new NotFoundError('file not found');
    }

    await db
      .update(files)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(files.id, id));

    return { message: 'File restored successfully' };
  }

  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.userId, userId),
        isNotNull(folders.deletedAt),
      ),
    )
    .limit(1);

  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  const allFolderIds: string[] = [id];
  let currentParentIds = [id];

  while (currentParentIds.length > 1) {
    const subFolder = await db
      .select()
      .from(folders)
      .where(
        and(
          isNotNull(folders.deletedAt),
          inArray(folders.parentId, currentParentIds),
        ),
      );

    if (subFolder.length === 0) break;

    const subIds = subFolder.map((s) => s.id);
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

  return { message: 'Folder and contents restored successfully' };
};

export const emptyUserTrash = async (userId: string) => {
  const trashedFiles = await db
    .select({ storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.userId, userId), isNotNull(files.deletedAt)));

  await Promise.allSettled(
    trashedFiles.map((file) => deleteFromS3(file.storageKey)),
  );

  await db
    .delete(files)
    .where(and(eq(files.userId, userId), isNotNull(files.deletedAt)));

  await db
    .delete(folders)
    .where(and(eq(folders.userId, userId), isNotNull(folders.deletedAt)));

  return {
    message: 'Trash emptied successfully',
    deleteFileCount: trashedFiles.length,
  };
};
