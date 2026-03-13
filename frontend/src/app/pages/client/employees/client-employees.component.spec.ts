import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ClientEmployeesComponent } from './client-employees.component';

describe('ClientEmployeesComponent', () => {
  let component: ClientEmployeesComponent;
  let fixture: ComponentFixture<ClientEmployeesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientEmployeesComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ClientEmployeesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty employees initially', () => {
    expect(component.employees).toEqual([]);
  });

  it('should have table column definitions', () => {
    expect(component.columns.length).toBeGreaterThan(0);
  });
});
