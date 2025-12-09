// src/app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { ProductsModule } from './products/products.module';
import { CartsModule } from './carts/carts.module';
import { CartItem } from './carts/entities/cart-item.entity';
import { Cart } from './carts/entities/cart.entity';
import { Product } from './products/entities/product.entity';
import { WhatsappModule } from './whatapp/whatapp.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.POSTGRES_URL,
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
