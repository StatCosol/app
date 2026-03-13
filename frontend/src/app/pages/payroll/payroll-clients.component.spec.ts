import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { PayrollClientsComponent } from './payroll-clients.component';

describe('PayrollClientsComponent', () => {
  let component: PayrollClientsComponent;
  let fixture: ComponentFixture<PayrollClientsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayrollClientsComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(PayrollClientsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty clients initially', () => {
    expect(component.clients).toEqual([]);
    expect(component.error).toBe('');
  });
});
