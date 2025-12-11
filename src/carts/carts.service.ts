// src/carts/carts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { Product } from 'src/products/entities/product.entity';

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(Cart) private cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private itemRepo: Repository<CartItem>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
  ) {}

  async getCartByUser(userId: string) {
    const cart = await this.cartRepo.findOne({
      where: { userId },
      relations: ['items', 'items.product'],
    });
    if (!cart) throw new NotFoundException('Cart not found for this user');
    return cart;
  }

  async createCart(
    userId: string,
    items: { product_id: number; qty: number }[],
  ) {
    const cart = await this.cartRepo.save({ userId });

    for (const i of items) {
      const product = await this.productRepo.findOne({
        where: { id: i.product_id },
      });
      if (!product)
        throw new NotFoundException(`Product ${i.product_id} not found`);

      const item = this.itemRepo.create({
        cart,
        product,
        qty: i.qty,
      });

      await this.itemRepo.save(item);
    }

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items', 'items.product'],
    });
  }

  async updateCart(id: number, items: { product_id: number; qty: number }[]) {
    const cart = await this.cartRepo.findOne({ where: { id } });
    if (!cart) throw new NotFoundException('Cart not found');

    await this.itemRepo.delete({ cart: { id } });
    return this.createCart(cart.userId, items);
  }
}
