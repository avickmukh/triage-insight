import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp } from './helpers';

describe('FeedbackController (e2e)', () => {
  let app: INestApplication;
  let prisma: any;
  let queues: any;
  let token: string;

  beforeAll(async () => {
    const setup = await createTestApp();
    app = setup.app;
    prisma = setup.prisma;
    queues = setup.queues;

    // Get a token for authenticated requests
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com', password: 'hashed_password' });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    token = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /workspaces/:workspaceId/feedback', () => {
    it('should create feedback and enqueue an analysis job', async () => {
      prisma.feedback.create.mockResolvedValueOnce({ id: 'fb-1', title: 'New Feedback' });

      await request(app.getHttpServer())
        .post('/api/v1/workspaces/ws-1/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'New Feedback', description: 'Details', sourceType: 'MANUAL' })
        .expect(201)
        .then((res) => {
          expect(res.body.title).toBe('New Feedback');
          expect(queues.analysisQueue.add).toHaveBeenCalledWith('analyse-feedback', { feedbackId: 'fb-1', workspaceId: 'ws-1' });
        });
    });
  });

  describe('GET /workspaces/:workspaceId/feedback', () => {
    it('should return a list of feedback', async () => {
      prisma.feedback.findMany.mockResolvedValueOnce([{ id: 'fb-1', title: 'Feedback 1' }]);
      prisma.feedback.count.mockResolvedValueOnce(1);

      await request(app.getHttpServer())
        .get('/api/v1/workspaces/ws-1/feedback')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .then((res) => {
          expect(res.body.data).toHaveLength(1);
          expect(res.body.data[0].title).toBe('Feedback 1');
        });
    });
  });

  describe('GET /workspaces/:workspaceId/feedback/semantic-search', () => {
    it('should return semantic search results', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ id: 'fb-1', title: 'Similar Feedback', similarity: 0.9 }]);

      await request(app.getHttpServer())
        .get('/api/v1/workspaces/ws-1/feedback/semantic-search?q=test')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .then((res) => {
          expect(res.body.data).toHaveLength(1);
          expect(res.body.data[0].title).toBe('Similar Feedback');
          expect(res.body.data[0].similarity).toBe(0.9);
        });
    });
  });
});
