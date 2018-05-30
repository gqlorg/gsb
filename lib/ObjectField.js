/* GSB
 ------------------------
 (c) 2017-present Panates
 SQB may be freely distributed under the MIT license.
 For details and documentation:
 https://panates.github.io/gsb/
*/

const SchemaItem = require('./SchemaItem');
const InputObjectField = require('./InputObjectField');
const XMap = require('./XMap');
const {parseTypeString} = require('./helpers');
const {ArgumentError} = require('./errors');

class ObjectField extends SchemaItem {

  /**
   *
   * @param {ObjectType|InterfaceType} owner
   * @param {String} name
   * @param {Object|String} cfg
   * @constructor
   * @override
   */
  constructor(owner, name, cfg) {
    super(owner, name, cfg);
    this._args = new XMap((n, v) => {
      return new InputObjectField(this, n, v);
    });
    if (typeof cfg === 'object') {
      if (cfg.type) {
        const def = parseTypeString(String(cfg.type));
        this.type = def.type;
        this.list = def.list;
        this.nonNull = def.nonNull;
        this.nonNullItems = def.nonNullItems;
      }
      ['list', 'nonNull', 'nonNullItems', 'deprecationReason',
        'resolve'].forEach(n => {
        if (cfg[n] !== undefined)
          this[n] = cfg[n];
      });
      if (cfg.args)
        this._args.setAll(cfg.args);
    } else {
      const def = parseTypeString(String(cfg));
      this.type = def.type;
      this.list = def.list;
      this.nonNull = def.nonNull;
      this.nonNullItems = def.nonNullItems;
    }
  }

  /**
   *
   * @return {XMap<InputObjectField>}
   */
  get args() {
    return this._args;
  }

  /**
   *
   * @return {String}
   */
  get deprecationReason() {
    return this._deprecationReason;
  }

  /**
   *
   * @param {String} value
   */
  set deprecationReason(value) {
    this._deprecationReason = value;
  }

  /**
   *
   * @return {Boolean}
   */
  get list() {
    return this._list;
  }

  /**
   *
   * @param {Boolean} value
   */
  set list(value) {
    this._list = value;
  }

  /**
   *
   * @return {String|Function|Array<Function|String>}
   */
  get resolve() {
    return this._resolve;
  }

  /**
   *
   * @param {String|Function|Array<Function|String>} fn
   */
  set resolve(fn) {
    if (fn) {
      if (Array.isArray(fn))
        fn.forEach(i => {
          if (!(typeof i === 'function' || typeof i === 'string'))
            throw new ArgumentError('You must provide String or Function values for "resolve" property');
        });
      else if (!(typeof fn === 'function' || typeof fn === 'string'))
        throw new ArgumentError('You must provide String or Function values for "resolve" property');
    }
    this._resolve = fn;
  }

  /**
   *
   * @return {String}
   */
  get name() {
    return super.name;
  }

  /**
   *
   * @param {String} value
   * @override
   */
  set name(value) {
    if (typeof value !== 'string' ||
        !value.match(/^([A-Za-z])+\w*$/))
      throw new ArgumentError('Invalid field name "%s"', value);
    this._name = value;
  }

  /**
   *
   * @return {Boolean}
   */
  get nonNull() {
    return this._nonNull;
  }

  /**
   *
   * @param {Boolean} value
   */
  set nonNull(value) {
    this._nonNull = value;
  }

  /**
   *
   * @return {Boolean}
   */
  get nonNullItems() {
    return this._nonNullItems;
  }

  /**
   *
   * @param {Boolean} value
   */
  set nonNullItems(value) {
    this._nonNullItems = value;
  }

  /**
   *
   * @return {String}
   */
  get type() {
    return this._type;
  }

  /**
   *
   * @param {String} value
   */
  set type(value) {
    this._type = value;
  }

  toJSON() {
    const out = {};
    if (this.type)
      out.type = ((this.list ?
          ('[' + this.type + (this.nonNullItems ? '!' : '') +
              ']') : this.type)) + (this.nonNull ? '!' : '');
    if (this.description)
      out.description = this.description;
    if (this.deprecationReason)
      out.deprecationReason = this.deprecationReason;
    if (this.resolve)
      out.resolve = this.resolve;
    if (this.args.size) {
      out.args = {};
      for (const [n, f] of this.args.entries()) {
        out.args[n] = f.toJSON();
      }
    }
    return out;
  }

}

module.exports = ObjectField;