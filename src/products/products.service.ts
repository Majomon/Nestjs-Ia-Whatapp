// src/products/products.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  findAll(q?: string) {
    if (!q) return this.productRepository.find();
    return this.productRepository.find({
      where: [{ name: Like(`%${q}%`) }, { description: Like(`%${q}%`) }],
    });
  }

  findOne(id: number) {
    return this.productRepository.findOne({ where: { id } });
  }
}
