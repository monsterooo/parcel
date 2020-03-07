if (process.env.NODE_ENV === 'development') {
  require('preact/debug');
}

import {h, render, Fragment} from 'preact';
import {useState, useEffect, useRef, useCallback} from 'preact/hooks';
import Asset from './components/Asset';
import Options from './components/Options';
import Preview from './components/Preview';
import {ParcelError, Notes, Box} from './components/helper';

import filesize from 'filesize';
import {
  PRESETS,
  hasBrowserslist,
  saveState,
  loadState,
  useDebounce,
  // downloadBuffer
} from './utils';
import {bundle, workerLoaded} from './parcel/';

// async function downloadZip() {
//   downloadBuffer('Parcel-REPL.zip', await getZip());
// }

const BUNDLING_RUNNING = Symbol('BUNDLING_RUNNING');
const BUNDLING_SUCCESS = Symbol('BUNDLING_SUCCESS');

const WORKER_STATE_LOADING = Symbol('WORKER_STATE_LOADING');
const WORKER_STATE_SUCCESS = Symbol('WORKER_STATE_SUCCESS');
const WORKER_STATE_ERROR = Symbol('WORKER_STATE_ERROR');

const DEFAULT_PRESET = 'Javascript';

/*
    this.hashDebouncer = createDebouncer(
      that =>
        saveState(
          that.state.currentPreset,
          that.state.options,
          that.state.assets,
        ),
      400,
      this,
    );

    workerLoaded.then(() =>
      this.setState({workerState: true}),
    );
*/

const hashState = loadState() || {};

function App() {
  const [assets, setAssets] = useState(
    hashState.assets || PRESETS[DEFAULT_PRESET],
  );
  const [options, setOptions] = useState(
    hashState.options || {
      minify: false,
      noScopeHoist: false,
      sourceMaps: false,
      publicUrl: '',
      targetType: 'browser',
      targetEnv: '',
      global: '',
    },
  );

  const [currentPreset, setCurrentPreset] = useState(
    hashState.currentPreset || DEFAULT_PRESET,
  );

  const [bundlingState, setBundlingState] = useState(BUNDLING_SUCCESS);
  const [workerState, setWorkerState] = useState(false);
  workerLoaded.then(() => setWorkerState(true));
  const [output, setOutput] = useState();

  const [installPrompt, setInstallPrompt] = useState(null);

  const assetsDebounced = useDebounce(assets, 500);
  useEffect(() => {
    saveState(currentPreset, options, assetsDebounced);
  }, [currentPreset, options, assetsDebounced]);
  // const hashChangeCb = useCallback(() => {
  // 	let state = loadState();
  // 	if (state) {
  // 		console.log(state)
  // 		setAssets(state.assets);
  // 		setOptions(state.options);
  // 		setCurrentPreset(state.currentPreset);
  // 	}
  // }, []);
  // useEffect(() => {
  // 	window.addEventListener("hashchange", hashChangeCb);
  // 	return () => window.removeEventListener("hashchange", hashChangeCb);
  // }, []);

  const startBundling = useCallback(async () => {
    if (bundlingState === BUNDLING_RUNNING) return;
    setBundlingState(BUNDLING_RUNNING);

    try {
      const bundleOutput = await bundle(assets, options);

      // // await new Promise(async res => {
      // //   window.addEventListener(
      // //     'message',
      // //     e => {
      // //       console.log(e);
      // //       res();
      // //     },
      // //     {once: true}
      // //   );
      // // const sw = await navigator.serviceWorker.ready;
      // // if (sw.active) {
      // //   sw.active.postMessage(await getFS());
      // // }
      // // });

      setBundlingState(BUNDLING_SUCCESS);
      setOutput(bundleOutput);
    } catch (error) {
      setBundlingState(error);
      console.error(error);
    }
  }, [assets, options]);

  const keydownCb = useCallback(
    e => {
      if (e.metaKey) {
        if (e.code === 'Enter' || e.code === 'KeyB') {
          startBundling();
        } else if (e.code === 'KeyS') {
          e.preventDefault();
          // if (output) downloadZip();
        }
      }
    },
    [startBundling],
  );

  const beforeinstallpromptCb = useCallback(e => {
    e.preventDefault();
    setInstallPrompt(e);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', keydownCb);
    window.addEventListener('beforeinstallprompt', beforeinstallpromptCb);
    return () => {
      document.removeEventListener('keydown', keydownCb);
      window.removeEventListener('beforeinstallprompt', beforeinstallpromptCb);
    };
  }, [beforeinstallpromptCb, keydownCb]);

  function updateAsset(name, prop, value) {
    setAssets(assets.map(a => (a.name === name ? {...a, [prop]: value} : a)));
  }

  return (
    <div id="app">
      <div class="row">
        <label class="presets">
          <span>Preset:</span>
          <select
            onChange={e => {
              setOutput(null);
              setCurrentPreset(e.target.value);
              setAssets(PRESETS[e.target.value]);
              setBundlingState(null);
            }}
            value={currentPreset}
          >
            {Object.keys(PRESETS).map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {assets.map(({name, content, isEntry}, i) => (
          <Asset
            key={i}
            name={name}
            onChangeName={v => {
              if (assets.find(a => a.name === v)) {
                updateAsset(name, 'name', name);
              } else {
                updateAsset(name, 'name', v);
              }
            }}
            content={content}
            onChangeContent={v => updateAsset(name, 'content', v)}
            editable
            isEntry={isEntry}
            onChangeEntry={v => updateAsset(name, 'isEntry', v)}
            onClickRemove={v =>
              this.setState(state => ({
                assets: state.assets.filter(a => a.name !== v),
              }))
            }
          />
        ))}
        <button
          class="addAsset"
          onClick={() => {
            let nameIndex = 0;
            while (
              assets.find(
                v =>
                  v.name == 'new' + (nameIndex ? `-${nameIndex}` : '') + '.js',
              )
            )
              nameIndex++;

            this.setState(state => ({
              assets: [
                ...state.assets,
                {
                  name: 'new' + (nameIndex ? `-${nameIndex}` : '') + '.js',
                  content: '',
                  isEntry: false,
                },
              ],
            }));
          }}
        >
          Add asset
        </button>
        <button
          class="start"
          disabled={bundlingState === BUNDLING_RUNNING}
          onClick={startBundling}
        >
          Bundle!
        </button>
        <Options
          values={options}
          onChange={(name, value) =>
            setOptions({
              ...options,
              [name]: value,
            })
          }
          enableBrowserslist={!hasBrowserslist(assets)}
        />
        <Notes />
      </div>
      <div class="row">
        {workerState ? (
          <div class="loadState ready">Parcel is ready</div>
        ) : (
          <div class="loadState loading">Parcel is being loaded...</div>
        )}
        {(() => {
          if (bundlingState instanceof Error) {
            return <ParcelError error={bundlingState} />;
          } else {
            return output ? (
              <Fragment>
                {output.map(({name, content}) => (
                  <Asset
                    key={name}
                    name={name.trim()}
                    content={content}
                    additionalHeader={
                      <div class="outputSize">{filesize(content.length)}</div>
                    }
                  />
                ))}
                {/*<Preview
									assets={assets}
									output={output}
									options={options}
								/>*/}
              </Fragment>
            ) : (
              <div class="file gettingStarted">
                <div>
                  Click on{' '}
                  <button
                    class="start"
                    disabled={bundlingState === BUNDLING_RUNNING}
                    onClick={startBundling}
                  >
                    Bundle!
                  </button>{' '}
                  to get started!
                </div>
              </div>
            );
          }
        })()}
        {installPrompt && (
          <button
            class="installPrompt"
            onClick={async () => {
              installPrompt.prompt();

              const result = await this.state.installPrompt.userChoice;
              if (result.outcome === 'accepted') {
                setInstallPrompt(null);
              }
            }}
          >
            Want to add this to your homescreen?
          </button>
        )}
        {output && <button /*onClick={downloadZip}*/>Download ZIP</button>}
      </div>
    </div>
  );
}

render(<App />, document.getElementById('root'));

// if ('serviceWorker' in navigator) {
//   navigator.serviceWorker.register('./sw.js').catch(error => {
//     // eslint-disable-next-line no-console
//     console.error('Service worker registration failed:', error);
//   });
// }
