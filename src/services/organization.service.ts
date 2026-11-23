import { db } from '@/db';
import { DEFAULT_ORG_ID, organizations, orgSettings, users } from '@/db/schema';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '@/errors/app.error';
import {
  IntegrationProvider,
  type OrganizationDetails,
  type UserRole,
} from '@/types';
import type {
  CreateOrgInput,
  UpdateOrgSettingsInput,
} from '@/validators/organization.validator';
import { count, eq } from 'drizzle-orm';

export const isProviderEnabledForOrg = async (
  orgId: string,
  provider: IntegrationProvider,
): Promise<boolean> => {
  if (provider === IntegrationProvider.GOOGLE) {
    const [settings] = await db
      .select({ googleDriveEnabled: orgSettings.googleDriveEnabled })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgId));

    return Boolean(settings?.googleDriveEnabled);
  }

  return true;
};

export const listOrganizations = async (): Promise<OrganizationDetails[]> => {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
      settingsId: orgSettings.id,
      googleDriveEnabled: orgSettings.googleDriveEnabled,
      settingsCreatedAt: orgSettings.createdAt,
      settingsUpdatedAt: orgSettings.updatedAt,
      memberCount: count(users.id),
    })
    .from(organizations)
    .leftJoin(orgSettings, eq(orgSettings.orgId, organizations.id))
    .leftJoin(users, eq(users.orgId, organizations.id))
    .groupBy(
      organizations.id,
      organizations.name,
      organizations.slug,
      organizations.createdAt,
      organizations.updatedAt,
      orgSettings.id,
      orgSettings.googleDriveEnabled,
      orgSettings.createdAt,
      orgSettings.updatedAt,
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    settings: row.settingsId
      ? {
          id: row.settingsId,
          orgId: row.id,
          googleDriveEnabled: Boolean(row.googleDriveEnabled),
          createdAt: row.settingsCreatedAt,
          updatedAt: row.settingsUpdatedAt,
        }
      : null,
    memberCount: Number(row.memberCount),
  }));
};

export const getOrganizationById = async (orgId: string) => {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  const [settings] = await db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId));

  const orgUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.orgId, orgId));

  return {
    ...org,
    settings: settings || null,
    users: orgUsers,
  };
};

export const createOrganization = async (data: CreateOrgInput) => {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, data.slug));

  if (existing) {
    throw new ConflictError('Organization with this slug already exists');
  }

  const [org] = await db
    .insert(organizations)
    .values({
      name: data.name,
      slug: data.slug,
    })
    .returning();

  const [settings] = await db
    .insert(orgSettings)
    .values({
      orgId: org.id,
      googleDriveEnabled: false,
    })
    .returning();

  return {
    ...org,
    settings,
  };
};

export const updateOrganizationSettings = async (
  orgId: string,
  data: UpdateOrgSettingsInput,
) => {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  const [updatedSettings] = await db
    .insert(orgSettings)
    .values({ orgId, googleDriveEnabled: data.googleDriveEnabled })
    .onConflictDoUpdate({
      target: orgSettings.orgId,
      set: {
        googleDriveEnabled: data.googleDriveEnabled,
        updatedAt: new Date(),
      },
    })
    .returning();

  return updatedSettings;
};

export const deleteOrganization = async (orgId: string) => {
  if (orgId === DEFAULT_ORG_ID) {
    throw new BadRequestError('Can not delete the default organization');
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  await db
    .update(users)
    .set({ orgId: DEFAULT_ORG_ID, role: 'member', updatedAt: new Date() })
    .where(eq(users.orgId, orgId));

  await db.delete(organizations).where(eq(organizations.id, orgId));

  return { message: 'Organization deleted successfully' };
};

export const assignUserToOrganization = async (
  orgId: string,
  userId: string,
  role: UserRole = 'member',
) => {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, orgId));

  if (!org) {
    throw new NotFoundError('Organization not found');
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new NotFoundError('User not found');
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      orgId,
      role,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      orgId: users.orgId,
      role: users.role,
    });

  return updatedUser;
};
