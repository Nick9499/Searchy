import { IntegrationProvider } from '@/types';
import z from 'zod';

export const providerParamSchema = z.object({
  provider: z.enum(IntegrationProvider, {
    error: (issue) => `Provider '${String(issue.input)}' is not supported`,
  }),
});

export const providerParamConfig = {
  params: providerParamSchema,
};

export const providerCallbackQuerySchema = z.object({
  code: z
    .string({ error: 'Missing authorization code' })
    .min(1, 'Missing authorization code'),
  state: z
    .string({ error: 'Missing state parameter' })
    .min(1, 'Missing state parameter'),
});

export const providerCallbackConfig = {
  params: providerParamSchema,
  query: providerCallbackQuerySchema,
};

export const listRemoteFilesQuerySchema = z.object({
  folderId: z.string().optional(),
});

export const listRemoteFilesConfig = {
  params: providerParamSchema,
  query: listRemoteFilesQuerySchema,
};

export const importCloudItemSchema = z.object({
  remoteItemId: z.string().min(1, 'remoteItemId is required'),
  targetFolderId: z.uuid('Invalid targetFolderId').optional().nullable(),
});

export const importCloudItemConfig = {
  params: providerParamSchema,
  body: importCloudItemSchema,
};

export type ProviderParamInput = z.infer<typeof providerParamSchema>;
export type ProviderCallbackQueryInput = z.infer<
  typeof providerCallbackQuerySchema
>;
export type ListRemoteFilesQueryInput = z.infer<
  typeof listRemoteFilesQuerySchema
>;
export type ImportCloudItemInput = z.infer<typeof importCloudItemSchema>;
