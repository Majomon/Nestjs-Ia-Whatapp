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
  ) { }

  async getCartByUser(userId: string) {
    let cart = await this.cartRepo.findOne({ where: { userId }, relations: ['items', 'items.product'] });
    if (!cart) {
      cart = await this.cartRepo.save({ userId });
    }
    return cart;
  }

  async addOrUpdateItem(userId: string, productId: number, qty: number) {
    const cart = await this.getCartByUser(userId);
    let item = cart.items.find(i => i.product.id === productId);

    if (item) {
      item.qty = qty > 0 ? item.qty + qty : 0;
      if (item.qty === 0) await this.itemRepo.remove(item);
      else await this.itemRepo.save(item);
    } else if (qty > 0) {
      const product = await this.productRepo.findOne({ where: { id: productId } });
      if (!product) throw new NotFoundException(`Producto ${productId} no encontrado`);
      item = this.itemRepo.create({ cart, product, qty });
      await this.itemRepo.save(item);
    }

    return this.getCartByUser(userId);
  }

  async updateCartItem(userId: string, productId: number, qty: number) {
    const cart = await this.getCartByUser(userId);
    const item = cart.items.find(i => i.product.id === productId);
    if (!item) throw new NotFoundException(`Producto ${productId} no existe en tu carrito`);
    if (qty === 0) await this.itemRepo.remove(item);
    else { item.qty = qty; await this.itemRepo.save(item); }
    return this.getCartByUser(userId);
  }
}
