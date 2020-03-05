// @flow

import type {Asset, Bundle, BundleGraph, Symbol} from '@parcel/types';
import type {NodePath} from '@babel/traverse';
import type {
  CallExpression,
  ExpressionStatement,
  Expression,
  Identifier,
  Program,
  Statement,
  StringLiteral,
} from '@babel/types';

import * as t from '@babel/types';
import template from '@babel/template';
import invariant from 'assert';
import {relativeBundlePath} from '@parcel/utils';
import {isEntry, isReferenced} from '../utils';
import {assertString} from '../utils';
import nullthrows from 'nullthrows';

const IMPORT_TEMPLATE = template.expression<
  {|ASSET_ID: StringLiteral|},
  Expression,
>('parcelRequire(ASSET_ID)');
const EXPORT_TEMPLATE = template.statement<
  {|IDENTIFIER: Identifier, ASSET_ID: StringLiteral|},
  ExpressionStatement,
>('parcelRequire.register(ASSET_ID, IDENTIFIER);');
const IMPORTSCRIPTS_TEMPLATE = template.statement<
  {|BUNDLE: StringLiteral|},
  Statement,
>('importScripts(BUNDLE);');

export function generateBundleImports(
  from: Bundle,
  bundle: Bundle,
  assets: Set<Asset>,
  path: NodePath<Program>,
) {
  let statements = [];
  if (from.env.isWorker()) {
    statements.push(
      IMPORTSCRIPTS_TEMPLATE({
        BUNDLE: t.stringLiteral(relativeBundlePath(from, bundle)),
      }),
    );
  }
  path.unshiftContainer('body', statements);

  for (let asset of assets) {
    // var ${asset.meta.exportsIdentifier}; was inserted already, add RHS
    let [decl] = nullthrows(
      path.scope.getBinding(assertString(asset.meta.exportsIdentifier)),
    )
      .path.get('init')
      .replaceWith(IMPORT_TEMPLATE({ASSET_ID: t.stringLiteral(asset.id)}));

    path.scope.getBinding('parcelRequire')?.reference(decl.get('callee'));
  }
}

export function generateExternalImport() {
  throw new Error(
    'External modules are not supported when building for browser',
  );
}

export function generateExports(
  bundleGraph: BundleGraph,
  bundle: Bundle,
  referencedAssets: Set<Asset>,
  path: NodePath<Program>,
) {
  let exported = new Set<Symbol>();
  let statements: Array<ExpressionStatement> = [];

  for (let asset of referencedAssets) {
    let exportsId = asset.meta.exportsIdentifier;
    invariant(typeof exportsId === 'string');
    exported.add(exportsId);

    statements.push(
      EXPORT_TEMPLATE({
        ASSET_ID: t.stringLiteral(asset.id),
        IDENTIFIER: t.identifier(assertString(asset.meta.exportsIdentifier)),
      }),
    );
  }

  let entry = bundle.getMainEntry();
  if (
    entry &&
    (!isEntry(bundle, bundleGraph) || isReferenced(bundle, bundleGraph))
  ) {
    let exportsId = entry.meta.exportsIdentifier;
    invariant(typeof exportsId === 'string');
    exported.add(exportsId);

    statements.push(
      EXPORT_TEMPLATE({
        ASSET_ID: t.stringLiteral(entry.id),
        IDENTIFIER: t.identifier(assertString(entry.meta.exportsIdentifier)),
      }),
    );
  }

  let decls = path.pushContainer('body', statements);
  for (let decl of decls) {
    let call = decl.get<NodePath<CallExpression>>('expression');
    path.scope
      .getBinding('parcelRequire')
      ?.reference(call.get<NodePath<Identifier>>('callee'));

    let id = call.get<NodePath<Identifier>>('arguments.1');
    path.scope.getBinding(id.node.name)?.reference(id);
  }

  return exported;
}
