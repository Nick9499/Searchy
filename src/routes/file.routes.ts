import { Router } from 'express';
import {
  deleteFile,
  getFileDownloadUrl,
  getRootFiles,
  searchFiles,
  uploadFile,
} from '@/controllers/file.controller';
import { authenticate } from '@/middlewares/auth.middleware';
import { upload } from '@/middlewares/upload.middleware';
import { validate } from '@/middlewares/validate.middleware';
import { uploadFileSchema } from '@/validators/storage.validator';

const router = Router();

// All file routes require authentication
router.use(authenticate);

// 1. Search files (must be before /:id so Express doesn't treat 'search' as an ID)
router.get('/search', searchFiles);

// 2. Upload file (multipart form-data with field name "file")
router.post(
  '/upload',
  upload.single('file'),
  validate(uploadFileSchema),
  uploadFile,
);

// 3. List root files (files not in any folder)
router.get('/', getRootFiles);

// 4. Get presigned download URL
router.get('/:id/download', getFileDownloadUrl);

// 5. Delete a file
router.delete('/:id', deleteFile);

export default router;
