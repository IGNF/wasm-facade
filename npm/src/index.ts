/** wasm-facade's API for the plugins: the model, the generic patterns, the target interface, the regions and the runner */
export { type Config, configOf, rootOf, type TargetConfig } from './config.ts';
export { cached, extractorOf, platformPackage, prebuilt } from './extractor.ts';
export {
  type Api,
  type Attributes,
  type Call,
  camel,
  checkedApi,
  type Declared,
  enumOf,
  type Field,
  HEADER_OF,
  joined,
  kebab,
  lowerFirst,
  NONE,
  type Param,
  SCHEMA,
  type Signature,
  snake,
  structOf,
  text,
  tsDoc,
  tsTypeOf,
  upperFirst,
  variantNames,
  wrap,
} from './model.ts';
export { apply, region } from './output.ts';
export {
  type Class,
  classes,
  converters,
  type Event,
  eventsName,
  functions,
  type OptionField,
  type Options,
  options,
  type Union,
  unions,
} from './patterns.ts';
export { pluginPath } from './plugin.ts';
export { extract, type Report, type RunOptions, readApi, run, targetsOf } from './run.ts';
export { fresh, inputsOf, modulesOf, stamp } from './stamp.ts';
export { type Context, type Output, option, type Target } from './target.ts';
export { VERSION } from './version.ts';
