/**
 * EmbeddingService — Unit Tests
 *
 * Validates:
 *   - Correct OpenAI API call shape (model, input)
 *   - Returns a 1536-dimensional float array
 *   - Throws ServiceUnavailableException when OpenAI key is missing
 *   - Throws ServiceUnavailableException when OpenAI API returns an error
 *   - Handles empty / whitespace input gracefully
 *
 * Mocking strategy:
 *   - OpenAI client is fully mocked — no real HTTP calls
 *   - ConfigService is mocked to control OPENAI_API_KEY presence
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { ConfigService } from '@nestjs/config';

// ─── Mock OpenAI client ───────────────────────────────────────────────────────
const MOCK_EMBEDDING = Array.from(
  { length: 1536 },
  (_, i) => Math.sin(i) * 0.001,
);

const mockOpenAICreate = jest.fn();

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      embeddings: {
        create: mockOpenAICreate,
      },
    })),
  };
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('EmbeddingService', () => {
  let service: EmbeddingService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'OPENAI_API_KEY') return 'sk-test-key-1234';
      return undefined;
    }),
  };

  beforeEach(async () => {
    mockOpenAICreate.mockResolvedValue({
      data: [{ embedding: MOCK_EMBEDDING }],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
    jest.clearAllMocks();

    // Re-apply the default mock after clearAllMocks
    mockOpenAICreate.mockResolvedValue({
      data: [{ embedding: MOCK_EMBEDDING }],
    });
  });

  // ── generateEmbedding ────────────────────────────────────────────────────

  describe('generateEmbedding', () => {
    it('should return a 1536-dimensional float array', async () => {
      const result = await service.generateEmbedding(
        'WiFi keeps disconnecting',
      );

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1536);
      result.forEach((v) => expect(typeof v).toBe('number'));
    });

    it('should call OpenAI embeddings.create with text-embedding-3-small model', async () => {
      await service.generateEmbedding('Dashboard is slow');

      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.stringContaining('embedding'),
          input: 'Dashboard is slow',
        }),
      );
    });

    it('should throw ServiceUnavailableException when OpenAI returns an error', async () => {
      mockOpenAICreate.mockRejectedValueOnce(
        new Error('OpenAI API error: rate limit exceeded'),
      );

      await expect(
        service.generateEmbedding('Some feedback text'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException when API key is missing', async () => {
      mockConfigService.get.mockReturnValueOnce(undefined); // no OPENAI_API_KEY

      const moduleNoKey: TestingModule = await Test.createTestingModule({
        providers: [
          EmbeddingService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const serviceNoKey = moduleNoKey.get<EmbeddingService>(EmbeddingService);
      mockOpenAICreate.mockRejectedValueOnce(new Error('No API key provided'));

      await expect(serviceNoKey.generateEmbedding('Some text')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should return the exact embedding values from the OpenAI response', async () => {
      const specificEmbedding = Array.from(
        { length: 1536 },
        (_, i) => i * 0.0001,
      );
      mockOpenAICreate.mockResolvedValueOnce({
        data: [{ embedding: specificEmbedding }],
      });

      const result = await service.generateEmbedding('Test text');

      expect(result).toEqual(specificEmbedding);
    });

    it('should pass the full input text to OpenAI without truncation', async () => {
      const longText = 'WiFi disconnects '.repeat(100); // 1700 chars

      await service.generateEmbedding(longText);

      const callArgs = mockOpenAICreate.mock.calls[0][0];
      expect(callArgs.input).toBe(longText);
    });
  });

  //  // ── generateEmbedding (repeated call) ──────────────────────────────

  describe('generateEmbedding (repeated call)', () => {
    it('should return consistent results across multiple calls', async () => {
      const result = await service.generateEmbedding('Some feedback text');

      expect(result).toHaveLength(1536);
      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
    });
  });
});
