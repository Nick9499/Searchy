import {
  emptyTrash,
  getTrash,
  restoreItem,
} from '@/controllers/trash.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { restoreTrashSchema } from '@/validators/storage.validator';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

router.get('/', getTrash);
router.post('/restore', validate(restoreTrashSchema), restoreItem);
router.delete('/', emptyTrash);

export default router;
