import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const email = (dto.email || '').trim().toLowerCase();

    console.log('LOGIN EMAIL:', dto.email);
    console.log('NORMALIZED EMAIL:', email);

    const user = await this.usersRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .addSelect('u.passwordHash')
      .getOne();

    console.log('USER FOUND:', !!user);
    console.log('HASH IN DB:', user?.passwordHash);

    if (!user?.passwordHash) {
      console.log('WARN: passwordHash missing from query result');
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);

    console.log('BCRYPT MATCH:', isMatch);

    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const role = await this.usersService.getRoleById(user.roleId);

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      roleId: user.roleId,
      roleCode: role.code,
      email: user.email,
      name: user.name,
      clientId: user.clientId ?? null,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        userId: user.id,
        email: user.email,
        roleCode: role.code,
        fullName: (user as any).fullName ?? user.name ?? null,
        name: user.name,
        clientId: user.clientId ?? null,
        crmId: (user as any).crmId ?? null,
      },
    };
  }
}
