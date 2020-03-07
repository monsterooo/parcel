### REPL V1 Summary

### Peculiarities

Connecting with Chrome Devtools to Chrome on Android silently prevents the execution of Web Workers

### REPL Issues

**Bugs**:

- hash: use `history.replaceState`
- js preview: use util.inspect
- Safari SW: `clients` doesn't exist? disable html preview
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

##### Future/Longterm

- Add a "Show more"/”Expand" pull tab to options box
- Feedback that bundling was started/finished
- (( Lazy load large `Asset` types ))
- (( install pkg using Yarn (via custom autoinstall) ))
- use Parcel's devserver in SW
- "Production" ? NODE_ENV ? As cli flag?
- display graph
