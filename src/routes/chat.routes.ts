import { chatWithAi } from '@/controllers/chat.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { chatRequestSchema } from '@/validators/chat.validator';
import { Router } from 'express';

const router = Router();

router.use(authenticate);

router.post('/', validate(chatRequestSchema), chatWithAi);

export default router;
