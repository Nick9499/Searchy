import {
  getProviderAuthUrl,
  handleProviderCallback,
  listRemoteFiles,
  startCloudImport,
} from '@/controllers/integration.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { requireProviderEnabled } from '@/middlewares/org.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  importCloudItemSchema,
  listRemoteFilesConfig,
  providerCallbackConfig,
  providerParamConfig,
} from '@/validators/integration.validator';
import { Router } from 'express';

const router = Router();

router.get(
  '/:provider/callback',
  validate(providerCallbackConfig),
  handleProviderCallback,
);

router.use(authenticate);
router.use('/:provider', requireProviderEnabled);

router.get(
  '/:provider/auth-url',
  validate(providerParamConfig),
  getProviderAuthUrl,
);
router.get(
  '/:provider/files',
  validate(listRemoteFilesConfig),
  listRemoteFiles,
);
router.post(
  '/:provider/import',
  validate(importCloudItemSchema),
  startCloudImport,
);

export default router;
