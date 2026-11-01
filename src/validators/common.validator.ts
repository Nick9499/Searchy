import z from 'zod';

export const idParamSchema = z.object({
  id: z.uuid('Invalid UUID format'),
});

export type IdParamInput = z.infer<typeof idParamSchema>;

export const providerParamSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
});

export type ProviderParamInput = z.infer<typeof providerParamSchema>;
