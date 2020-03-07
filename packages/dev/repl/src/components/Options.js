// eslint-disable-next-line no-unused-vars
import {h} from 'preact';

export default function Options({values, onChange, enableBrowserslist}) {
  return (
    <div class="options file">
      <label title="Sets `--no-minify`">
        <span>Minify</span>
        <input
          type="checkbox"
          checked={values.minify}
          onChange={e => onChange('minify', e.target.checked)}
        />
      </label>
      <label title="Corresponds `--no-scope-hoist`">
        <span>Enable Scope Hoisting</span>
        <input
          type="checkbox"
          checked={values.scopeHoist}
          onChange={e => onChange('scopeHoist', e.target.checked)}
        />
      </label>
      <label title="Corresponds to `--no-source-maps`">
        <span>Source Maps</span>
        <input
          type="checkbox"
          checked={values.sourceMaps}
          onChange={e => onChange('sourceMaps', e.target.checked)}
        />
      </label>
      {/*<label title="Sets `--no-content-hash`">
        Content hashing (as opposed to path-based)
        <input
          type="checkbox"
          checked={values.contentHash}
          onChange={e => onChange("contentHash", e.target.checked)}
        />
      </label>*/}
      <label title="Not an actual CLI option, put this into .browserslistrc 😁">
        <span>
          Browserslist target, i.e.: <code>Chrome 70</code>
        </span>
        <input
          type="text"
          value={enableBrowserslist ? values.browserslist : undefined}
          disabled={!enableBrowserslist}
          placeholder={
            enableBrowserslist ? '> 0.25%' : "You've already specified a config"
          }
          onInput={e => onChange('browserslist', e.target.value)}
        />
      </label>
      {/*<label title="Sets `--global <value>`">
        Global (expose module as UMD)
        <input
          type="text"
          placeholder="[disabled]"
          onInput={e => onChange("global", e.target.value)}
        />
      </label>*/}
      <label title="Gets set as `--public-url <value>`">
        <span>Public URL</span>
        <input
          type="text"
          value={values.publicUrl}
          placeholder="/"
          onInput={e => onChange('publicUrl', e.target.value)}
        />
      </label>
      <label>
        <span>Target</span>
        <div>
          <select
            onChange={e => onChange('targetType', e.target.value)}
            value={values.targetType}
            style={{marginRight: '0.5rem'}}
          >
            <option value="browser">Browser</option>
            <option value="node">Node</option>
            <option value="electron">Electron</option>
          </select>
          <input
            type="text"
            value={values.targetEnv}
            onInput={e => onChange('targetEnv', e.target.value)}
          />
        </div>
      </label>
      <label title="env variable PARCEL_DUMP_GRAPHVIZ">
        <span>Show Graphs</span>
        <input
          type="checkbox"
          checked={values.showGraphs}
          onChange={e => onChange('showGraphs', e.target.checked)}
        />
      </label>
    </div>
  );
}
