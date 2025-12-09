// src/products/products.service.ts
import * as XLSX from 'xlsx';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Product } from './entities/product.entity';

interface ProductRow {
  ID?: string;
  TIPO_PRENDA: string;
  TALLA: string;
  COLOR: string;
  CANTIDAD_DISPONIBLE: number | string;
  PRECIO_50_U: number | string;
  PRECIO_100_U: number | string;
  PRECIO_200_U: number | string;
  DISPONIBLE: string;
  CATEGORÍA: string;
  DESCRIPCIÓN: string;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  // -----------------------
  // Buscar todos los productos
  // -----------------------
  async findAll(q?: string) {
    if (!q) return this.productRepository.find();
    return this.productRepository.find({
      where: [{ tipoPrenda: Like(`%${q}%`) }, { descripcion: Like(`%${q}%`) }],
    });
  }

  // -----------------------
  // Buscar producto por ID
  // -----------------------
  async findOne(id: number) {
    return this.productRepository.findOne({ where: { id } });
  }

  // -----------------------
  // Poblar la BD desde Excel
  // -----------------------
  async seedFromExcel(filePath: string) {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json<ProductRow>(
      workbook.Sheets[sheetName],
    );

    for (const row of data) {
      const product = this.productRepository.create({
        tipoPrenda: row['TIPO_PRENDA'],
        talla: row['TALLA'],
        color: row['COLOR'],
        cantidadDisponible: Number(row['CANTIDAD_DISPONIBLE']),
        precio50U: Number(row['PRECIO_50_U']),
        precio100U: Number(row['PRECIO_100_U']),
        precio200U: Number(row['PRECIO_200_U']),
        disponible: row['DISPONIBLE'],
        categoria: row['CATEGORÍA'],
        descripcion: row['DESCRIPCIÓN'],
      });

      await this.productRepository.save(product);
      console.log(`✔️ Insertado: ${product.tipoPrenda} - ${product.talla}`);
    }

    return { message: `${data.length} productos insertados` };
  }
}
