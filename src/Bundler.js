const fs = require('./utils/fs');
const Resolver = require('./Resolver');
const Parser = require('./Parser');
const WorkerFarm = require('./workerfarm/WorkerFarm');
const Path = require('path');
const Bundle = require('./Bundle');
const Watcher = require('./Watcher');
const FSCache = require('./FSCache');
const HMRServer = require('./HMRServer');
const Server = require('./Server');
const {EventEmitter} = require('events');
const logger = require('./Logger');
const PackagerRegistry = require('./packagers');
const localRequire = require('./utils/localRequire');
const config = require('./utils/config');
const loadEnv = require('./utils/env');
const PromiseQueue = require('./utils/PromiseQueue');
const installPackage = require('./utils/installPackage');
const bundleReport = require('./utils/bundleReport');
const prettifyTime = require('./utils/prettifyTime');
const getRootDir = require('./utils/getRootDir');
const {glob} = require('./utils/glob');

/**
 * The Bundler is the main entry point. It resolves and loads assets,
 * creates the bundle tree, and manages the worker farm, cache, and file watcher.
 */
class Bundler extends EventEmitter {
  constructor(entryFiles, options = {}) {
    super();

    this.entryFiles = this.normalizeEntries(entryFiles);
    this.options = this.normalizeOptions(options);

    this.resolver = new Resolver(this.options);
    this.parser = new Parser(this.options);
    this.packagers = new PackagerRegistry(this.options);
    this.cache = this.options.cache ? new FSCache(this.options) : null;
    this.delegate = options.delegate || {};
    this.bundleLoaders = {};

    this.addBundleLoader('wasm', {
      browser: require.resolve('./builtins/loaders/browser/wasm-loader'),
      node: require.resolve('./builtins/loaders/node/wasm-loader')
    });
    this.addBundleLoader('css', {
      browser: require.resolve('./builtins/loaders/browser/css-loader'),
      node: require.resolve('./builtins/loaders/node/css-loader')
    });
    this.addBundleLoader('js', {
      browser: require.resolve('./builtins/loaders/browser/js-loader'),
      node: require.resolve('./builtins/loaders/node/js-loader')
    });
    this.addBundleLoader('html', {
      browser: require.resolve('./builtins/loaders/browser/html-loader'),
      node: require.resolve('./builtins/loaders/node/html-loader')
    });

    this.pending = false;
    this.loadedAssets = new Map(); // 加载的资源
    this.watchedAssets = new Map();

    this.farm = null;
    this.watcher = null;
    this.hmr = null;
    this.bundleHashes = null;
    this.error = null;
    this.buildQueue = new PromiseQueue(this.processAsset.bind(this));
    this.rebuildTimeout = null;

    logger.setOptions(this.options);
  }

  normalizeEntries(entryFiles) {
    // Support passing a single file
    if (entryFiles && !Array.isArray(entryFiles)) {
      entryFiles = [entryFiles];
    }

    // If no entry files provided, resolve the entry point from the current directory.
    if (!entryFiles || entryFiles.length === 0) {
      entryFiles = [process.cwd()];
    }

    // Match files as globs
    return entryFiles
      .reduce((p, m) => p.concat(glob.sync(m)), [])
      .map(f => Path.resolve(f));
  }

  normalizeOptions(options) {
    const isProduction =
      options.production || process.env.NODE_ENV === 'production';
    const publicURL = options.publicUrl || options.publicURL || '/';
    const watch =
      typeof options.watch === 'boolean' ? options.watch : !isProduction;
    const target = options.target || 'browser';
    const hmr =
      target === 'node'
        ? false
        : typeof options.hmr === 'boolean'
        ? options.hmr
        : watch;
    const scopeHoist =
      options.scopeHoist !== undefined ? options.scopeHoist : false;
    return {
      production: isProduction,
      outDir: Path.resolve(options.outDir || 'dist'),
      outFile: options.outFile || '',
      publicURL: publicURL,
      watch: watch,
      cache: typeof options.cache === 'boolean' ? options.cache : true,
      cacheDir: Path.resolve(options.cacheDir || '.cache'),
      killWorkers:
        typeof options.killWorkers === 'boolean' ? options.killWorkers : true,
      minify:
        typeof options.minify === 'boolean' ? options.minify : isProduction,
      target: target,
      bundleNodeModules:
        typeof options.bundleNodeModules === 'boolean'
          ? options.bundleNodeModules
          : target === 'browser',
      hmr: hmr,
      https: options.https || false,
      logLevel: isNaN(options.logLevel) ? 3 : options.logLevel,
      entryFiles: this.entryFiles,
      hmrPort: options.hmrPort || 0,
      rootDir: getRootDir(this.entryFiles),
      sourceMaps:
        (typeof options.sourceMaps === 'boolean' ? options.sourceMaps : true) &&
        !scopeHoist,
      hmrHostname:
        options.hmrHostname ||
        (options.target === 'electron' ? 'localhost' : ''),
      detailedReport: options.detailedReport || false,
      global: options.global,
      autoinstall:
        typeof options.autoinstall === 'boolean'
          ? options.autoinstall
          : !isProduction,
      scopeHoist: scopeHoist,
      contentHash:
        typeof options.contentHash === 'boolean'
          ? options.contentHash
          : isProduction,
      throwErrors:
        typeof options.throwErrors === 'boolean' ? options.throwErrors : true
    };
  }

  addAssetType(extension, path) {
    if (typeof path !== 'string') {
      throw new Error('Asset type should be a module path.');
    }

    if (this.farm) {
      throw new Error('Asset types must be added before bundling.');
    }

    this.parser.registerExtension(extension, path);
  }

  addPackager(type, packager) {
    if (this.farm) {
      throw new Error('Packagers must be added before bundling.');
    }

    this.packagers.add(type, packager);
  }

  addBundleLoader(type, paths) {
    if (typeof paths === 'string') {
      paths = {node: paths, browser: paths};
    } else if (typeof paths !== 'object') {
      throw new Error('Bundle loaders should be an object.');
    }

    for (const target in paths) {
      if (target !== 'node' && target !== 'browser') {
        throw new Error(`Unknown bundle loader target "${target}".`);
      }

      if (typeof paths[target] !== 'string') {
        throw new Error('Bundle loader should be a string.');
      }
    }

    if (this.farm) {
      throw new Error('Bundle loaders must be added before bundling.');
    }

    this.bundleLoaders[type] = paths;
  }

  async loadPlugins() {
    let relative = Path.join(this.options.rootDir, 'index');
    let pkg = await config.load(relative, ['package.json']);
    if (!pkg) {
      return;
    }

    try {
      let deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
      for (let dep in deps) {
        const pattern = /^(@.*\/)?parcel-plugin-.+/;
        if (pattern.test(dep)) {
          let plugin = await localRequire(dep, relative);
          await plugin(this);
        }
      }
    } catch (err) {
      logger.warn(err);
    }
  }

  async bundle() {
    // If another bundle is already pending, wait for that one to finish and retry.
    if (this.pending) {
      return new Promise((resolve, reject) => {
        this.once('buildEnd', () => {
          this.bundle().then(resolve, reject);
        });
      });
    }

    let isInitialBundle = !this.entryAssets;
    let startTime = Date.now();
    let initialised = !isInitialBundle;
    this.pending = true;
    this.error = null;

    logger.clear();
    logger.progress('Building...');

    try {
      // Start worker farm, watcher, etc. if needed
      await this.start();

      // Emit start event, after bundler is initialised
      this.emit('buildStart', this.entryFiles);

      // If this is the initial bundle, ensure the output directory exists, and resolve the main asset.
      if (isInitialBundle) {
        await fs.mkdirp(this.options.outDir);
        this.entryAssets = new Set();
        for (let entry of this.entryFiles) {
          try {
            let asset = await this.resolveAsset(entry);
            this.buildQueue.add(asset);
            this.entryAssets.add(asset);
          } catch (err) {
            throw new Error(
              `Cannot resolve entry "${entry}" from "${this.options.rootDir}"`
            );
          }
        }

        if (this.entryAssets.size === 0) {
          throw new Error('No entries found.');
        }

        initialised = true;
      }

      // Build the queued assets.
      let loadedAssets = await this.buildQueue.run();

      // The changed assets are any that don't have a parent bundle yet
      // plus the ones that were in the build queue.
      let changedAssets = [...this.findOrphanAssets(), ...loadedAssets];

      // Invalidate bundles
      for (let asset of this.loadedAssets.values()) {
        asset.invalidateBundle();
      }

      logger.progress(`Producing bundles...`);

      // Create a root bundle to hold all of the entry assets, and add them to the tree.
      // READ 创建一个root bundle
      this.mainBundle = new Bundle();
      for (let asset of this.entryAssets) {
        this.createBundleTree(asset, this.mainBundle); // READ 根据asset创建Bundle到mainBundle中
      }

      // If there is only one child bundle, replace the root with that bundle.
      if (this.mainBundle.childBundles.size === 1) {
        this.mainBundle = Array.from(this.mainBundle.childBundles)[0];
      }

      // Generate the final bundle names, and replace references in the built assets.
      this.bundleNameMap = this.mainBundle.getBundleNameMap(
        this.options.contentHash
      );

      for (let asset of changedAssets) {
        asset.replaceBundleNames(this.bundleNameMap);
      }

      // Emit an HMR update if this is not the initial bundle.
      if (this.hmr && !isInitialBundle) {
        this.hmr.emitUpdate(changedAssets);
      }

      logger.progress(`Packaging...`);

      // Package everything up
      this.bundleHashes = await this.mainBundle.package(
        this,
        this.bundleHashes
      );

      // Unload any orphaned assets
      this.unloadOrphanedAssets();

      let buildTime = Date.now() - startTime;
      let time = prettifyTime(buildTime);
      logger.success(`Built in ${time}.`);
      if (!this.watcher) {
        bundleReport(this.mainBundle, this.options.detailedReport);
      }

      this.emit('bundled', this.mainBundle);
      return this.mainBundle;
    } catch (err) {
      this.error = err;

      logger.error(err);

      this.emit('buildError', err);

      if (this.hmr) {
        this.hmr.emitError(err);
      }

      if (this.options.throwErrors && !this.hmr) {
        throw err;
      } else if (!this.options.watch || !initialised) {
        await this.stop();
        process.exit(1);
      }
    } finally {
      this.pending = false;
      this.emit('buildEnd');

      // If not in watch mode, stop the worker farm so we don't keep the process running.
      if (!this.watcher && this.options.killWorkers) {
        await this.stop();
      }
    }
  }

  async start() {
    if (this.farm) {
      return;
    }

    await this.loadPlugins();

    if (!this.options.env) {
      await loadEnv(Path.join(this.options.rootDir, 'index'));
      this.options.env = process.env;
    }

    this.options.extensions = Object.assign({}, this.parser.extensions);
    this.options.bundleLoaders = this.bundleLoaders;

    if (this.options.watch) {
      this.watcher = new Watcher();
      // Wait for ready event for reliable testing on watcher
      if (process.env.NODE_ENV === 'test' && !this.watcher.ready) {
        await new Promise(resolve => this.watcher.once('ready', resolve));
      }
      this.watcher.on('change', this.onChange.bind(this));
    }

    if (this.options.hmr) {
      this.hmr = new HMRServer();
      this.options.hmrPort = await this.hmr.start(this.options);
    }

    this.farm = WorkerFarm.getShared(this.options);
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.stop();
    }

    if (this.hmr) {
      this.hmr.stop();
    }

    // Watcher and hmr can cause workerfarm calls
    // keep this as last to prevent unwanted errors
    if (this.farm) {
      await this.farm.end();
    }
  }

  async getAsset(name, parent) {
    let asset = await this.resolveAsset(name, parent);
    this.buildQueue.add(asset);
    await this.buildQueue.run();
    return asset;
  }

  async resolveAsset(name, parent) {
    let {path} = await this.resolver.resolve(name, parent);
    return this.getLoadedAsset(path);
  }

  getLoadedAsset(path) {
    if (this.loadedAssets.has(path)) {
      return this.loadedAssets.get(path);
    }

    let asset = this.parser.getAsset(path, this.options); // 获取文件对应的Asset对象
    this.loadedAssets.set(path, asset); // 加入缓存

    this.watch(path, asset);
    return asset;
  }

  async watch(path, asset) {
    if (!this.watcher) {
      return;
    }

    path = await fs.realpath(path);

    if (!this.watchedAssets.has(path)) {
      this.watcher.watch(path);
      this.watchedAssets.set(path, new Set());
    }
    this.watchedAssets.get(path).add(asset);
  }

  async unwatch(path, asset) {
    path = await fs.realpath(path);
    if (!this.watchedAssets.has(path)) {
      return;
    }

    let watched = this.watchedAssets.get(path);
    watched.delete(asset);

    if (watched.size === 0) {
      this.watchedAssets.delete(path);
      this.watcher.unwatch(path);
    }
  }

  async resolveDep(asset, dep, install = true) {
    try {
      if (dep.resolved) {
        return this.getLoadedAsset(dep.resolved);
      }

      return await this.resolveAsset(dep.name, asset.name);
    } catch (err) {
      // If the dep is optional, return before we throw
      if (dep.optional) {
        return;
      }

      if (err.code === 'MODULE_NOT_FOUND') {
        let isLocalFile = /^[/~.]/.test(dep.name);
        let fromNodeModules = asset.name.includes(
          `${Path.sep}node_modules${Path.sep}`
        );

        if (
          !isLocalFile &&
          !fromNodeModules &&
          this.options.autoinstall &&
          install
        ) {
          return await this.installDep(asset, dep);
        }

        err.message = `Cannot resolve dependency '${dep.name}'`;
        if (isLocalFile) {
          const absPath = Path.resolve(Path.dirname(asset.name), dep.name);
          err.message += ` at '${absPath}'`;
        }

        await this.throwDepError(asset, dep, err);
      }

      throw err;
    }
  }

  async installDep(asset, dep) {
    // Check if module exists, prevents useless installs
    let resolved = await this.resolver.resolveModule(dep.name, asset.name);

    // If the module resolved (i.e. wasn't a local file), but the module directory wasn't found, install it.
    if (resolved.moduleName && !resolved.moduleDir) {
      try {
        await installPackage(resolved.moduleName, asset.name, {
          saveDev: false
        });
      } catch (err) {
        await this.throwDepError(asset, dep, err);
      }
    }

    return await this.resolveDep(asset, dep, false);
  }

  async throwDepError(asset, dep, err) {
    // Generate a code frame where the dependency was used
    if (dep.loc) {
      await asset.loadIfNeeded();
      err.loc = dep.loc;
      err = asset.generateErrorMessage(err);
    }

    err.fileName = asset.name;
    throw err;
  }

  // READ 它会被PromiseQueue._runJob调用
  async processAsset(asset, isRebuild) {
    if (isRebuild) {
      asset.invalidate();
      if (this.cache) {
        this.cache.invalidate(asset.name);
      }
    }
    // READ 加载资源和分析依赖的关键点。尝试从这里入手理解
    await this.loadAsset(asset);
  }

  async loadAsset(asset) {
    if (asset.processed) {
      // READ asset处理完成则不再进行处理
      return;
    }

    if (!this.error) {
      logger.progress(`Building ${asset.basename}...`);
    }

    // Mark the asset processed so we don't load it twice
    asset.processed = true;

    // First try the cache, otherwise load and compile in the background
    asset.startTime = Date.now();
    let processed = this.cache && (await this.cache.read(asset.name));
    let cacheMiss = false;
    if (!processed || asset.shouldInvalidate(processed.cacheData)) {
      processed = await this.farm.run(asset.name); // READ 这里返回的值是分析过代码依赖的。值得关注
      cacheMiss = true;
    }

    asset.endTime = Date.now();
    asset.buildTime = asset.endTime - asset.startTime;
    asset.id = processed.id;
    asset.generated = processed.generated;
    asset.hash = processed.hash;
    asset.cacheData = processed.cacheData;

    // Call the delegate to get implicit dependencies
    let dependencies = processed.dependencies;
    if (this.delegate.getImplicitDependencies) {
      let implicitDeps = await this.delegate.getImplicitDependencies(asset);
      if (implicitDeps) {
        dependencies = dependencies.concat(implicitDeps);
      }
    }

    // Resolve and load asset dependencies // READ 解析和加依赖资源
    let assetDeps = await Promise.all(
      dependencies.map(async dep => {
        if (dep.includedInParent) {
          // This dependency is already included in the parent's generated output,
          // so no need to load it. We map the name back to the parent asset so
          // that changing it triggers a recompile of the parent.
          this.watch(dep.name, asset);
        } else {
          dep.parent = asset.name;
          let assetDep = await this.resolveDep(asset, dep);
          if (assetDep) {
            await this.loadAsset(assetDep);
          }

          return assetDep;
        }
      })
    );

    // Store resolved assets in their original order // READ 将代码的依赖放入到它的asset.depAssets中
    dependencies.forEach((dep, i) => {
      asset.dependencies.set(dep.name, dep);
      let assetDep = assetDeps[i];
      if (assetDep) {
        asset.depAssets.set(dep, assetDep);
        dep.resolved = assetDep.name;
      }
    });

    logger.verbose(`Built ${asset.relativeName}...`);

    if (this.cache && cacheMiss) {
      this.cache.write(asset.name, processed);
    }
  }

  /**
   * 创建asset的bundle
   * @param {*} asset 一个Asset资源对象可是已不同的类型 js map
   * @param {*} bundle 父级的bundle
   * @param {*} dep 依赖
   * @param {*} parentBundles
   */
  createBundleTree(asset, bundle, dep, parentBundles = new Set()) {
    if (dep) {
      asset.parentDeps.add(dep);
    }

    // READ 共享传入的bundle
    if (asset.parentBundle && !bundle.isolated) {
      // If the asset is already in a bundle, it is shared. Move it to the lowest common ancestor.
      if (asset.parentBundle !== bundle) {
        let commonBundle = bundle.findCommonAncestor(asset.parentBundle);

        // If the common bundle's type matches the asset's, move the asset to the common bundle.
        // Otherwise, proceed with adding the asset to the new bundle below.
        if (asset.parentBundle.type === commonBundle.type) {
          this.moveAssetToBundle(asset, commonBundle);
          return;
        }
      } else {
        return;
      }

      // Detect circular bundles
      if (parentBundles.has(asset.parentBundle)) {
        return;
      }
    }

    // Skip this asset if it's already in the bundle.
    // Happens when circular dependencies are placed in an isolated bundle (e.g. a worker).
    if (bundle.isolated && bundle.assets.has(asset)) {
      return;
    }

    let isEntryAsset =
      asset.parentBundle && asset.parentBundle.entryAsset === asset;

    // If the asset generated a representation for the parent bundle type, and this
    // is not an async import, add it to the current bundle
    if (bundle.type && asset.generated[bundle.type] != null && !dep.dynamic) {
      bundle.addAsset(asset);
    }

    // READ 如果传入的bundle.type没有。则是mainBundle
    if ((dep && dep.dynamic) || !bundle.type) {
      // If the asset is already the entry asset of a bundle, don't create a duplicate.
      if (isEntryAsset) {
        return;
      }

      // Create a new bundle for dynamic imports
      // READ 为动态导入创建一个新的bundle
      // READ 为bundle创建一个孩子bundle
      bundle = bundle.createChildBundle(asset, dep);
    } else if (
      asset.type &&
      !this.packagers.get(asset.type).shouldAddAsset(bundle, asset)
    ) {
      // If the asset is already the entry asset of a bundle, don't create a duplicate.
      if (isEntryAsset) {
        return;
      }

      // No packager is available for this asset type, or the packager doesn't support
      // combining this asset into the bundle. Create a new bundle with only this asset.
      bundle = bundle.createSiblingBundle(asset, dep);
    } else {
      // Add the asset to the common bundle of the asset's type
      bundle.getSiblingBundle(asset.type).addAsset(asset);
    }

    // Add the asset to sibling bundles for each generated type
    // READ 将传入的asset的所有文件类型生成它们对应的bundle。并且添加到bundle的兄弟bundle中
    if (asset.type && asset.generated[asset.type]) {
      for (let t in asset.generated) {
        if (asset.generated[t]) {
          bundle.getSiblingBundle(t).addAsset(asset);
        }
      }
    }

    asset.parentBundle = bundle;
    parentBundles.add(bundle);

    // 依赖的assets创建bundle
    for (let [dep, assetDep] of asset.depAssets) {
      this.createBundleTree(assetDep, bundle, dep, parentBundles);
    }

    parentBundles.delete(bundle);
    return bundle;
  }

  moveAssetToBundle(asset, commonBundle) {
    // Never move the entry asset of a bundle, as it was explicitly requested to be placed in a separate bundle.
    if (
      asset.parentBundle.entryAsset === asset ||
      asset.parentBundle === commonBundle
    ) {
      return;
    }

    for (let bundle of Array.from(asset.bundles)) {
      if (!bundle.isolated) {
        bundle.removeAsset(asset);
      }
      commonBundle.getSiblingBundle(bundle.type).addAsset(asset);
    }

    let oldBundle = asset.parentBundle;
    asset.parentBundle = commonBundle;

    // Move all dependencies as well
    for (let child of asset.depAssets.values()) {
      if (child.parentBundle === oldBundle) {
        this.moveAssetToBundle(child, commonBundle);
      }
    }
  }

  *findOrphanAssets() {
    for (let asset of this.loadedAssets.values()) {
      if (!asset.parentBundle) {
        yield asset;
      }
    }
  }

  unloadOrphanedAssets() {
    for (let asset of this.findOrphanAssets()) {
      this.unloadAsset(asset);
    }
  }

  unloadAsset(asset) {
    this.loadedAssets.delete(asset.name);
    if (this.watcher) {
      this.unwatch(asset.name, asset);

      // Unwatch all included dependencies that map to this asset
      for (let dep of asset.dependencies.values()) {
        if (dep.includedInParent) {
          this.unwatch(dep.name, asset);
        }
      }
    }
  }

  async onChange(path) {
    let assets = this.watchedAssets.get(path);
    if (!assets || !assets.size) {
      return;
    }

    logger.clear();
    logger.progress(`Building ${Path.basename(path)}...`);

    // Add the asset to the rebuild queue, and reset the timeout.
    for (let asset of assets) {
      this.buildQueue.add(asset, true);
    }

    clearTimeout(this.rebuildTimeout);

    this.rebuildTimeout = setTimeout(async () => {
      await this.bundle();
    }, 100);
  }

  middleware() {
    this.bundle();
    return Server.middleware(this);
  }

  async serve(port = 1234, https = false) {
    this.server = await Server.serve(this, port, https);
    try {
      await this.bundle();
    } catch (e) {
      // ignore: server can still work with errored bundler
    }
    return this.server;
  }
}

module.exports = Bundler;
Bundler.Asset = require('./Asset');
Bundler.Packager = require('./packagers/Packager');
