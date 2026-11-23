import { ForbiddenError } from '@/errors/app.error';
import { isProviderEnabledForOrg } from '@/services/organization.service';
import type { AuthRequest, IntegrationProvider } from '@/types';
import type { NextFunction, Response } from 'express';

export const requireProviderEnabled = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const provider = req.params.provider as IntegrationProvider;
  if (req.orgId) {
    const isEnabled = await isProviderEnabledForOrg(req.orgId, provider);
    if (!isEnabled) {
      next(
        new ForbiddenError(
          `${provider} integration is disabled for your organization. Contact your administrator`,
        ),
      );
      return;
    }
  }
  next();
};
