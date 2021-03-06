/* GSB
 ------------------------
 (c) 2017-present Panates
 SQB may be freely distributed under the MIT license.
 For details and documentation:
 https://panates.github.io/gsb/
*/

const path = require('path');
const merge = require('putil-merge');
const glob = require('glob');
const {ErrorEx, SchemaError, ArgumentError} = require('./errors');
const EnumType = require('./EnumType');
const InputObjectType = require('./InputObjectType');
const InterfaceType = require('./InterfaceType');
const ObjectType = require('./ObjectType');
const ScalarType = require('./ScalarType');
const buildGraphQLSchema = require('./builder');

const {
  exportSchema,
  EXPORT_GSB,
  EXPORT_GQL,
  EXPORT_GQL_PURE
} = require('./exporter');

class SchemaBuilder {

  /**
   * @param {string} [namespace]
   */
  constructor(namespace) {
    this._types = {};
    this._calls = {};
    this._links = {};
    this._root = null;
    this._namespace = namespace;
    this._location = null;
  }

  get types() {
    return this._types;
  }

  get calls() {
    return this._calls;
  }

  get links() {
    return this._links;
  }

  get namespace() {
    return this._namespace;
  }

  get location() {
    return this._location;
  }

  addEnumType(name, def) {
    if (this._types[name])
      throw new SchemaError('A type with same name (%s) already exists', name);
    this._types[name] = new EnumType(this, name, def);
    return this;
  }

  addInputType(name, def) {
    if (this._types[name])
      throw new SchemaError('A type with same name (%s) already exists', name);
    this._types[name] = new InputObjectType(this, name, def);
    return this;
  }

  addInterfaceType(name, def) {
    if (this._types[name])
      throw new SchemaError('A type with same name (%s) already exists', name);
    this._types[name] = new InterfaceType(this, name, def);
    return this;
  }

  addObjectType(name, def) {
    if (this._types[name])
      throw new SchemaError('A type with same name (%s) already exists', name);
    this._types[name] = new ObjectType(this, name, def);
    return this;
  }

  addScalarType(name, def) {
    if (this._types[name])
      throw new SchemaError('A type with same name (%s) already exists', name);
    this._types[name] = new ScalarType(this, name, def);
    return this;
  }

  addCall(name, fn) {
    if (this._calls[name])
      throw new SchemaError('A resolver with same name (%s) already exists', name);
    if (typeof fn !== 'function')
      throw new SchemaError('You must provide function instance for resolver argument');
    this._calls[name] = fn;
    return this;
  }

  link(...schema) {
    for (const arg of schema) {
      if (!(arg instanceof SchemaBuilder))
        throw new TypeError('You must provide a Schema instance');

      if (!arg.namespace)
        throw new TypeError('Schema must have a namespace to link');

      const s = this.getSchema(arg.namespace);
      if (s) {
        if (s === this)
          throw new SchemaError('Can\'t link self');
        if (arg === s)
          return;
        throw new SchemaError('A schema with same name (%s) already linked', arg.namespace);
      }
      this._links[arg.namespace] = arg;
    }
    return this;
  }

  getSchema(namespace, recursive) {
    return this.iterateSchemas((sch) => {
      if (sch.namespace === namespace)
        return sch;
    }, recursive);
  }

  getType(name, recursive, ignoreExtensions) {
    return this.iterateSchemas((sch) => {
      const t = sch._types[name];
      if (t && (!t.extension || !ignoreExtensions))
        return t;
    }, recursive);
  }

  getCall(name, recursive) {
    return this.iterateSchemas(sch => sch._calls[name], recursive);
  }

  iterateSchemas(fn, recursive) {
    const x = fn(this);
    if (x) return x;

    const visited = new Set();
    const iterate = (schema) => {
      for (const ns of Object.keys(schema._links)) {
        const sch = schema._links[ns];
        if (visited.has(sch))
          continue;
        visited.add(sch);
        const x = fn(sch) || (recursive && iterate(sch));
        if (x) return x;
      }
    };
    return iterate(this);
  }

  /**
   *
   * @param {Object} schemaDef
   * @param {Array<string>} [schemaDef.links]
   * @param {Object} [schemaDef.typeDefs]
   * @param {Object} [schemaDef.resolvers]
   * @param {Object} [schemaDef.calls]
   * @param {Object} [options]
   * @param {Function} [options.readFile]
   * @param {String} [options.rootPath]
   * @param {*} [options.context]
   * @return {SchemaBuilder}
   */
  import(schemaDef, options) {

    if (!schemaDef) return;
    if (typeof schemaDef !== 'object')
      throw new ArgumentError('You must provide an object instance');

    /* Phase 1. Link schemas */
    if (schemaDef.links) {
      const links = (Array.isArray(schemaDef.links) ? schemaDef.links : [schemaDef.links]);
      for (const lnk of links) {
        const schemas = SchemaBuilder._load(this, lnk, options);
        if (schemas)
          this.link(...schemas);
      }
    }

    /* Phase 2. Process definition object */
    if (schemaDef.typeDefs) {
      for (const n of Object.keys(schemaDef.typeDefs)) {
        const t = schemaDef.typeDefs[n];
        switch (t.kind) {
          case 'scalar': {
            this.addScalarType(n, t);
            break;
          }
          case 'enum': {
            this.addEnumType(n, t);
            break;
          }
          case 'interface': {
            this.addInterfaceType(n, t);
            break;
          }
          case 'object': {
            this.addObjectType(n, t);
            break;
          }
          case 'input': {
            this.addInputType(n, t);
            break;
          }
        }
      }
    }

    if (schemaDef.resolvers) {
      for (const n of Object.keys(schemaDef.resolvers)) {
        const t = this.getType(n, false);
        if (!t)
          throw new ErrorEx('Unable add to resolver. Type "%s" not found in target', n);
        const rsvl = schemaDef.resolvers[n];
        switch (t.kind) {
          case 'scalar': {
            for (const k of ['serialize', 'parseValue', 'parseLiteral']) {
              if (rsvl[k])
                t[k] = rsvl[k];
            }
            break;
          }
          case 'interface': {
            /* istanbul ignore else */
            if (rsvl.__resolveType)
              t.resolveType = rsvl.__resolveType;
            break;
          }
          case 'object': {
            for (const n of Object.keys(rsvl)) {
              if (n === '__isTypeOf') {
                t.isTypeOf = rsvl[n];
                continue;
              }
              if (t.fields.get(n))
                t.fields.get(n).resolve = rsvl[n];
            }
            break;
          }
        }
      }
    }

    if (schemaDef.calls) {
      for (const n of Object.keys(schemaDef.calls)) {
        if (typeof schemaDef.calls[n] === 'function')
          this.addCall(n, schemaDef.calls[n]);
      }
    }

    return this;
  }

  /**
   *
   * @param {Object} [options]
   * @param {Integer} [options.format]
   * @param {Function} [options.resolve]
   * @return {Object}
   */
  export(options) {
    return exportSchema(this, options);
  }

  /**
   *
   * @param {Object} [options]
   * @param {Function} [options.resolve]
   * @return {Object}
   */
  build(options) {
    return buildGraphQLSchema(this, options);
  }

  toJSON() {
    return this.export();
  }

  /**
   *
   * @param {string} filePath
   * @param {Object} [options]
   * @param {Function} [options.readFile]
   * @param {string} [options.rootPath]
   * @param {*} [options.context]
   * @return {SchemaBuilder}
   * @static
   */
  static fromFile(filePath, options) {
    if (typeof filePath !== 'string')
      throw new Error('You must provide file path');
    options = (options && merge({}, options, {functions: true})) || {};
    if (!options.rootPath) {
      options.rootPath = path.dirname(path.resolve(filePath));
      filePath = path.basename(filePath);
    }
    return this._load(null, filePath, options)[0];
  }

  /**
   *
   * @param {Object} def
   * @param {Object} [options]
   * @param {Function} [options.readFile]
   * @param {string} [options.rootPath]
   * @param {*} [options.context]
   * @return {SchemaBuilder}
   * @static
   */
  static fromObject(def, options) {
    if (typeof def !== 'object')
      throw new Error('You must provide an object instance');
    options = (options && merge({}, options)) || /*istanbul ignore next */{};
    options.rootPath = path.resolve(options.rootPath ||
        /*istanbul ignore next */'./');
    return this._load(null, def, options)[0];
  }

  static _load(currSchema, v, options) {
    const rootSchema = currSchema && currSchema._root;
    options.__cache = options.__cache || {};

    const result = [];

    const processObj = (obj, filePath) => {
      if (typeof obj === 'function')
        obj = obj(options.context);

      if (typeof obj !== 'object') {
        /* istanbul ignore else */
        if (filePath)
          throw new ErrorEx('Can\'t load schema file "%s". This file doesn\'t export an object instance', filePath);
        /* istanbul ignore next */
        throw new ErrorEx('You must provide an object instance that contains schema data');
      }
      if (!obj.namespace && filePath)
        obj.namespace = path.relative(options.rootPath, filePath);

      if (obj.namespace && options.__cache[obj.namespace])
        return options.__cache[obj.namespace];

      const schema = new SchemaBuilder();
      schema._root = rootSchema;
      schema._namespace = obj.namespace;
      if (filePath)
        schema._location = path.relative(options.rootPath, filePath);
      /* istanbul ignore else */
      if (obj.namespace)
        options.__cache[obj.namespace] = schema;
      schema.import(obj, options);
      result.push(schema);
    };

    const processString = (n) => {
      const currPath = (currSchema && currSchema._location &&
          path.dirname(path.resolve(options.rootPath, currSchema._location))) ||
          options.rootPath;

      if (n.startsWith('#'))
        n = path.resolve(
            path.join(options.rootPath, n.substring(1)));
      else if (!path.isAbsolute(n))
        n = path.resolve(path.join(currPath, n));

      const files = glob.sync(n, {
        cwd: '/', root: '/', realpath: true
      });
      if (!files.length)
        files.push(n);
      for (const f of files) {
        const obj = require(f);
        processObj(obj, f);
      }
    };

    if (typeof v === 'string') {
      let n = options.readFile ? options.readFile(v, options.context) : v;
      if (Array.isArray(n)) {
        for (const k of n) {
          if (typeof k === 'string')
            processString(k);
          else
            processObj(k);
        }
        return result;
      }

      if (typeof n === 'function')
        n = n(options.context);

      if (n && typeof n === 'object') {
        /* istanbul ignore next */
        if (!n.namespace)
          throw new ErrorEx('You must provide "namespace" property');
        processObj(n);
      } else
        processString(n);
    } else
      processObj(v, path.join(options.rootPath, 'schema'));
    return result;
  }

}

module.exports = SchemaBuilder;

/** @const {Integer} */
SchemaBuilder.EXPORT_GSB = EXPORT_GSB;
/** @const {Integer} */
SchemaBuilder.EXPORT_GQL = EXPORT_GQL;
/** @const {Integer} */
SchemaBuilder.EXPORT_GQL_PURE = EXPORT_GQL_PURE;
