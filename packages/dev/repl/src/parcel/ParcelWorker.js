import {expose} from 'comlink';

function bundle(assets, options) {
  return assets;
}

expose({
  bundle,
  ready: true,
});
