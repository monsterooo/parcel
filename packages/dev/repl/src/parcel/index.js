import {wrap} from 'comlink';

const worker = wrap(
  new Worker('./ParcelWorker.js', {name: 'Parcel Worker Main'}),
);
// const worker = {
//   ready: Promise.resolve(true),
//   bundle(assets) {
//     return assets;
//   },
// };

export const workerLoaded = worker.ready;

export function bundle(assets, options) {
  return worker.bundle(assets, options);
}
