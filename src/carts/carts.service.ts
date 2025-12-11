import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from 'src/products/entities/product.entity';
import { Repository } from 'typeorm';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';

@Injectable()
export class CartsService {
  constructor(
    @InjectRepository(Cart) private cartRepo: Repository<Cart>,
    @InjectRepository(CartItem) private itemRepo: Repository<CartItem>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
  ) { }

  async getCartByUser(userId: string) {
    try {
      let cart = await this.cartRepo.findOne({
        where: { userId },
        relations: ['items', 'items.product'],
      });
      if (!cart) {
        cart = await this.cartRepo.save({ userId });
      }
      return cart;
    } catch (error) {
      console.error('Error al obtener carrito:', error);
      throw new InternalServerErrorException('No se pudo obtener el carrito. Intente nuevamente.');
    }
  }

  async addOrUpdateItem(userId: string, productId: number, qty: number) {
    try {
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

      return await this.getCartByUser(userId);
    } catch (error) {
      console.error('Error al agregar o actualizar ítem:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('No se pudo agregar el producto al carrito.');
    }
  }

  async updateCartItemByCartId(cartId: number, productId: number, qty: number) {
    try {
      const cart = await this.cartRepo.findOne({
        where: { id: cartId },
        relations: ['items', 'items.product'],
      });
      if (!cart) throw new NotFoundException(`Carrito ${cartId} no encontrado`);

      const item = cart.items.find(i => i.product.id === productId);
      if (!item) throw new NotFoundException(`Producto ${productId} no existe en tu carrito`);

      if (qty === 0) await this.itemRepo.remove(item);
      else {
        item.qty = qty;
        await this.itemRepo.save(item);
      }

      return await this.getCartByUser(cart.userId);
    } catch (error) {
      console.error('Error al actualizar ítem del carrito:', error);
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('No se pudo actualizar el carrito.');
    }
  }
}