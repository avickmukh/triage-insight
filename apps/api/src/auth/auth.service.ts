import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { SignUpDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { v4 as uuidv4 } from 'uuid';
import { WorkspaceRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    try {
      const { email, password, firstName, lastName } = signUpDto;

      console.log('SIGNUP STEP 1: received DTO', signUpDto);

      const existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      console.log('SIGNUP STEP 2: existing user check', existingUser);

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const passwordHash = await bcrypt.hash(password, 10);
      console.log('SIGNUP STEP 3: password hashed');

      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
        },
      });

      console.log('SIGNUP STEP 4: user created', user);

      const workspaceName = firstName
        ? `${firstName}'s Workspace`
        : `Workspace`;

      const workspaceSlug = firstName
        ? `${firstName.toLowerCase()}-${uuidv4().split('-')[0]}`
        : `workspace-${uuidv4().split('-')[0]}`;

      await this.prisma.workspace.create({
        data: {
          name: workspaceName,
          slug: workspaceSlug,
          members: {
            create: {
              userId: user.id,
              role: WorkspaceRole.ADMIN,
            },
          },
        },
      });

      console.log('SIGNUP STEP 5: workspace created');

      const tokens = await this.generateTokens(user.id, user.email);

      console.log('SIGNUP STEP 6: tokens generated');

      return tokens;
    } catch (error) {
      console.error('SIGNUP ERROR:', error);
      throw new InternalServerErrorException('Signup failed');
    }
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.email);
  }

  async refreshToken(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    const rt = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId,
        revoked: false,
      },
    });

    if (!user || !rt || rt.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: rt.id },
      data: { revoked: true },
    });

    return this.generateTokens(user.id, user.email);
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        token: refreshToken,
      },
      data: {
        revoked: true,
      },
    });

    return { message: 'Logout successful' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _pw, ...result } = user;

    return result;
  }

  decodeToken(token: string): { sub: string; email: string } {
    return this.jwtService.decode(token) as { sub: string; email: string };
  }

  private async generateTokens(userId: string, email: string) {
    const payload = {
      sub: userId,
      email,
    };

    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    const accessToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: jwtSecret,
      expiresIn: '7d',
    });

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ),
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}