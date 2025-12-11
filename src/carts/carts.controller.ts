// src/carts/carts.controller.ts
import { Controller, Post, Patch, Get, Body, Param } from '@nestjs/common';
import { CartsService } from './carts.service';

@Controller('carts')
export class CartsController {
  constructor(private readonly service: CartsService) {}

  @Post()
  create(
    @Body()
    body: {
      userId: string;
      items: { product_id: number; qty: number }[];
    },
  ) {
    return this.service.createCart(body.userId, body.items);
  }

  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() body: { items: { product_id: number; qty: number }[] },
  ) {
    return this.service.updateCart(id, body.items);
  }

  @Get('user/:userId')
  getByUser(@Param('userId') userId: string) {
    return this.service.getCartByUser(userId);
  }
}
