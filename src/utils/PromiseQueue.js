class PromiseQueue {
  constructor(callback, options = {}) {
    this.process = callback; // READ 传入处理的函数
    this.maxConcurrent = options.maxConcurrent || Infinity; // 最大的并发数量
    this.retry = options.retry !== false;
    this.queue = [];
    this.processing = new Set();
    this.processed = new Set();
    this.numRunning = 0;
    this.runPromise = null;
    this.resolve = null;
    this.reject = null;
  }
  /**
   * // READ 添加一个job到队列任务中
   * @param {*} job
   * @param  {...any} args
   */
  add(job, ...args) {
    // 在处理中的job和当前添加的job不能相同
    if (this.processing.has(job)) {
      return;
    }

    if (this.runPromise && this.numRunning < this.maxConcurrent) {
      this._runJob(job, args); // 条件允许立即执行
    } else {
      this.queue.push([job, args]); // 条件不允许添加到队列稍后执行
    }

    this.processing.add(job); // 将job添加到处理中
  }

  run() {
    // READ 保证run只能被调用一次并且给当前对象赋值 resolve reject
    if (this.runPromise) {
      return this.runPromise;
    }

    const runPromise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });

    this.runPromise = runPromise;
    this._next();

    return runPromise;
  }

  /**
   * // READ 运行一个job
   * @param {*} job 一般来说是某个Asset对象实例
   * @param {*} args
   */
  async _runJob(job, args) {
    try {
      this.numRunning++;
      // 调用new PromiseQueue(proceess)传入的第一个参数
      // 对于Bundler就是this.processAsset
      await this.process(job, ...args);
      this.processing.delete(job);
      this.processed.add(job);
      this.numRunning--;
      this._next();
    } catch (err) {
      this.numRunning--;
      if (this.retry) {
        this.queue.push([job, args]);
      } else {
        this.processing.delete(job);
      }

      if (this.reject) {
        this.reject(err);
      }

      this._reset();
    }
  }

  /**
   * 从当前队列拿任务执行
   */
  _next() {
    if (!this.runPromise) {
      return;
    }

    if (this.queue.length > 0) {
      // 队列中有任务
      while (this.queue.length > 0 && this.numRunning < this.maxConcurrent) {
        this._runJob(...this.queue.shift()); // 依次出队执行他们
      }
    } else if (this.processing.size === 0) {
      // 队列中没有任务直接完成
      this.resolve(this.processed);
      this._reset();
    }
  }

  _reset() {
    this.processed = new Set();
    this.runPromise = null;
    this.resolve = null;
    this.reject = null;
  }
}

module.exports = PromiseQueue;
