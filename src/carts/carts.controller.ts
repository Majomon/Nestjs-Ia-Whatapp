// src/carts/carts.controller.ts
import { Controller, Post, Patch, Get, Body, Param } from '@nestjs/common';
import { CartsService } from './carts.service';

@Controller('carts')
export class CartsController {
  constructor(private readonly service: CartsService) { }

  // Obtener carrito del usuario (lo crea si no existe)
  @Get('user/:userId')
  getCart(@Param('userId') userId: string) {
    return this.service.getCartByUser(userId);
  }

  // Agregar o sumar cantidad de un producto
  @Post('add')
  addItem(
    @Body()
    body: { userId: string; productId: number; qty: number },
  ) {
    return this.service.addOrUpdateItem(body.userId, body.productId, body.qty);
  }

  // Actualizar cantidad de un producto específico
  @Patch('update')
  updateItem(
    @Body()
    body: { userId: string; productId: number; qty: number },
  ) {
    return this.service.updateCartItem(body.userId, body.productId, body.qty);
  }
}
