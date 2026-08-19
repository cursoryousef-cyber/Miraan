import { Reflector } from '@nestjs/core';
import { SCOPED_RESOURCE_KEY } from '../../common/authz/authz.decorators';
import { TrainingRequestsController } from './training-requests.controller';

/**
 * Every row-level route must be bound to the row it names.
 *
 * The hospital-review and allocation routes always carried @ScopedResource; the
 * cluster-stage ones did not, so a manager of any cluster could approve, reject
 * or return a candidate row belonging to another cluster — confirmed over HTTP
 * before the fix, where a foreign cluster's reject returned 201.
 */
describe('training-request row routes are scope-bound', () => {
  const reflector = new Reflector();
  const proto = TrainingRequestsController.prototype as any;

  const ROW_HANDLERS = [
    'editTrainee', 'mergeTrainees', 'splitTrainee',
    'approveTrainee', 'rejectTrainee', 'returnTrainee', 'resubmitTrainee',
  ];

  it.each(ROW_HANDLERS)('%s declares a scoped resource', (name) => {
    const handler = proto[name];
    expect(typeof handler).toBe('function');
    const spec = reflector.get(SCOPED_RESOURCE_KEY, handler);
    expect(spec).toBeDefined();
    expect(spec).toMatchObject({ kind: 'trainingRequestTrainee', param: 'rowId' });
  });
});
