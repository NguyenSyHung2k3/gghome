declare const module: any;
import * as express from 'express'
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(express.json())
  app.use(express.urlencoded({extended: true}));

  await app.listen(3000, () => {
    console.log(`Server is running on port: 3000`);
  });

}

bootstrap();
