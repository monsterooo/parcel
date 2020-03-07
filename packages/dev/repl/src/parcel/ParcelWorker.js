// @flow
import type {MemoryFS} from '@parcel/fs';

import {expose} from 'comlink';
import Parcel from '@parcel/core';
// import SimplePackageInstaller from './SimplePackageInstaller';
// import {NodePackageManager} from '@parcel/package-manager';
// import defaultConfig from '@parcel/config-default';
import memFS from 'fs';
import workerFarm from '../../workerFarm.js';
// import {prettifyTime} from '@parcel/utils';

const defaultConfig = {
  bundler: '@parcel/bundler-default',
  transformers: {
    '*.{js,mjs,jsm,jsx,es6,ts,tsx}': ['@parcel/transformer-js'],
    'url:*': ['@parcel/transformer-raw'],
  },
  namers: ['@parcel/namer-default'],
  runtimes: {
    browser: ['@parcel/runtime-js'],
    'service-worker': ['@parcel/runtime-js'],
    'web-worker': ['@parcel/runtime-js'],
    node: ['@parcel/runtime-js'],
  },
  optimizers: {
    '*.js': ['@parcel/optimizer-terser'],
  },
  packagers: {
    '*.js': '@parcel/packager-js',
    '*': '@parcel/packager-raw',
  },
  resolvers: ['@parcel/resolver-default'],
  reporters: ['@parcel/reporter-json'],
};

expose({
  bundle,
  ready: true,
});

async function bundle(assets, options) {
  // $FlowFixMe
  globalThis.PARCEL_DUMP_GRAPHVIZ = options.showGraphs;

  // globalThis.PARCEL_JSON_LOGGER_STDOUT = async d => {
  //   switch (d.type) {
  //     case 'buildStart':
  //       console.log('📦 Started');
  //       break;
  //     case 'buildProgress': {
  //       let phase = d.phase.charAt(0).toUpperCase() + d.phase.slice(1);
  //       let filePath = d.filePath || d.bundleFilePath;
  //       console.log(`🕓 ${phase} ${filePath ? filePath : ''}`);
  //       break;
  //     }
  //     case 'buildSuccess':
  //       console.log(`✅ Succeded in ${prettifyTime(d.buildTime)}`);

  //       console.group('Output');
  //       for (let {filePath} of d.bundles) {
  //         console.log(
  //           '%c%s:\n%c%s',
  //           'font-weight: bold',
  //           filePath,
  //           'font-family: monospace',
  //           await memFS.readFile(filePath, 'utf8'),
  //         );
  //       }
  //       console.groupEnd();
  //       break;
  //     case 'buildFailure':
  //       console.log(`❗️`, d.diagnostics);
  //       break;
  //   }
  // };
  // globalThis.PARCEL_JSON_LOGGER_STDERR = globalThis.PARCEL_JSON_LOGGER_STDOUT;

  // $FlowFixMe
  globalThis.memFS = memFS;
  // $FlowFixMe
  let fs: MemoryFS = memFS;

  let entries = assets.filter(v => v.isEntry).map(v => `/src/${v.name}`);
  const b = new Parcel({
    entries,
    disableCache: true,
    mode: 'production',
    minify: options.minify,
    logLevel: 'verbose',
    defaultConfig: {
      ...defaultConfig,
      reporters: ['@parcel/reporter-json'],
      filePath: '/',
    },
    hot: false,
    inputFS: fs,
    outputFS: fs,
    patchConsole: false,
    scopeHoist: options.scopeHoist,
    workerFarm,
    // packageManager: new NodePackageManager(
    //   memFS,
    //   new SimplePackageInstaller(memFS),
    // ),
    defaultEngines: {
      browsers: ['last 1 Chrome version'],
      node: '10',
    },
  });

  await fs.writeFile(
    '/package.json',
    JSON.stringify({
      engines: {node: '12'},
    }),
  );
  await fs.mkdirp('/src');
  for (let {name, content} of assets) {
    await fs.writeFile(`/src/${name}`, content);
  }
  await fs.rimraf(`/dist`);

  await b.run();

  let output = [];
  for (let name of await fs.readdir(`/dist`)) {
    output.push({name, content: await fs.readFile(`/dist/${name}`, 'utf8')});
  }

  return output;
}
