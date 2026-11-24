import { db } from '@/db';
import { files, folders } from '@/db/schema';
import { NotFoundError } from '@/errors/app.error';
import { and, eq, ilike, isNull } from 'drizzle-orm';
import { getPresignedDownloadUrl, uploadToS3 } from './storage.service';

export const uploadUserFile = async (
  userId: string,
  file: Express.Multer.File,
  folderId?: string | null,
) => {
  const targetFolderId = folderId || null;

  if (targetFolderId) {
    const [folder] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, targetFolderId),
          eq(folders.userId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);

    if (!folder) {
      throw new NotFoundError('folder not found');
    }
  }

  const fileUuid = crypto.randomUUID();
  const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storageKey = `uploads/${userId}/${fileUuid}-${safeFileName}`;

  await uploadToS3({
    buffer: file.buffer,
    mimeType: file.mimetype,
    key: storageKey,
  });

  const [newFile] = await db
    .insert(files)
    .values({
      mimeType: file.mimetype,
      name: file.originalname,
      size: file.size,
      storageKey,
      userId,
      folderId: targetFolderId,
    })
    .returning();

  return newFile;
};

export const getUserRootFiles = async (userId: string) => {
  return await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        isNull(files.folderId),
        isNull(files.deletedAt),
      ),
    );
};

export const getFileDownloadUrl = async (userId: string, fileId: string) => {
  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        eq(files.id, fileId),
        isNull(files.deletedAt),
      ),
    );

  if (!file) {
    throw new NotFoundError('File not found');
  }

  const downloadUrl = await getPresignedDownloadUrl(file.storageKey);

  return { file, downloadUrl };
};

export const deleteUserFile = async (userId: string, fileId: string) => {
  const now = new Date();
  const [deleted] = await db
    .update(files)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.userId, userId),
        isNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id });

  if (!deleted) {
    throw new NotFoundError('File not found');
  }

  return { message: 'File moved to trash' };
};

export const searchUserFiles = async (userId: string, query: string) => {
  const matchedFiles = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.userId, userId),
        isNull(files.deletedAt),
        ilike(files.name, `%${query}%`),
      ),
    );

  return { files: matchedFiles, count: matchedFiles.length };
};
