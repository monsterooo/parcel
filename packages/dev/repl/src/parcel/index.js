// @flow
import Parcel from '@parcel/core';
// import SimplePackageInstaller from './SimplePackageInstaller';
// import {NodePackageManager} from '@parcel/package-manager';
// import defaultConfigContents from '@parcel/config-default';
import memFS from '../../fs.js';
import workerFarm from '../../workerFarm.js';
import {prettifyTime} from '@parcel/utils';

const INPUT = {
  'index.js': `import lib from "./lib.js";
if (false) {
  console.log("dead code");
} else {
  console.log(lib);
}`,
  'lib.js': `export default 1234;`,
};

const defaultConfigContents = {
  bundler: '@parcel/bundler-default',
  transforms: {
    // 'types:*.{ts,tsx}': ['@parcel/transformer-typescript-types'],
    // 'bundle-text:*': ['@parcel/transformer-inline-string', '...'],
    // 'data-url:*': ['@parcel/transformer-inline-string', '...'],
    '*.{js,mjs,jsm,jsx,es6,ts,tsx}': [
      // "@parcel/transformer-react-refresh-babel",
      // "@parcel/transformer-babel",
      '@parcel/transformer-js',
      // "@parcel/transformer-react-refresh-wrap"
    ],
    // '*.{json,json5}': ['@parcel/transformer-json'],
    // '*.toml': ['@parcel/transformer-toml'],
    // '*.yaml': ['@parcel/transformer-yaml'],
    // '*.{gql,graphql}': ['@parcel/transformer-graphql'],
    // '*.{styl,stylus}': ['@parcel/transformer-stylus'],
    // '*.{sass,scss}': ['@parcel/transformer-sass'],
    // '*.less': ['@parcel/transformer-less'],
    // '*.css': ['@parcel/transformer-postcss', '@parcel/transformer-css'],
    // '*.sss': ['@parcel/transformer-sugarss'],
    // '*.{htm,html}': [
    //   '@parcel/transformer-posthtml',
    //   '@parcel/transformer-html',
    // ],
    // '*.pug': ['@parcel/transformer-pug'],
    // '*.coffee': ['@parcel/transformer-coffeescript'],
    // '*.mdx': ['@parcel/transformer-mdx'],
    'url:*': ['@parcel/transformer-raw'],
  },
  namers: ['@parcel/namer-default'],
  runtimes: {
    browser: [
      '@parcel/runtime-js',
      // '@parcel/runtime-browser-hmr',
      // '@parcel/runtime-react-refresh',
    ],
    'service-worker': ['@parcel/runtime-js'],
    'web-worker': ['@parcel/runtime-js'],
    node: ['@parcel/runtime-js'],
  },
  optimizers: {
    // 'data-url:*': ['...', '@parcel/optimizer-data-url'],
    // '*.css': ['@parcel/optimizer-cssnano'],
    '*.js': ['@parcel/optimizer-terser'],
    // '*.html': ['@parcel/optimizer-htmlnano'],
  },
  packagers: {
    // '*.html': '@parcel/packager-html',
    // '*.css': '@parcel/packager-css',
    '*.js': '@parcel/packager-js',
    // '*.ts': '@parcel/packager-ts',
    '*': '@parcel/packager-raw',
  },
  resolvers: ['@parcel/resolver-default'],
  reporters: [
    // '@parcel/reporter-cli',
    // '@parcel/reporter-dev-server',
    // '@parcel/reporter-bundle-analyzer',
    '@parcel/reporter-json',
  ],
};

(async () => {
  globalThis.PARCEL_JSON_LOGGER_STDOUT = d => {
    switch (d.type) {
      case 'buildStart':
        console.log('📦 Started');
        break;
      case 'buildProgress':
        let phase = d.phase.charAt(0).toUpperCase() + d.phase.slice(1);
        let filePath = d.filePath || d.bundleFilePath;
        console.log(`🕓 ${phase} ${filePath ? filePath : ''}`);
        break;
      case 'buildSuccess':
        console.log(`✅ Succeded in ${prettifyTime(d.buildTime)}`);
        break;
      case 'buildFailure':
        console.log(`❗️`, d.diagnostics);
        break;
    }
  };
  globalThis.PARCEL_JSON_LOGGER_STDERR = globalThis.PARCEL_JSON_LOGGER_STDOUT;

  const b = new Parcel({
    entries: ['/src/index.js'],
    disableCache: true,
    mode: 'production',
    minify: true,
    logLevel: 'verbose',
    defaultConfig: {
      ...defaultConfigContents,
      filePath: '/', //require.resolve('@parcel/config-default'),
    },
    hot: false,
    inputFS: memFS,
    outputFS: memFS,
    patchConsole: false,
    scopeHoist: true,
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
  for (let [name, contents] of Object.entries(INPUT)) {
    await memFS.writeFile(`/src/${name}`, contents);
    console.log(
      'Input %c%s:\n%c%s',
      'color: red',
      `/src/${name}`,
      'font-family: monospace',
      contents,
    );
  }

  await b.run();

  console.log(
    'Output %c%s:\n%c%s',
    'color: red',
    '/dist/index.js',
    'font-family: monospace',
    await memFS.readFile('/dist/index.js', 'utf8'),
  );

  await workerFarm.end();
})();
