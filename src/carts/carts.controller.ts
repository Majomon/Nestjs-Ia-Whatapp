import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CartsService } from './carts.service';

@Controller('carts')
export class CartsController {
  constructor(private readonly service: CartsService) { }

  @Get('user/:userId')
  getCart(@Param('userId') userId: string) {
    return this.service.getCartByUser(userId);
  }

  @Post('add-item')
  addItem(@Body() body: { userId: string; productId: number; qty: number }) {
    return this.service.addOrUpdateItem(body.userId, body.productId, body.qty);
  }

  @Patch(':id')
  updateItem(
    @Param('id') cartId: number,
    @Body() body: { productId: number; qty: number },
  ) {
    return this.service.updateCartItemByCartId(cartId, body.productId, body.qty);
  }

}
