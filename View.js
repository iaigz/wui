const assert = require('assert')

const ui = require('./')
const parent = require('./AbstractView')

exports = module.exports = View

function View (tag, opts = {}) {
  assert(this instanceof View, 'use the new keyword')
  return parent.call(this, View.createElement(tag), opts)
}

View.prototype = Object.create(parent.prototype)
View.prototype.constructor = View


// HTML TEMPLATE INTERFACE
// this is the reason why this constructor depends on wui singleton

// this method allows View constructor to have a default document source
View.createElement = (tag, document = ui.$doc ) => {
  assert('string' == typeof tag)
  assert(document instanceof HTMLDocument, 'ui is not initialized')
  return document.createElement(tag)
}

// returns a DocumentFragment containing specified string templates as DOM nodes
View.prototype.template = function (...args) {
  // let's create an off-DOM element to parse the HTML strings
  let tmp = View.createElement('div')
  tmp.innerHTML = args.join('\n')
  // now create an new document fragment
  let fragment = tmp.ownerDocument.createDocumentFragment()
  // and move each DOM node from tmp div to fragment
  while (tmp.firstChild) {
    fragment.appendChild(tmp.firstChild)
  }
  return fragment
}

// INJECTION INTERFACE
// TODO refactor injection methods
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentElement
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentText
// see https://developer.mozilla.org/en-US/docs/Web/API/Element/insertAdjacentHTML
View.prototype.inject = function (tag) {
  let child = new View(tag)
  this.$.appendChild(child.$)
  return child
}

// EVENT TRIGGER INTERFACE
View.prototype.focus = function () {
  let element = this.$.querySelector('[tabindex]')
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
