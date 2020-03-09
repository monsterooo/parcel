const Path = require('path');
const crypto = require('crypto');

/**
 * A Bundle represents an output file, containing multiple assets. Bundles can have
 * child bundles, which are bundles that are loaded dynamically from this bundle.
 * Child bundles are also produced when importing an asset of a different type from
 * the bundle, e.g. importing a CSS file from JS.
 */
class Bundle {
  constructor(type, name, parent, options = {}) {
    this.type = type; // asset类型如：js map
    this.name = name; // 通常是文件绝对路径
    this.parentBundle = parent; // 父级bundle
    this.entryAsset = null; // 表示这个当前的bundle入口的asset
    this.assets = new Set(); //
    this.childBundles = new Set(); // 孩子bundle
    this.siblingBundles = new Set(); // 兄弟bundle
    this.siblingBundlesMap = new Map(); // 兄弟bundle hash表示
    this.offsets = new Map();
    this.totalSize = 0;
    this.bundleTime = 0;
    this.isolated = options.isolated; // 是否是孤立的bundle
  }

  /**
   * 根据一个asset创建一个bundle。也是就 JSAsset => Bundle对象的转换
   * @param {*} asset
   * @param {*} parentBundle
   * @param {*} options
   */
  static createWithAsset(asset, parentBundle, options) {
    let bundle = new Bundle(
      asset.type,
      Path.join(asset.options.outDir, asset.generateBundleName()),
      parentBundle,
      options
    );

    bundle.entryAsset = asset; // READ 记录来源asset
    bundle.addAsset(asset); // 将bundle添加回到asset中
    return bundle;
  }

  /**
   * 为当前bundle添加asset
   * @param {*} asset
   */
  addAsset(asset) {
    asset.bundles.add(this); // asset也添加bundle对象的指针
    this.assets.add(asset);
  }

  removeAsset(asset) {
    asset.bundles.delete(this);
    this.assets.delete(asset);
  }

  addOffset(asset, line) {
    this.offsets.set(asset, line);
  }

  getOffset(asset) {
    return this.offsets.get(asset) || 0;
  }

  /**
   * 获取当前bundle下是否有相同tye的bundle
   * @param {*} type
   */
  getSiblingBundle(type) {
    if (!type || type === this.type) {
      return this;
    }

    // READ 如果当前bundle中没有某个类型的bundle。比如 map
    if (!this.siblingBundlesMap.has(type)) {
      // READ 那么会新建一个map的bundle
      let bundle = new Bundle(
        type,
        Path.join(
          Path.dirname(this.name),
          Path.basename(this.name, Path.extname(this.name)) + '.' + type
        ),
        this // this是新建类型bundle的父bundle
      );

      this.childBundles.add(bundle); // bundle成为孩子bundle
      this.siblingBundles.add(bundle); // bundle成为兄弟bundle
      this.siblingBundlesMap.set(type, bundle); // 加入到bundleHash
    }

    return this.siblingBundlesMap.get(type);
  }

  /**
   * 创建一个childBundle
   * @param {*} entryAsset 一个asset对象
   * @param {*} options
   */
  createChildBundle(entryAsset, options = {}) {
    let bundle = Bundle.createWithAsset(entryAsset, this, options);
    this.childBundles.add(bundle); // 将创建的bundle添加到childBundles成为当前bundle的孩子
    return bundle;
  }

  createSiblingBundle(entryAsset, options = {}) {
    let bundle = this.createChildBundle(entryAsset, options);
    this.siblingBundles.add(bundle);
    return bundle;
  }

  get isEmpty() {
    return this.assets.size === 0;
  }

  getBundleNameMap(contentHash, hashes = new Map()) {
    if (this.name) {
      let hashedName = this.getHashedBundleName(contentHash);
      hashes.set(Path.basename(this.name), hashedName);
      this.name = Path.join(Path.dirname(this.name), hashedName);
    }

    for (let child of this.childBundles.values()) {
      child.getBundleNameMap(contentHash, hashes);
    }

    return hashes;
  }

  getHashedBundleName(contentHash) {
    // If content hashing is enabled, generate a hash from all assets in the bundle.
    // Otherwise, use a hash of the filename so it remains consistent across builds.
    let ext = Path.extname(this.name);
    let hash = (contentHash
      ? this.getHash()
      : Path.basename(this.name, ext)
    ).slice(-8);
    let entryAsset = this.entryAsset || this.parentBundle.entryAsset;
    let name = Path.basename(entryAsset.name, Path.extname(entryAsset.name));
    let isMainEntry = entryAsset.options.entryFiles[0] === entryAsset.name;
    let isEntry =
      entryAsset.options.entryFiles.includes(entryAsset.name) ||
      Array.from(entryAsset.parentDeps).some(dep => dep.entry);

    // If this is the main entry file, use the output file option as the name if provided.
    if (isMainEntry && entryAsset.options.outFile) {
      let extname = Path.extname(entryAsset.options.outFile);
      if (extname) {
        ext = this.entryAsset ? extname : ext;
        name = Path.basename(entryAsset.options.outFile, extname);
      } else {
        name = entryAsset.options.outFile;
      }
    }

    // If this is an entry asset, don't hash. Return a relative path
    // from the main file so we keep the original file paths.
    if (isEntry) {
      return Path.join(
        Path.relative(
          entryAsset.options.rootDir,
          Path.dirname(entryAsset.name)
        ),
        name + ext
      ).replace(/\.\.(\/|\\)/g, '__$1');
    }

    // If this is an index file, use the parent directory name instead
    // which is probably more descriptive.
    if (name === 'index') {
      name = Path.basename(Path.dirname(entryAsset.name));
    }

    // Add the content hash and extension.
    return name + '.' + hash + ext;
  }

  async package(bundler, oldHashes, newHashes = new Map()) {
    let promises = [];
    let mappings = [];

    if (!this.isEmpty) {
      let hash = this.getHash();
      newHashes.set(this.name, hash);

      if (!oldHashes || oldHashes.get(this.name) !== hash) {
        promises.push(this._package(bundler));
      }
    }

    for (let bundle of this.childBundles.values()) {
      if (bundle.type === 'map') {
        mappings.push(bundle);
      } else {
        promises.push(bundle.package(bundler, oldHashes, newHashes));
      }
    }

    await Promise.all(promises);
    for (let bundle of mappings) {
      await bundle.package(bundler, oldHashes, newHashes);
    }
    return newHashes;
  }

  async _package(bundler) {
    let Packager = bundler.packagers.get(this.type);
    let packager = new Packager(this, bundler);

    let startTime = Date.now();
    await packager.setup();
    await packager.start();

    let included = new Set();
    for (let asset of this.assets) {
      await this._addDeps(asset, packager, included);
    }

    await packager.end();

    this.totalSize = packager.getSize();

    let assetArray = Array.from(this.assets);
    let assetStartTime =
      this.type === 'map'
        ? 0
        : assetArray.sort((a, b) => a.startTime - b.startTime)[0].startTime;
    let assetEndTime =
      this.type === 'map'
        ? 0
        : assetArray.sort((a, b) => b.endTime - a.endTime)[0].endTime;
    let packagingTime = Date.now() - startTime;
    this.bundleTime = assetEndTime - assetStartTime + packagingTime;
  }

  async _addDeps(asset, packager, included) {
    if (!this.assets.has(asset) || included.has(asset)) {
      return;
    }

    included.add(asset);

    for (let depAsset of asset.depAssets.values()) {
      await this._addDeps(depAsset, packager, included);
    }

    await packager.addAsset(asset);

    const assetSize = packager.getSize() - this.totalSize;
    if (assetSize > 0) {
      this.addAssetSize(asset, assetSize);
    }
  }

  addAssetSize(asset, size) {
    asset.bundledSize = size;
    this.totalSize += size;
  }

  getParents() {
    let parents = [];
    let bundle = this;

    while (bundle) {
      parents.push(bundle);
      bundle = bundle.parentBundle;
    }

    return parents;
  }

  findCommonAncestor(bundle) {
    // Get a list of parent bundles going up to the root
    let ourParents = this.getParents();
    let theirParents = bundle.getParents();

    // Start from the root bundle, and find the first bundle that's different
    let a = ourParents.pop();
    let b = theirParents.pop();
    let last;
    while (a === b && ourParents.length > 0 && theirParents.length > 0) {
      last = a;
      a = ourParents.pop();
      b = theirParents.pop();
    }

    if (a === b) {
      // One bundle descended from the other
      return a;
    }

    return last;
  }

  getHash() {
    let hash = crypto.createHash('md5');
    for (let asset of this.assets) {
      hash.update(asset.hash);
    }

    return hash.digest('hex');
  }
}

module.exports = Bundle;
