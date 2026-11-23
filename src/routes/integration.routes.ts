import {
  getProviderAuthUrl,
  handleProviderCallback,
  listRemoteFiles,
  startCloudImport,
} from '@/controllers/integration.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { requireProviderEnabled } from '@/middlewares/org.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { importCloudItemSchema } from '@/validators/integration.validator';
import { Router } from 'express';

const router = Router();

router.get('/:provider/callback', handleProviderCallback);

router.use(authenticate);
router.use('/:provider', requireProviderEnabled);

router.get('/:provider/auth-url', getProviderAuthUrl);
router.get('/:provider/files', listRemoteFiles);
router.post(
  '/:provider/import',
  validate(importCloudItemSchema),
  startCloudImport,
);

export default router;
