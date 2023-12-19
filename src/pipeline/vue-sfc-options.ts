import { DirectiveNode, ElementNode, TransformContext } from '@vue/compiler-core';
import { CompilerOptions } from '@vue/compiler-sfc';
import * as core from '@vue/compiler-core';



export type SfcOptions = {
  /**
   * Vue's options API is enabled by default, but it can be disabled in order to save space.
   */
  disableOptionsApi?: boolean;

  /**
   * Enable Vue dev tools on production, disabled by default.
   */
  enableDevTools?: boolean;

  /**
   * If enabled, Vue will emit code for rendering SSR pages.
   */
  renderSSR?: boolean;

  /**
   * @deprecated Use pathAliases instead.
   */
  disableResolving?: boolean;

  /**
   * By default, the plugin will resolve paths matching any of the entries in the tsconfig.json "paths" setting.
   * If this option is set to false, this behaviour will be disabled. If it is set to an object,
   * it will use those entries instead of those found in the tsconfig.json file.
   */
  pathAliases?: false | Record<string, string>;

  /**
   * Strategy to use when generating IDs for components.
   *
   * If set to "hash", the ID will be derived from the .vue file path.
   * If set to an object with a "random" property, a random ID will be generated.
   * If "random" is set to a string, the random generator will be seeded with said string.
   */
  scopeId?: "hash" | { random: true | string };

  /**
   * Disable the caching of rendered SFC parts.
   */
  disableCache?: boolean;

  /**
   * Custom directives will be transformed according to the value in this object.
   *
   * If the value is a string, a property with that name will be added to the element with the same value as the directive.
   * If the value is a function and it returns a string, the same behaviour as the former case will be performed.
   * If the value is false, no property will be added.
   */
  directiveTransforms?: Record<string, string | false | ((dir: DirectiveNode, node: ElementNode, context: TransformContext) => string | undefined)>;

  /**
   * Options and plugins to pass to the PostCSS postprocessor.
   */
  postcss?: {
    options?: any;
    plugins?: any[];
  }

  /**
   * If enabled, Single File Components' CSS will be combined into the output JS files and added to <head> at runtime.
   * If generateHTML is also enabled, the CSS <style> blocks will instead be added to the generated HTML file.
   *
   * By default, separate CSS files will be generated.
   */
  cssInline?: boolean;

  /**
   * Option to add custom compiler options for vue sfc
   */
  compilerOptions?: CompilerOptions;

  /**
   * Option to pass to CSS preprocessor options in the Vue SFC compiler
   *
   * Less: https://lesscss.org/usage/#less-options
   *
   * SCSS: https://sass-lang.com/documentation/js-api/interfaces/Options
   */
  preprocessorOptions?: any; // any is the same type as compiler-sfc.d.ts allows it.

  minifyTemplate?: boolean;
}

export function getSfcTransforms(opts: SfcOptions): Record<string, core.DirectiveTransform> {
  const transforms: Record<string, core.DirectiveTransform> = {};
  if (opts.directiveTransforms) {
    for (const name in opts.directiveTransforms) {
      if (Object.prototype.hasOwnProperty.call(opts.directiveTransforms, name)) {
        const propName = opts.directiveTransforms[name];

        const transformation = (dir: core.DirectiveNode, name: string) => <core.Property>{
          key: core.createSimpleExpression(JSON.stringify(name), false),
          value: dir.exp ?? core.createSimpleExpression("void 0", false),
          loc: dir.loc,
          type: 16
        }

        if (typeof propName === "function") {
          transforms[name] = (...args) => {
            const ret = propName(args[0], args[1], args[2]);

            return {
              props: ret === undefined ? [] : [transformation(args[0], ret)]
            }
          }
        } else {
          transforms[name] = dir => ({
            props: propName === false ? [] : [transformation(dir, propName)]
          })
        }
      }
    }
  }
  return transforms;
}

export function getUrlParams(search: string): Record<string, string> {
  let hashes = search.slice(search.indexOf('?') + 1).split('&')
  return hashes.reduce((params, hash) => {
    let [key, val] = hash.split('=')
    return Object.assign(params, {[key]: decodeURIComponent(val)})
  }, {})
}