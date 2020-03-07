// eslint-disable-next-line no-unused-vars
import {h} from 'preact';
import {ctrlKey} from '../utils.js';

const PATH_REGEX = /\/src\//g;

export function ParcelError({error}) {
  return (
    <Box class="error" header={<span>A build error occured:</span>}>
      {error.message.trim().replace(PATH_REGEX, '')}
    </Box>
  );
}

export function Box(props) {
  return (
    <div class={`file ${props.class || ''}`}>
      {props.header && <div class="header">{props.header}</div>}
      <div class="content">{props.children}</div>
    </div>
  );
}

export function Notes() {
  return (
    <div class="file notes">
      Hotkeys:
      <ul>
        <li> {ctrlKey} + (B or Enter): Bundle</li>
        <li> {ctrlKey} + S: Download ZIP of input (& output)</li>
      </ul>
      Note:
      <ul>
        <li>
          PostHTML&apos;s <code>removeUnusedCss</code> is disabled for a smaller
          bundle size
        </li>
      </ul>
      Known issues:
      <ul>
        <li>
          Bundle loaders (async import, importing CSS in JS) lock up the
          bundler, caused by Parcel&apos;s <code>require.resolve</code> handling
        </li>
        <li>
          Currently patching <code>sass</code> because of{' '}
          <a href="https://github.com/mbullington/node_preamble.dart/issues/14">
            this issue
          </a>
        </li>
        <li>
          Currently patching <code>htmlnano</code> because its{' '}
          <code>require</code> calls aren&apos;t statically analyzeable
        </li>
      </ul>
    </div>
  );
}
