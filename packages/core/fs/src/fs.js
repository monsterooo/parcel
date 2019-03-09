if (process.browser) {
  const contentstream = require('contentstream');

  const memoryFS = new Map();
  window.memoryFS = memoryFS;

  exports.memoryFSClear = () => memoryFS.clear();
  exports.readFileSync = path => memoryFS.get(path);
  exports.readFile = path => Promise.resolve(exports.readFileSync(path));
  exports.writeFile = (path, data) => memoryFS.set(path, data);
  exports.stat = path => {
    if (memoryFS.has(path)) {
      // const f = memoryFS.get(path);
      return {
        isFile: () => true
      };
    }
  };
  exports.readdir = path => {
    const keys = Array.from(memoryFS.keys());
    return keys.filter(v => v.startsWith(path));
  };
  exports.unlink = path => memoryFS.delete(path);
  exports.lstat = exports.stat;
  exports.exists = path => memoryFS.has(path);
  exports.mkdirp = () => {};
  exports.createWriteStream = path => {
    return {
      write(v, cb) {
        this.bytesWritten += v.length;
        if (memoryFS.has(path)) {
          memoryFS.set(path, memoryFS.get(path) + v);
        } else {
          memoryFS.set(path, v);
        }
        cb();
      },
      end(cb) {
        cb();
      },
      bytesWritten: 0
    };
  };
  exports.createReadStream = path => {
    //TODO Accurate with md5?
    return contentstream(exports.readFileSync(path));
  };
} else {
  const {promisify} = require('@parcel/utils');
  const fs = require('fs');
  const mkdirp = require('mkdirp');
  const rimraf = require('rimraf');

  exports.readFile = promisify(fs.readFile);
  exports.readFileSync = fs.readFileSync;
  exports.writeFile = promisify(fs.writeFile);
  exports.stat = promisify(fs.stat);
  exports.readdir = promisify(fs.readdir);
  exports.unlink = promisify(fs.unlink);
  exports.rimraf = promisify(rimraf);
  exports.realpath = async function(path) {
    const realpath = promisify(fs.realpath);
    try {
      path = await realpath(path);
    } catch (e) {
      // do nothing
    }
    return path;
  };
  exports.lstat = promisify(fs.lstat);

  exports.exists = function(filename) {
    return new Promise(resolve => {
      fs.exists(filename, resolve);
    });
  };

  exports.mkdirp = promisify(mkdirp);
  exports.createWriteStream = path => fs.createWriteStream(path);
  exports.createReadStream = path => fs.createReadStream(path);
}
