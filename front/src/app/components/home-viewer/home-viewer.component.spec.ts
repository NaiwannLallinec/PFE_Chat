import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HomeViewerComponent } from './home-viewer.component';

describe('HomeViewerComponent', () => {
  let component: HomeViewerComponent;
  let fixture: ComponentFixture<HomeViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HomeViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
