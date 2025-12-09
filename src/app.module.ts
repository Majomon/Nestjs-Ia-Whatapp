// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiModule } from './ai/ai.module';
import { CartsModule } from './carts/carts.module';
import { ProductsModule } from './products/products.module';
import { WhatsappModule } from './whatapp/whatapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: false }
          : false,
      autoLoadEntities: true,
      synchronize: true,
    }),

    ProductsModule,
    CartsModule,
    WhatsappModule,
    AiModule,
  ],
})
export class AppModule {}
