/* eslint-disable import/first */
if (!self.Buffer) {
  self.Buffer = require('buffer').Buffer;
}

import {expose as ComlinkExpose} from 'comlink';
import path from 'path';
import fastGlob from 'fast-glob';
import process from 'process';
import fs from 'fs';

import Parcel from '@parcel/core';
import SimplePackageInstaller from './SimplePackageInstaller';
import {NodePackageManager} from '@parcel/package-manager';
import defaultConfigContents from '@parcel/config-default';
import memFS from '../../fs.js';
import workerFarm from '../../workerFarm.js';

import {hasBrowserslist} from '../utils';
import JSZip from 'jszip';

self.process = process;

export async function bundle(assets, options) {
  const startTime = performance.now();
  process.env = {};

  await fs.mkdirp('/src/');

  if (options.browserslist && !hasBrowserslist(assets)) {
    await fs.writeFile(`/src/.browserslistrc`, options.browserslist);
  }

  for (let f of assets) {
    const p = `/src/${f.name}`;
    await fs.mkdirp(path.dirname(p));
    await fs.writeFile(p, f.content || ' ');
  }

  const entryPoints = assets.filter(v => v.isEntry).map(v => `/src/${v.name}`);

  if (!entryPoints.length) throw new Error('No asset marked as entrypoint');

  let entryPointsOutput;
  // try {
  const bundler = new Parcel({
    entries: entryPoints,
    disableCache: true,
    mode: 'production',
    minify: options.minify,
    autoinstall: false,
    logLevel: 'verbose',
    defaultConfig: {
      ...defaultConfigContents,
      reporters: [],
      filePath: '/',
    },
    hot: false,
    inputFS: memFS,
    outputFS: memFS,
    patchConsole: false,
    scopeHoist: options.scopeHoist,
    sourceMaps: options.sourceMaps,
    publicUrl: options.publicUrl,
    distDir: '/dist',
    workerFarm,
    packageManager: new NodePackageManager(
      memFS,
      new SimplePackageInstaller(memFS),
    ),
    defaultEngines: {
      browsers: ['last 1 Chrome version'],
      node: '10',
    },
    // global: options.global,
    // contentHash: options.contentHash,
    // target: options.target,
  });
  const bundle = await bundler.run();

  const entryPointsOutputBundles = bundle.name
    ? [bundle]
    : [...bundle.childBundles];
  entryPointsOutput = new Set(entryPointsOutputBundles.map(v => v.name));
  // } catch (e) {
  //   let result = '';

  //   const {message, stack} = prettyError(e, {color: true});
  //   result += message + '\n';
  //   if (stack) {
  //     result += stack + '\n';
  //   }
  //   throw new Error(result);
  // }

  const output = [];

  for (let f of await fastGlob('/dist/**/*')) {
    output.push({
      name: f.replace(/^\/dist\//, ''),
      content: await fs.readFile(f, 'utf8'),
      isEntry: entryPointsOutput.has(f),
    });
  }

  const endTime = performance.now();
  // eslint-disable-next-line no-console
  console.info(`Bundling took ${Math.round(endTime - startTime)} milliseconds`);

  return output;
}

class ParcelWorker {
  bundle(assets, options) {
    return bundle(assets, options);
  }

  async getZip() {
    const zip = new JSZip();
    for (let f of await fastGlob('/src/*')) {
      zip.file(f, await fs.readFile(f, 'utf8'));
    }

    if (await fs.exists('/dist')) {
      for (let f of await fastGlob('/dist/**/*')) {
        zip.file(f, await fs.readFile(f, 'utf8'));
      }
    }

    return zip.generateAsync({type: 'uint8array'});
  }
}

ComlinkExpose(ParcelWorker);
