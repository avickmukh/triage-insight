import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

/**
 * Bootstrap the standalone worker application.
 *
 * This creates a NestJS application context, which is a lightweight version
 * of the NestJS application that doesn't listen for HTTP requests. This is
 * ideal for standalone applications like this worker, which only needs to
 * connect to the queue and process jobs.
 */
async function bootstrap() {
  // Create the application context. This will initialize all the modules,
  // including the QueueModule which connects to Redis, and all the
  // registered processors will start listening for jobs.
  await NestFactory.createApplicationContext(WorkerModule);

  // No need to call app.listen() or app.init(). The context runs until
  // the process is terminated.
}

bootstrap();
