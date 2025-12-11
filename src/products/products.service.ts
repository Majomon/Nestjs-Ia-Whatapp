import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
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
  ) { }

  async findAll(q?: string, page = 1, limit = 100) {
    try {
      const where = q
        ? [
          { tipoPrenda: ILike(`%${q}%`) },
          { descripcion: ILike(`%${q}%`) },
        ]
        : {};

      const [data, total] = await this.productRepository.findAndCount({
        where,
        order: { id: 'ASC' },
        take: limit,
        skip: (page - 1) * limit,
      });

      return { products: data, total };
    } catch (error) {
      throw new InternalServerErrorException('Error al consultar productos');
    }
  }

  async findOne(id: number) {
    try {
      const product = await this.productRepository.findOne({ where: { id } });
      if (!product) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
      return product;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Error al obtener producto');
    }
  }

  async seedFromExcel(filePath: string) {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json<ProductRow>(workbook.Sheets[sheetName]);

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
      }

      return { message: `${data.length} productos insertados` };
    } catch (error) {
      throw new InternalServerErrorException('Error al poblar la base de datos desde Excel');
    }
  }
}