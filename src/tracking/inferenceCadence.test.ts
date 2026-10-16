import { expect, it } from 'vitest';
import { InferenceCadence } from './inferenceCadence';

it.each([[30,24],[60,30],[30,30],[60,36]])('preserves the %i FPS camera budget at a %i FPS target', (camera,target) => {
  const cadence=new InferenceCadence();let count=0;
  for(let frame=0;frame<camera*10;frame++) if(cadence.due(frame*1000/camera,target)) {
    cadence.started(frame*1000/camera);count++;
  }
  expect(count).toBeGreaterThanOrEqual(target*10-1);
  expect(count).toBeLessThanOrEqual(target*10+1);
});
it('does not queue catch-up work after a stall and handles target changes', () => {
  const cadence=new InferenceCadence();expect(cadence.due(0,30)).toBe(true);cadence.started(0);
  expect(cadence.due(1000,30)).toBe(true);cadence.started(1000);
  expect(cadence.due(1001,30)).toBe(false);
  expect(cadence.due(1001,24)).toBe(true);
});
