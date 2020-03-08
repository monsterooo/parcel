## Parcel

### 断点时机

src/utils/PromiseQueue.js \_runJob

### 弄明白编译的整体阶段

初始化 Bundler 对象，第一个参数是文件名第二个参数是一些配置项。随后运行 bundler.bundle()开始编译。

bundler.bundle: 在 bundle 函数中调用了`this.start()`去初始化`worker`,`watcher`对象

bundler.start: 加载当前进程的环境变量到`this.options.env`中。保存资源后缀(比如`.js`)所对应的解析器路径到`this.options.extensions`中。创建`Watcher`,`HMRServer`。创建一个`WorkerFarm`对象实例给`bundler.farm`

拿到入口资源路径，然后调用`resolveAsset(entry)`，这里区分了文件和目录。在 resolve 是还考虑的 alias。如果 resolve 成功这会加入到 Resolver.cache 中并返回`{path: '', pkg: {}}`。紧着着根据文件类型找到这个资源对应的 Asset 对象并创建实例(`resolveAsset`函数中完成)然后这个 Asset 将会加入到 bundler.loadedAssets 缓存中

将 Asset 对象实例加入到`buildQueue`,`entryAssets`中。代码调用`this.buildQueue.add(asset);this.entryAssets.add(asset);`。关于`buildQueue`在后面再进行分析。

之后调用了`this.buildQueue.run();`开始了编译之旅。调用栈为: buildQueue.run() -> buildQueue.\_next() -> buildQueue.\_runJob() -> buildQueue.process 注：ast,collectDependen 将会从这里开始 -> bundler.processAsset -> bundler.loadAsset -> bundler.loadAsset -> bundler.farm.run(WorkerFarm.mkhandle) -> bundler.farm.localWorker[method] 注：这里 method 为 run -> bundler.farm.run() -> pipeline.process -> Pipeline.processAsset -> bundler.asset.process 注：这里是实际的加载源代码、编译、获取依赖的地方。它返回 `{js: '编译后的代码', map: SourceMap}` -> 一些列操作回到 Pipeline.process 它最终返回 `{id, dependencies, hash, cacheData}`

2 xxx

3 xxx

4 xxx

1.  探究 PromiseQueue 和 WorkerFarm 之间的具体工作任务

2)  查看各个不同文件对应的 Asset 对象时如何处理

3.  查看 Babel6 和 Babel7 的区别
