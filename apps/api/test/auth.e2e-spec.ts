import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: any;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/signup', () => {
    it('should create a new user and workspace and return tokens', async () => {
      prisma.workspace.create.mockResolvedValueOnce({
        id: 'ws-1',
        name: 'Test Workspace',
      });
      prisma.user.create.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/signup')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          password: 'password123',
          workspaceName: 'Test Workspace',
        })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(prisma.workspace.create).toHaveBeenCalled();
      expect(prisma.user.create).toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed_password',
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(201);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });
  });

  describe('GET /auth/me', () => {
    it('should return the current user profile', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
      });

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      const token = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .then((res) => {
          expect(res.body).toEqual({ id: 'user-1', email: 'test@example.com' });
        });
    });
  });
});
