const $ = require('jquery')
const assert = require('assert')

exports = module.exports = View

// Pseudo-abstract constructor to allow decoupling ui singleton from View
function View (element, opts) {
  assert(this instanceof View, 'use the new keyword')
  assert(element instanceof HTMLElement, 'element must be HTMLElement')

  Object.defineProperty(this, '$', { value: element })

  this.styles = opts.styles || []
  
  this
    .addClass(this.constructor.name)

  return this
}

View.prototype.toString = function () {
  return `[${this.constructor.name} ${this.$.tagName}#${this.$.id}]`
}

View.prototype.export = function () {
  return this.removeClass(this.constructor.name).$
}

// PRIMARY INTERFACE
View.prototype.ready = function (ui) {
  // should be called AFTER the View gets deployed (inserted) to DOM
  // unlike render(), ready is expected to be called only ONCE
  return this
}
View.prototype.render = function (data) {
  // render implies clear content
  this.$.innerHTML = '' // TODO is there a better way to remove content?
  //TODO for (let child of this.$.children) this.$.removeChild(child)
  
  // no data implies nothing to render
  if (data === null) return this

  // string implies render text, not HTML
  // data should be DocumentFragment to insert multiple DOM nodes
  if ('string' === typeof data) {
    this.$.insertAdjacentText( 'beforeend', data )
  } else if (data instanceof DocumentFragment) {
    this.$.appendChild(data)
  } else if (data instanceof View) {
    this.$.appendChild(data.$)
  } else {
    throw new TypeError(`cannot render ${typeof data}`)
  }
  return this
}
View.prototype.createFragment = function () {
  // TODO sintactic sugar to cut down vanilla verbosity
  return this.$.ownerDocument.createDocumentFragment()
}

// CLASS INTERFACE (Element.classList accessors returning ${this} View)
// see https://developer.mozilla.org/es/docs/Web/API/Element/classList
Array('add', 'remove', 'toggle', 'replace').map(function (fn) {
  View.prototype[`${fn}Class`] = function (...args) {
    this.$.classList[fn].apply(this.$.classList, args)
    return this
  }
})

// INJECTION INTERFACE
// TODO refactor injection methods
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentElement
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentText
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentHTML
View.prototype.append = function (child) {
  assert(child instanceof View, 'child must inherit View')
  this.$.appendChild( child.$ )
  return this
}

/*
 * SELECTION INTERFACE
 * tagCollection and classCollection will return a "live" HTMLCollection
 * see https://developer.mozilla.org/en-US/docs/Web/API/HTMLCollection
 * and https://developer.mozilla.org/en-US/docs/Web/API/NodeList
 */
View.prototype.tagCollection = function (tagName = '*') {
  // developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
  return this.$.getElementsByTagName(tagName)
}
View.prototype.classCollection = function (classNames) {
  // developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
  return this.$.getElementsByClass(tagName)
}

Array( // methods returning jQuery
  // TODO rework to use vanilla if posible
  'find'
).map(function (fn) {
  View.prototype[fn] = function (...args) {
    return $.fn[fn].apply($(this.$), args)
  }
})

Array( // jQuery methods returning ${this} View
  // TODO use vanilla if posible
	// research Element.attributes
  'attr'
).map(function (fn) {
  View.prototype[fn] = function (...args) {
    $.fn[fn].apply($(this.$), args)
    return this
  }
})

/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
