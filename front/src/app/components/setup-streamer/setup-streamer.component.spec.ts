import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SetupStreamerComponent } from './setup-streamer.component';

describe('SetupStreamerComponent', () => {
  let component: SetupStreamerComponent;
  let fixture: ComponentFixture<SetupStreamerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupStreamerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SetupStreamerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
