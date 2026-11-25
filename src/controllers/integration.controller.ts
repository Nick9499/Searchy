import { UnauthorizedError } from '@/errors/app.error';
import type { AuthRequest } from '@/types';
import type {
  ImportCloudItemInput,
  ListRemoteFilesQueryInput,
  ProviderCallbackQueryInput,
  ProviderParamInput,
} from '@/validators/integration.validator';
import * as integrationService from '@/services/integration.service';
import type { Response } from 'express';

export const getProviderAuthUrl = async (
  req: AuthRequest<ProviderParamInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const authUrl = await integrationService.getProviderAuthUrl(
    req.params.provider,
    req.userId,
  );
  res.json({ authUrl });
};

export const handleProviderCallback = async (
  req: AuthRequest<
    ProviderParamInput,
    unknown,
    unknown,
    ProviderCallbackQueryInput
  >,
  res: Response,
) => {
  const { code, state: userId } = req.query;

  const result = await integrationService.handleProviderCallback(
    req.params.provider,
    code,
    userId,
  );

  res.json({ result });
};

export const listRemoteFiles = async (
  req: AuthRequest<
    ProviderParamInput,
    unknown,
    unknown,
    ListRemoteFilesQueryInput
  >,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const items = await integrationService.listRemoteFiles(
    req.params.provider,
    req.userId,
    req.query.folderId,
  );

  res.json({ items });
};

export const startCloudImport = async (
  req: AuthRequest<ProviderParamInput, unknown, ImportCloudItemInput>,
  res: Response,
) => {
  if (!req.userId) {
    throw new UnauthorizedError();
  }

  const result = await integrationService.startCloudImport(
    req.params.provider,
    req.userId,
    req.body,
  );

  res.status(202).json(result);
};
