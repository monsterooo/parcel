import {expose} from 'comlink';
import Parcel from '@parcel/core';
// import SimplePackageInstaller from './SimplePackageInstaller';
// import {NodePackageManager} from '@parcel/package-manager';
import defaultConfig from '@parcel/config-default';
import memFS from 'fs';
import workerFarm from '../../workerFarm.js';
// import {prettifyTime} from '@parcel/utils';

expose({
  bundle,
  ready: true,
});

async function bundle(assets, options) {
  // $FlowFixMe
  globalThis.PARCEL_DUMP_GRAPHVIZ = true;
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
  //       console.groupEnd('Output');
  //       break;
  //     case 'buildFailure':
  //       console.log(`❗️`, d.diagnostics);
  //       break;
  //   }
  // };
  // globalThis.PARCEL_JSON_LOGGER_STDERR = globalThis.PARCEL_JSON_LOGGER_STDOUT;

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
    inputFS: memFS,
    outputFS: memFS,
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

  await memFS.mkdirp('/src');
  await memFS.writeFile(
    '/package.json',
    JSON.stringify({
      engines: {node: '12'},
    }),
  );
  for (let {name, content} of assets) {
    await memFS.writeFile(`/src/${name}`, content);
  }

  await b.run();

  let output = [];
  for (let name of await memFS.readdir(`/dist`)) {
    output.push({name, content: await memFS.readFile(`/dist/${name}`, 'utf8')});
  }

  return output;
}
