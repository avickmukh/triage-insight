import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  workspace: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  workspaceMember: {
    findFirst: jest.fn(),
  },
  billingPlanConfig: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
  },
  invoice: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrismaService)),
  onModuleInit: jest.fn(),
};

const mockStripeInstance = {
  webhooks: {
    constructEvent: jest.fn(),
  },
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
  billingPortal: {
    sessions: {
      create: jest.fn(),
    },
  },
  subscriptions: {
    list: jest.fn(),
  },
  invoices: {
    list: jest.fn(),
  },
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                STRIPE_SECRET_KEY: 'sk_test_mock',
                STRIPE_WEBHOOK_SECRET: 'whsec_mock',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    // Inject mock Stripe instance directly to avoid real SDK calls
    (service as unknown as { stripe: typeof mockStripeInstance }).stripe = mockStripeInstance;
    jest.clearAllMocks();
  });

  // ── handleStripeWebhook ─────────────────────────────────────────────────────

  describe('handleStripeWebhook', () => {
    it('should throw BadRequestException when signature verification fails', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));

      await expect(
        service.handleStripeWebhook(rawBody, 'invalid-signature'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return { received: true } for a valid webhook event', async () => {
      const mockEvent = {
        type: 'invoice.created',
        data: {
          object: {
            id: 'in_mock',
            customer: 'cus_mock',
            status: 'open',
            amount_due: 1000,
            amount_paid: 0,
            currency: 'usd',
            period_start: 1700000000,
            period_end: 1702592000,
            hosted_invoice_url: null,
            invoice_pdf: null,
            metadata: {},
          },
        },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaService.workspace.findUnique.mockResolvedValue({ id: 'ws-id', stripeCustomerId: 'cus_mock' });
      mockPrismaService.invoice.upsert.mockResolvedValue({});

      const result = await service.handleStripeWebhook(
        Buffer.from('{}'),
        'valid-signature',
      );

      expect(result).toEqual({ received: true });
    });

    it('should handle checkout.session.completed and update workspace billing', async () => {
      const mockEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_mock',
            metadata: { workspaceId: 'ws-id', targetPlan: 'GROWTH' },
            subscription: 'sub_mock',
            customer: 'cus_mock',
          },
        },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaService.workspace.update.mockResolvedValue({ id: 'ws-id' });

      const result = await service.handleStripeWebhook(
        Buffer.from('{}'),
        'valid-signature',
      );

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ws-id' } }),
      );
    });

    it('should handle customer.subscription.deleted and downgrade workspace', async () => {
      const mockEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_mock',
            metadata: { workspaceId: 'ws-id' },
            customer: 'cus_mock',
          },
        },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaService.workspace.findUnique.mockResolvedValue({ id: 'ws-id', stripeCustomerId: 'cus_mock' });
      mockPrismaService.workspace.update.mockResolvedValue({ id: 'ws-id' });

      const result = await service.handleStripeWebhook(
        Buffer.from('{}'),
        'valid-signature',
      );

      expect(result).toEqual({ received: true });
    });
  });
});
