### REPL Summary

It might look like much, but these are the important changes:

Building with scope hoisting or source maps results in an Out of Memory crash

### Peculiarities

Connecting with Chrome Devtools to Chrome on Android silently prevents the execution of Web Workers

### REPL Issues

**Bugs**:

- hash: use `history.replaceState`
- js preview: use util.inspect
- Safari SW: `clients` doesn't exist? disable html preview
- builtins/bundle loaders: fs.readFileSync(require.resolve)
  - load asset from memory, not from fs?
- console.log(process.env) hangs:
  - https://parcel-repl.now.sh/#JTdCJTIyY3VycmVudFByZXNldCUyMiUzQSUyMkphdmFzY3JpcHQlMjIlMkMlMjJvcHRpb25zJTIyJTNBJTdCJTIybWluaWZ5JTIyJTNBdHJ1ZSUyQyUyMnNjb3BlSG9pc3QlMjIlM0F0cnVlJTJDJTIyc291cmNlTWFwcyUyMiUzQWZhbHNlJTJDJTIyY29udGVudEhhc2glMjIlM0F0cnVlJTJDJTIyYnJvd3NlcnNsaXN0JTIyJTNBJTIyJTIyJTJDJTIycHVibGljVXJsJTIyJTNBJTIyJTIyJTJDJTIydGFyZ2V0JTIyJTNBJTIyYnJvd3NlciUyMiUyQyUyMmdsb2JhbCUyMiUzQSUyMiUyMiU3RCUyQyUyMmFzc2V0cyUyMiUzQSU1QiU1QiUyMmluZGV4LmpzJTIyJTJDJTIyY29uc29sZS5sb2cocHJvY2Vzcy5lbnYpJTIyJTJDMSU1RCUyQyU1QiUyMi5lbnYlMjIlMkMlMjJBUElfVVJMJTNEaHR0cCUzQSUyRiUyRmxvY2FsaG9zdCUzQTgwODAlMjIlNUQlNUQlN0Q=
- .babelrc isn't used:
  - `localRequire.resolve`: https://github.com/parcel-bundler/parcel/blob/599381399aaa00f02d6bd93c55ad22ca7d3fa0e6/packages/core/parcel-bundler/src/transforms/babel/babelrc.js#L272-L280
- JS Preview: show error (Uncaught ReferenceError: ... is not defined)

**Improvements**:

- use SW for JS preview as well if supported
- need a better way to distinguish iframe/app requests in SW:
  - links to other html bundles in preview aren't recognized correctly
- better caching strategy: leverage hashing but still clear sw cache

#### Features

- add test (that every preset runs without an error)
- add controls for preview iframe
- toggle for auto bundle (watcher)

#### Using Parcel's Cache

- **Without cache**: <100ms on subsequent builds
- mtime
  - "polyfill"
  - use `memfs` for mtime (but: `require(...).emitWarning is not a function`)
  - `browserfs`, add custom backend for Worker-SW access
    - is there a better way for Worker->SW communication?
- (when enabled atm, Markdown isn't updating)
- with cache, watcher-like functionality (on state change with debouncin)

##### Future/Longterm

- Add a "Show more"/”Expand" pull tab to options box
- Feedback that bundling was started/finished
- (( Lazy load large `Asset` types ))
- (( install pkg using Yarn (via custom autoinstall) ))
- use Parcel's devserver in SW
- "Production" ? NODE_ENV ? As cli flag?

- Parcel 2:
  - display graph
