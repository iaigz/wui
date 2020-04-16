const assert = require('assert')
const path = require('path')
const pkg = require('./package.json')

const resource = (_path) => path.resolve('/node_modules', pkg.name, _path)

const $ = require('jquery')

const View = require('./AbstractView')

exports = module.exports = NotifyView

// Constructor Notifier

function NotifyView (element, opts) {
  assert(this instanceof NotifyView, 'use the new keyword')
  View.call(this, element, {
    styles: [resource('Notifier.css')],
    ...opts
  })
  return this
}

NotifyView.prototype = Object.create(View.prototype)
NotifyView.prototype.constructor = NotifyView

Array('error', 'warn', 'info').forEach(name => {
  Object.defineProperty(NotifyView.prototype, name, {
    get: function () {
      return (msg) => this.message({ type: name, message: msg })
    }
  })
})

NotifyView.prototype.message = function (msg = {}) {
  if ('string' == typeof msg) {
    msg = { message: msg }
  }
  msg = {
    type: 'info',
    timeout: 10000,
    ...msg
  }
  let $msg = $(`<p>${msg.message}</p>`)
    .addClass(`message ${msg.type}`)
    .prependTo(this.$)
    [0]
  setTimeout(() => this.remove($msg), msg.timeout)
  return this
}

NotifyView.prototype.remove = function ($msg) {
  $msg.onanimationend = () => $msg.remove()
  $msg.classList.add('fx-disapear')
}

NotifyView.prototype.ready = function (ui) {
  ui.observe(this).on('click', event => {
    if (! event.target.classList.contains('message')) return
    this.remove(event.target)
  })
}
/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
