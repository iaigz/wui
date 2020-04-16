const assert = require('assert')

// Section builder
const parent = require('./View')

const prototype = Object.create(parent.prototype)
const constructor = prototype.constructor = function Section (opts = {}) {
  assert(this instanceof Section, 'use the new keyword')

  opts = {
    slug: null,
    icon: null,
    text: null,
    ...opts,
  }

  assert(opts.slug, 'Section instances must specify a slug')
  if (!opts.icon && !opts.text) opts.text = opts.slug

  parent.call(this, 'section', opts)

  Object.defineProperties(this, {
    slug: { value: opts.slug, enumerable: true },
    icon: { value: opts.icon, enumerable: true },
    text: { value: opts.text, enumerable: true },
    // TODO: href is more complex (nested sections)
    href: { get: () => { return `/${this.slug}` } },
  })

  // TODO href.split('/') => see NAVIGATION.js
  this.$.id = this.href.replace('/', '--')

  return cache[this.href] = this
}

// Section constructor stores each built section privately
const cache = {}
// so section instances can be found later
constructor.find = (params = {}) => {
  assert(params.href, 'must provide an href to find a section')
  return cache[params.href] || null
}
constructor.forEach = (fn) => {
  return Object.values(cache).forEach(fn)
}

prototype.ready = function (ui) {
  console.log(this + ' is ready')
  this.$.classList.add('loading')
  // once section is present at DOM, fetch the content
  ui.fetch(this.href).then(response => {
    switch (response.status) {
      case 200:
        return response.text().then(text => {
          this.render(text)
          this.$.classList.remove('loading')
        })
      case 404:
        this.render([
          `<h1>${this.text}: ${response.statusText}</h1>`,
          `<p>La sección "${this.href}" no existe.</p>`
        ].join('\n'))
        break
      default:
        console.error(response)
        throw new Error('Unknown response status code')
    }
    this.$.classList.remove('loading')
  })
}

prototype.render = function (data) {
  console.log(this + ' should render')
  let fragment = this.template(data)
  return parent.prototype.render.call(this, fragment)
}

module.exports = constructor
module.exports.prototype = prototype
/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
