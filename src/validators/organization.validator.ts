import { z } from 'zod';

const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const createOrgSchema = z.object({
  name: z.string().min(2, 'name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(
      /^[a-z0-9]+$/,
      'Slug must be lowercase alphanumeric and can contain hyphens',
    ),
});

export const orgIdParamsSchema = z.object({
  orgId: z.string().regex(UUID_REGEX, 'Invalid organization ID'),
});

export const orgIdParamSchema = {
  params: orgIdParamsSchema,
};

export const updateOrgSettingsSchema = {
  params: orgIdParamsSchema,
  body: z.object({
    googleDriveEnabled: z.boolean(),
  }),
};

export const assignUserOrgSchema = {
  params: orgIdParamsSchema,
  body: z.object({
    userId: z.uuid('Invalid user ID'),
    role: z.enum(['super_admin', 'org_admin', 'member']).default('member'),
  }),
};

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type OrgIdParamInput = z.infer<typeof orgIdParamsSchema>;
export type UpdateOrgSettingsInput = z.infer<
  typeof updateOrgSettingsSchema.body
>;
export type AssignUserOrgInput = z.infer<typeof assignUserOrgSchema.body>;
