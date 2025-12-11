// src/carts/carts.controller.ts
import { Controller, Post, Patch, Get, Body, Param } from '@nestjs/common';
import { CartsService } from './carts.service';

@Controller('carts')
export class CartsController {
  constructor(private readonly service: CartsService) { }

  @Get('user/:userId')
  getCart(@Param('userId') userId: string) {
    return this.service.getCartByUser(userId);
  }

  @Post('add-item') // coincide con tu request desde Gemini
  addItem(@Body() body: { userId: string; productId: number; qty: number }) {
    return this.service.addOrUpdateItem(body.userId, body.productId, body.qty);
  }

  @Patch('update-item')
  updateItem(@Body() body: { userId: string; productId: number; qty: number }) {
    return this.service.updateCartItem(body.userId, body.productId, body.qty);
  }
}
