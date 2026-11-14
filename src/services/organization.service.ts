import { db } from '@/db';
import { orgSettings } from '@/db/schema';
import { IntegrationProvider } from '@/types';
import { eq } from 'drizzle-orm';

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
