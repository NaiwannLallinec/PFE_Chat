import { TestBed } from '@angular/core/testing';

import { StreamWatcherService } from './stream-watcher.service';

describe('StreamWatcherService', () => {
  let service: StreamWatcherService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(StreamWatcherService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
