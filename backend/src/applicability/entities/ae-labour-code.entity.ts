import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('ae_labour_code')
@Unique('UQ_AE_LABOUR_CODE', ['code'])
export class AeLabourCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'code', type: 'varchar', length: 30 })
  code: string; // WAGES | SS | IR | OSH

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;
}
