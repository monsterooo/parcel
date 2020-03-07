// eslint-disable-next-line no-unused-vars
import {useCallback, useMemo} from 'preact/hooks';
import {h} from 'preact';
import path from 'path';
import mime from 'mime-types';

// eslint-disable-next-line no-unused-vars
import {Codemirror} from '@mischnic/codemirror-preact';

import {lineNumbers} from '@codemirror/next/gutter';
import {keymap} from '@codemirror/next/keymap';
import {
  history,
  redo,
  redoSelection,
  undo,
  undoSelection,
} from '@codemirror/next/history';
import {foldCode, unfoldCode, foldGutter} from '@codemirror/next/fold';
import {baseKeymap, indentSelection} from '@codemirror/next/commands';
import {bracketMatching} from '@codemirror/next/matchbrackets';
import {closeBrackets} from '@codemirror/next/closebrackets';
import {specialChars} from '@codemirror/next/special-chars';
import {multipleSelections} from '@codemirror/next/multiple-selections';
import {search, defaultSearchKeymap} from '@codemirror/next/search';
import {defaultHighlighter} from '@codemirror/next/highlight';
// import { autocomplete, startCompletion } from "@codemirror/next/autocomplete";

import {html} from '@codemirror/next/lang-html';
import {javascript} from '@codemirror/next/lang-javascript';
import {css} from '@codemirror/next/lang-css';

//import { esLint } from "@codemirror/next/lang-javascript";
//import Linter from "eslint4b-prebuilt";
//import { linter, openLintPanel } from "@codemirror/next/lint";

export default function Editor({filename, editable, content, onChange}) {
  const onTextChange =
    onChange &&
    useCallback(view => onChange(view.state.doc.toString()), [onChange]);

  // TODO t373 ?
  //let extension = path.extname(filename).slice(1);
  let extension = filename.split('.').splice(-1);

  const extensions = useMemo(
    () =>
      [
        lineNumbers(),
        specialChars(),
        history(),
        foldGutter(),
        multipleSelections(),
        extension.includes('js') || extension.includes('ts')
          ? javascript()
          : extension === 'html'
          ? html()
          : extension === 'css'
          ? css()
          : null,
        // linter(esLint(new Linter())),
        search({keymap: defaultSearchKeymap}),
        defaultHighlighter,
        bracketMatching(),
        closeBrackets,
        // autocomplete(),
        keymap({
          'Mod-z': undo,
          'Mod-Shift-z': redo,
          // "Mod-u": view => undoSelection(view) || true,
          // [ /Mac/.test(navigator.platform) ? "Mod-Shift-u" : "Alt-u"]: redoSelection,
          // Tab: indentSelection,
          // "Ctrl-Space": startCompletion
          // "Shift-Mod-m": openLintPanel
        }),
        keymap(baseKeymap),
      ].filter(Boolean),
    [extension],
  );

  return (
    <Codemirror
      value={content}
      extensions={extensions}
      onTextChange={onTextChange}
      readOnly={!editable}
    />
  );
}
