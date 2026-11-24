import z from 'zod';

export const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100),
  parentId: z.uuid().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(100),
});

export const uploadFileSchema = z.object({
  folderId: z.uuid().optional(),
});

export const searchFilesSchema = z.object({
  query: z.string().min(1, 'Search query can no be empty'),
  folderId: z.uuid().optional(),
  mimeType: z.string().optional(),
});

export const restoreTrashSchema = z.object({
  id: z.uuid('Inavlid item ID'),
  type: z.enum(['file', 'folder'], {
    error: 'Type must be either file or folder',
  }),
});

export const folderIdParamSchema = z.object({
  id: z.uuid('Invalid folder ID'),
});

export const folderIdConfig = {
  params: folderIdParamSchema,
};

export const updateFolderConfig = {
  params: folderIdParamSchema,
  body: updateFolderSchema,
};

export const fileIdParamSchema = z.object({
  id: z.uuid('Invalid file ID'),
});

export const fileIdConfig = {
  params: fileIdParamSchema,
};

export const searchFilesQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
});

export const searchFilesConfig = {
  query: searchFilesQuerySchema,
};

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type UploadFileInput = z.infer<typeof uploadFileSchema>;
export type SearchFilesInput = z.infer<typeof searchFilesSchema>;
export type RestoreTrashInput = z.infer<typeof restoreTrashSchema>;
export type FolderIdParamInput = z.infer<typeof folderIdParamSchema>;
export type FileIdParamInput = z.infer<typeof fileIdParamSchema>;
export type searchFilesQueryInput = z.infer<typeof searchFilesQuerySchema>;
