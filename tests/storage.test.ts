import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { files, folders, otps, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import app from '@/app';

// Mock S3 storage service so tests run fast, isolated, and without S3Mock / AWS
vi.mock('@/services/storage.service', () => ({
  ensureBucketExists: vi.fn().mockResolvedValue(undefined),
  uploadToS3: vi.fn().mockResolvedValue(undefined),
  deleteFromS3: vi.fn().mockResolvedValue(undefined),
  getPresignedDownloadUrl: vi
    .fn()
    .mockImplementation((key: string) =>
      Promise.resolve(`https://mock-s3.example.com/${key}?signature=mock123`),
    ),
}));

// Mock email & OTP
vi.mock('@/utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/utils/otp', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/utils/otp')>();
  return {
    ...original,
    generateOtp: vi.fn(() => '123456'),
  };
});

const TEST_EMAIL = 'storage.test@example.com';
const TEST_PASSWORD = 'Password123!';
let authToken = '';

describe('Storage & Trash API Suite', () => {
  const cleanup = async () => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, TEST_EMAIL));

    if (user) {
      await db.delete(files).where(eq(files.userId, user.id));
      await db.delete(folders).where(eq(folders.userId, user.id));
      await db.delete(otps).where(eq(otps.email, TEST_EMAIL));
      await db.delete(users).where(eq(users.id, user.id));
    }
  };

  beforeAll(async () => {
    await cleanup();

    // 1. Sign up user
    await request(app).post('/api/users/signup').send({
      name: 'Storage Tester',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    // 2. Resend OTP to ensure test OTP '123456' is saved
    await request(app).post('/api/users/resend-otp').send({
      email: TEST_EMAIL,
      purpose: 'VERIFY_EMAIL',
    });

    // 3. Verify OTP
    const verifyRes = await request(app).post('/api/users/verify-otp').send({
      email: TEST_EMAIL,
      code: '123456',
      purpose: 'VERIFY_EMAIL',
    });

    authToken = verifyRes.body.token;
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('Folder Operations', () => {
    let parentFolderId = '';
    let subfolderId = '';

    it('should reject creating a folder without authentication', async () => {
      const res = await request(app).post('/api/folders').send({
        name: 'Unauthorized Folder',
      });
      expect(res.status).toBe(401);
    });

    it('should create a root folder', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Documents' });

      expect(res.status).toBe(201);
      expect(res.body.folder).toHaveProperty('id');
      expect(res.body.folder.name).toBe('Documents');
      expect(res.body.folder.parentId).toBeNull();

      parentFolderId = res.body.folder.id;
    });

    it('should create a nested subfolder', async () => {
      const res = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Invoices',
          parentId: parentFolderId,
        });

      expect(res.status).toBe(201);
      expect(res.body.folder.name).toBe('Invoices');
      expect(res.body.folder.parentId).toBe(parentFolderId);

      subfolderId = res.body.folder.id;
    });

    it('should return 404 when creating subfolder with non-existent parentId', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Lost Folder',
          parentId: fakeUuid,
        });

      expect(res.status).toBe(404);
    });

    it('should list only root folders (ignoring subfolders)', async () => {
      const res = await request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.folders)).toBe(true);
      const names = res.body.folders.map((f: { name: string }) => f.name);
      expect(names).toContain('Documents');
      expect(names).not.toContain('Invoices');
    });

    it('should get folder contents including its subfolders', async () => {
      const res = await request(app)
        .get(`/api/folders/${parentFolderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.folder.id).toBe(parentFolderId);
      expect(res.body.subFolder.length).toBe(1);
      expect(res.body.subFolder[0].id).toBe(subfolderId);
    });

    it('should rename a folder', async () => {
      const res = await request(app)
        .patch(`/api/folders/${parentFolderId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Work Documents' });

      expect(res.status).toBe(200);
      expect(res.body.folder.name).toBe('Work Documents');
    });
  });

  describe('File Operations', () => {
    let uploadedFileId = '';

    it('should reject file upload without authentication', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .attach('file', Buffer.from('test content'), 'test.txt');

      expect(res.status).toBe(401);
    });

    it('should upload a file to the root directory', async () => {
      const res = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('hello world contents'), 'sample.txt');

      expect(res.status).toBe(201);
      expect(res.body.file).toHaveProperty('id');
      expect(res.body.file.name).toBe('sample.txt');
      expect(res.body.file.size).toBe(20);
      expect(res.body.file.folderId).toBeNull();

      uploadedFileId = res.body.file.id;
    });

    it('should retrieve root files', async () => {
      const res = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.files.some((f: { id: string }) => f.id === uploadedFileId),
      ).toBe(true);
    });

    it('should search for files matching query', async () => {
      const res = await request(app)
        .get('/api/files/search?query=sample')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
      expect(res.body.files[0].name).toBe('sample.txt');
    });

    it('should return a presigned download URL for a file', async () => {
      const res = await request(app)
        .get(`/api/files/${uploadedFileId}/download`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('downloadUrl');
      expect(res.body.downloadUrl).toContain('https://mock-s3.example.com/');
    });
  });

  describe('Trash Lifecycle (Soft Delete, Restore & Empty)', () => {
    let fileToTrashId = '';
    let folderToTrashId = '';

    beforeAll(async () => {
      const folderRes = await request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Trash Test Folder' });
      folderToTrashId = folderRes.body.folder.id;

      const fileRes = await request(app)
        .post('/api/files/upload')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('trash file content'), 'trashme.txt');
      fileToTrashId = fileRes.body.file.id;
    });

    it('should soft-delete a file (move to trash)', async () => {
      const delRes = await request(app)
        .delete(`/api/files/${fileToTrashId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.message).toBe('File moved to trash');

      // Should NO LONGER appear in root files
      const rootRes = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`);
      expect(
        rootRes.body.files.some((f: { id: string }) => f.id === fileToTrashId),
      ).toBe(false);

      // Should NO LONGER be downloadable
      const dlRes = await request(app)
        .get(`/api/files/${fileToTrashId}/download`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(dlRes.status).toBe(404);

      // Should APPEAR in trash listing
      const trashRes = await request(app)
        .get('/api/trash')
        .set('Authorization', `Bearer ${authToken}`);
      expect(trashRes.status).toBe(200);
      expect(
        trashRes.body.files.some((f: { id: string }) => f.id === fileToTrashId),
      ).toBe(true);
    });

    it('should restore a soft-deleted file', async () => {
      const restoreRes = await request(app)
        .post('/api/trash/restore')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id: fileToTrashId,
          type: 'file',
        });

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.message).toBe('File restored successfully');

      // Should APPEAR again in root files
      const rootRes = await request(app)
        .get('/api/files')
        .set('Authorization', `Bearer ${authToken}`);
      expect(
        rootRes.body.files.some((f: { id: string }) => f.id === fileToTrashId),
      ).toBe(true);
    });

    it('should soft-delete a folder and its contents', async () => {
      const delRes = await request(app)
        .delete(`/api/folders/${folderToTrashId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(delRes.status).toBe(200);

      // Should not appear in active folders
      const foldersRes = await request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${authToken}`);
      expect(
        foldersRes.body.folders.some(
          (f: { id: string }) => f.id === folderToTrashId,
        ),
      ).toBe(false);

      // Should appear in trash
      const trashRes = await request(app)
        .get('/api/trash')
        .set('Authorization', `Bearer ${authToken}`);
      expect(
        trashRes.body.folders.some(
          (f: { id: string }) => f.id === folderToTrashId,
        ),
      ).toBe(true);
    });

    it('should permanently empty the trash', async () => {
      // Move our file back to trash so we have both folder and file in trash
      await request(app)
        .delete(`/api/files/${fileToTrashId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const emptyRes = await request(app)
        .delete('/api/trash')
        .set('Authorization', `Bearer ${authToken}`);

      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body.message).toBe('Trash emptied successfully');

      // Trash should now be empty
      const trashRes = await request(app)
        .get('/api/trash')
        .set('Authorization', `Bearer ${authToken}`);
      expect(trashRes.body.files.length).toBe(0);
      expect(trashRes.body.folders.length).toBe(0);
    });
  });
});
