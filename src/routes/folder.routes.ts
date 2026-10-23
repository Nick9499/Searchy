import { Router } from 'express';
import {
  createFolder,
  deleteFolder,
  getFolderContents,
  getFolders,
  updateFolder,
} from '@/controllers/folder.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { validate } from '@/middlewares/validate.middleware';
import {
  createFolderSchema,
  updateFolderSchema,
} from '@/validators/storage.validator';

const router = Router();

// All folder routes require authentication
router.use(authenticate);

// 1. Create a folder
router.post('/', validate(createFolderSchema), createFolder);

// 2. List all folders for the user
router.get('/', getFolders);

// 3. Get specific folder contents (files & subfolders)
router.get('/:id', getFolderContents);

// 4. Rename a folder
router.patch('/:id', validate(updateFolderSchema), updateFolder);

// 5. Delete a folder (cascades to files & S3)
router.delete('/:id', deleteFolder);

export default router;
