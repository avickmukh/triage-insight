import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  workspace: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  workspaceMember: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  workspaceInvite: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrismaService)),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, unknown> = {
      JWT_SECRET: 'test-secret-32-characters-long!!',
      NODE_ENV: 'test',
    };
    return config[key];
  }),
};

const mockEmailService = {
  send: jest.fn().mockResolvedValue(undefined),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── signUp ──────────────────────────────────────────────────────────────────

  describe('signUp', () => {
    it('should throw ConflictException if email is already registered', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-user-id' });

      await expect(
        service.signUp({ email: 'test@example.com', password: 'hashed-password', firstName: 'Test', lastName: 'User', organizationName: 'Test Org' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create a new user and workspace on successful sign-up', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      const mockUser = { id: 'new-user-id', email: 'test@example.com', firstName: 'Test', lastName: 'User', passwordVersion: 1 };
      const mockWorkspace = { id: 'new-workspace-id', slug: 'test-user' };
      const mockMembership = { id: 'membership-id' };

      mockPrismaService.$transaction.mockImplementation(async (fn) => {
        mockPrismaService.user.create.mockResolvedValue(mockUser);
        mockPrismaService.workspace.create.mockResolvedValue(mockWorkspace);
        mockPrismaService.workspaceMember.create.mockResolvedValue(mockMembership);
        return fn(mockPrismaService);
      });
      mockPrismaService.refreshToken.create.mockResolvedValue({ token: 'hashed-refresh-token' });

      const result = await service.signUp({
        email: 'test@example.com',
        password: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Test Org',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrismaService.user.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should throw UnauthorizedException if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'notfound@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        passwordVersion: 1,
        status: 'ACTIVE',
        workspaceMemberships: [{ workspaceId: 'ws-id', workspace: { slug: 'test' } }],
      });

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens on successful login', async () => {
      const hashedPassword = await bcrypt.hash('correct-password', 10);
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        passwordVersion: 1,
        status: 'ACTIVE',
        workspaceMemberships: [{ workspaceId: 'ws-id', workspace: { slug: 'test' } }],
      });
      mockPrismaService.refreshToken.create.mockResolvedValue({ token: 'hashed-refresh' });

      const result = await service.login({ email: 'test@example.com', password: 'correct-password' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  // ── forgotPassword ──────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should return a generic message even when user is not found (security)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'notfound@example.com' });

      expect(result).toHaveProperty('message');
      // Should NOT throw — prevents user enumeration
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('should create a reset token and send an email when user is found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-id',
        email: 'test@example.com',
        status: 'ACTIVE',
      });
      mockPrismaService.passwordResetToken.create.mockResolvedValue({ token: 'hashed-token' });

      await service.forgotPassword({ email: 'test@example.com' });

      expect(mockEmailService.send).toHaveBeenCalledTimes(1);
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('password'),
        }),
      );
    });
  });

  // ── resetPassword ───────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should throw BadRequestException for an invalid or expired token', async () => {
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'invalid-token', password: 'new-password' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update the user password and delete the token on success', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000);
      mockPrismaService.passwordResetToken.findFirst.mockResolvedValue({
        id: 'token-id',
        userId: 'user-id',
        expiresAt: futureDate,
      });
      mockPrismaService.user.update.mockResolvedValue({ id: 'user-id' });
      mockPrismaService.passwordResetToken.delete.mockResolvedValue({});
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({});

      await service.resetPassword({ token: 'valid-token', password: 'new-password' });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-id' } }),
      );
      expect(mockPrismaService.passwordResetToken.delete).toHaveBeenCalledTimes(1);
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('should delete the refresh token on logout', async () => {
      mockPrismaService.refreshToken.findFirst.mockResolvedValue({ id: 'rt-id' });
      mockPrismaService.refreshToken.delete.mockResolvedValue({});

      await service.logout('user-id', 'raw-refresh-token');

      expect(mockPrismaService.refreshToken.delete).toHaveBeenCalledTimes(1);
    });
  });
});
