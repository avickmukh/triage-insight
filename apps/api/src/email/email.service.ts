import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly provider: string;

  constructor(private readonly configService: ConfigService) {
    this.provider = this.configService.get<string>('EMAIL_PROVIDER', 'console');
  }

  async send(options: EmailOptions): Promise<void> {
    if (this.provider === 'console') {
      this.logger.log(
        `Email sent to ${options.to} with subject "${options.subject}"`,
      );
      this.logger.log(`Body (HTML): ${options.html}`);
      return;
    }

    // In a real app, you'd have different strategies for each provider.
    // For example, using Nodemailer for SMTP or the AWS SDK for SES.
    this.logger.warn(
      `Email provider '${this.provider}' not implemented. Logging to console.`,
    );
    this.logger.log(
      `Email sent to ${options.to} with subject "${options.subject}"`,
    );
  }
}
