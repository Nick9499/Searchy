import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { NotFoundError } from '@/errors/app.error';
import type {
  CreateFolderInput,
  UpdateFolderInput,
} from '@/validators/storage.validator';
import { and, eq, inArray, isNull } from 'drizzle-orm';

export const createFolder = async (
  userId: string,
  input: CreateFolderInput,
) => {
  const { name, parentId } = input;

  if (parentId) {
    const [parent] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, parentId), eq(folders.userId, userId)))
      .limit(1);

    if (!parent) {
      throw new NotFoundError('Parent folder not found');
    }
  }

  const [newFolder] = await db
    .insert(folders)
    .values({
      name,
      userId,
      parentId,
    })
    .returning();

  return newFolder;
};

export const getUserRootFolder = async (userId: string) => {
  return db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
        isNull(folders.parentId),
      ),
    );
};

export const getFolderContents = async (userId: string, folderId: string) => {
  const [folder] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, userId),
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
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    );

  const folderFiles = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.folderId, folderId),
        isNull(files.deletedAt),
        eq(files.userId, userId),
      ),
    );

  return {
    folder,
    subFolder,
    files: folderFiles,
  };
};

export const updateFolder = async (
  userId: string,
  folderId: string,
  input: UpdateFolderInput,
) => {
  const [updated] = await db
    .update(folders)
    .set({
      name: input.name,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.userId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new NotFoundError('Folder not found');
  }

  return updated;
};

export const deleteFolder = async (userId: string, folderId: string) => {
  const [folder] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.userId, userId),
        eq(folders.id, folderId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);

  if (!folder) {
    throw new NotFoundError('folder not found');
  }

  const allFolderIds: string[] = [folderId];
  let currentParentIds = [folderId];

  while (currentParentIds.length > 0) {
    const subFolders = await db
      .select({
        id: folders.id,
      })
      .from(folders)
      .where(
        and(
          isNull(folders.deletedAt),
          inArray(folders.parentId, currentParentIds),
        ),
      );

    if (subFolders.length === 0) break;

    const subIds = subFolders.map((s) => s.id);
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

  return { message: 'Folders and its content moved to trash' };
};
