// src/carts/carts.controller.ts
import { Controller, Post, Patch, Body, Param } from '@nestjs/common';
import { CartsService } from './carts.service';

@Controller('carts')
export class CartsController {
  constructor(private readonly service: CartsService) {}

  @Post()
  create(@Body() body: { items: { product_id: number; qty: number }[] }) {
    return this.service.createCart(body.items);
  }

  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() body: { items: { product_id: number; qty: number }[] },
  ) {
    return this.service.updateCart(id, body.items);
  }
}
