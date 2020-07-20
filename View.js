const assert = require('assert')

const ui = require('./')
const parent = require('./AbstractView')

exports = module.exports = View

/* global HTMLElement, HTMLDocument  */

function View (tag, opts = {}) {
  assert(this instanceof View, 'use the new keyword')
  if (!(tag instanceof HTMLElement)) {
    tag = View.createElement(tag)
  }
  return parent.call(this, tag, opts)
}

View.prototype = Object.create(parent.prototype)
View.prototype.constructor = View

// HTML TEMPLATE INTERFACE
// this is the reason why this constructor depends on wui singleton

// this method allows View constructor to have a default document source
View.createElement = (tag, document = ui.$doc) => {
  assert(typeof tag === 'string')
  assert(document instanceof HTMLDocument, 'ui is not initialized')
  return document.createElement(tag)
}

// provide an accesor for wui.template
View.prototype.template = function (...args) {
  return ui.template(...args)
}

// INJECTION INTERFACE
// TODO refactor injection methods
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentElement
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentText
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentHTML
View.prototype.inject = function (tag) {
  const child = new View(tag)
  this.$.appendChild(child.$)
  return child
}

// EVENT TRIGGER INTERFACE
View.prototype.focus = function () {
  const element = this.$.querySelector('[tabindex]')
  if (element.ownerDocument.hasFocus()) {
    console.debug('setting focus to', element)
    element.focus()
  } else {
    console.debug('waiting document focus')
    ui.observe(element.ownerDocument).one('focus', event => {
      console.debug('document gained focus')
      this.focus()
      return false
    })
  }
  return this
}

/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
