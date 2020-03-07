import {wrap} from 'comlink';

const worker = wrap(new Worker('./ParcelWorker.js'));

export const workerLoaded = worker.ready;

export function bundle(assets, options) {
  return worker.bundle(assets, options);
}
