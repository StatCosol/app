import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ClientEmployeesService } from './client-employees.service';

describe('Employee enrollment register particulars', () => {
  it('retains saved address, education and skill when loading an employee for editing', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(ClientEmployeesService);
    let actual: any;
    service.getById('e1').subscribe(employee => actual = employee);
    http.expectOne(r => r.url.endsWith('/e1')).flush({ id: 'e1', address: '12 Sample Street', education: 'Diploma', skill_category: 'SKILLED' });
    expect(actual).toMatchObject({ address: '12 Sample Street', education: 'Diploma', skillCategory: 'SKILLED' });
    http.verify();
  });
});
