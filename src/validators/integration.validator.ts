import z from 'zod';

export const importCloudItemSchema = z.object({
  remoteItemId: z.string().min(1, 'remoteItemId is required'),
  targetFolderId: z.uuid('Invalid targetFolderId').optional().nullable(),
});

export type ImportCloudItemInput = z.infer<typeof importCloudItemSchema>;
