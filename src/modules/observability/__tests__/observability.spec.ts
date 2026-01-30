import { Test } from '@nestjs/testing';
import { LoggerService } from '../services/logger.service';
import { HealthService } from '../services/health.service';

describe('ObservabilityModule', () => {
  let logger: LoggerService;
  let health: HealthService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [LoggerService, HealthService],
    }).compile();

    logger = module.get(LoggerService);
    health = module.get(HealthService);
  });

  it('should log messages', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    logger.log('test', 'TestContext');
    expect(spy).toHaveBeenCalledWith('[TestContext] test');
    spy.mockRestore();
  });

  it('should return health status', async () => {
    const result = await health.check();
    expect(result.status).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });
});
