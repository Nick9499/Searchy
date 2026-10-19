import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import app from '@/app';

const testUser = {
  name: 'Test Runner',
  email: 'test.runner@example.com',
  password: 'password123',
};

describe('User Authentication & Account Management', () => {
  let authToken = '';
  let createdUserId = '';

  const cleanup = async () => {
    await db.delete(users).where(eq(users.email, testUser.email));
  };

  beforeAll(async () => {
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
  });

  it('should register a new user successfully (201', async () => {
    const res = await request(app).post('/api/users/signup').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('message', 'Account created');
    expect(res.body).toHaveProperty('userId');
    createdUserId = res.body.userId;
  });

  it('should prevent signup with duplicate email (409)', async () => {
    const res = await request(app).post('/api/users/signup').send(testUser);

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('message', 'Email already in use');
  });

  it('should login the user and return a JWT token (200)', async () => {
    const res = await request(app).post('/api/users/login').send({
      email: testUser.email,
      password: testUser.password,
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    authToken = res.body.token;
  });

  it('should reject login with invalid password (401)', async () => {
    const res = await request(app).post('/api/users/login').send({
      email: testUser.email,
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
  });

  it('should fetch the authenticated user profile (200)', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: createdUserId,
      name: testUser.name,
      email: testUser.email,
    });
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('should update user name (200)', async () => {
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
  });

  it('should delete the account (200)', async () => {
    const res = await request(app)
      .delete('/api/users/me')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Account deleted');
  });
});
