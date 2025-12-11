import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tipoPrenda: string;

  @Column()
  talla: string;

  @Column()
  color: string;

  @Column('int')
  cantidadDisponible: number;

  @Column('float')
  precio50U: number;

  @Column('float')
  precio100U: number;

  @Column('float')
  precio200U: number;

  @Column()
  disponible: string;

  @Column()
  categoria: string;

  @Column()
  descripcion: string;
}