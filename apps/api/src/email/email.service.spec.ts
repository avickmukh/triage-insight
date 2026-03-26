import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';

describe('EmailService', () => {
  let service: EmailService;
  let loggerSpy: jest.SpyInstance;

  const buildModule = async (provider: string) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'EMAIL_PROVIDER') return provider;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  };

  const emailOptions = {
    to: 'recipient@example.com',
    subject: 'Test Subject',
    html: '<p>Hello</p>',
    text: 'Hello',
  };

  describe('when EMAIL_PROVIDER is console', () => {
    beforeEach(async () => {
      service = await buildModule('console');
      // Spy on the logger to verify log output without real side effects
      loggerSpy = jest.spyOn((service as unknown as { logger: { log: jest.Mock } }).logger, 'log').mockImplementation(() => {});
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should resolve without throwing when sending an email', async () => {
      await expect(service.send(emailOptions)).resolves.not.toThrow();
    });

    it('should log the recipient and subject', async () => {
      await service.send(emailOptions);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(emailOptions.to),
      );
    });
  });

  describe('when EMAIL_PROVIDER is smtp', () => {
    beforeEach(async () => {
      service = await buildModule('smtp');
      loggerSpy = jest.spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn').mockImplementation(() => {});
    });

    it('should resolve without throwing (stub behaviour)', async () => {
      await expect(service.send(emailOptions)).resolves.not.toThrow();
    });

    it('should warn that the smtp provider is not yet fully implemented', async () => {
      await service.send(emailOptions);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('smtp'),
      );
    });
  });

  describe('when EMAIL_PROVIDER is ses', () => {
    beforeEach(async () => {
      service = await buildModule('ses');
      loggerSpy = jest.spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn').mockImplementation(() => {});
    });

    it('should resolve without throwing (stub behaviour)', async () => {
      await expect(service.send(emailOptions)).resolves.not.toThrow();
    });

    it('should warn that the ses provider is not yet fully implemented', async () => {
      await service.send(emailOptions);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('ses'),
      );
    });
  });
});
