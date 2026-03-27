import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';

// Mock Prisma
const mockPrisma = {
  workspace: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  feedback: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  theme: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  roadmapItem: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  digest: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

// Mock Queues
const mockQueue = {
  add: jest.fn(),
};

export const createTestApp = async (): Promise<{
  app: INestApplication;
  prisma: typeof mockPrisma;
  queues: {
    analysisQueue: typeof mockQueue;
    ciqScoringQueue: typeof mockQueue;
    digestQueue: typeof mockQueue;
  };
}> => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .overrideProvider('BullQueue_ai-analysis')
    .useValue(mockQueue)
    .overrideProvider('BullQueue_ciq-scoring')
    .useValue(mockQueue)
    .overrideProvider('BullQueue_digest')
    .useValue(mockQueue)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.init();

  return {
    app,
    prisma: mockPrisma,
    queues: {
      analysisQueue: mockQueue,
      ciqScoringQueue: mockQueue,
      digestQueue: mockQueue,
    },
  };
};
