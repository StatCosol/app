import { Injectable } from '@angular/core';
import { APP_MENUS } from './menu.config';
import { MenuItem, RoleCode } from './menu.model';

@Injectable({ providedIn: 'root' })
export class MenuService {
  getMenusForRole(role: RoleCode): MenuItem[] {
    return APP_MENUS.filter(m => m.roles.includes(role));
  }
}
