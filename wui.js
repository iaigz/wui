const assert = require('assert')
const path = require('path')
const pkg = require('./package.json')

const resource = (_path) => path.resolve('/node_modules', pkg.name, _path)

const $ = require('jquery')

const HtmlView = require('./AbstractView')
const Notifier = require('./Notifier')
const Section = require('./Section')

// TODO ui is an HTML View? => seems that NO
const ui = module.exports// = Object.create(null)

Object.defineProperty(ui, 'Section', { value: Section, enumerable: true })

Object.defineProperty(ui, '$doc', { value: null, writable: true })
Object.defineProperty(ui, 'head', { value: null, writable: true })
Object.defineProperty(ui, 'body', { value: null, writable: true })

// TODO backend support. see https://github.com/lukechilds/window

/* global HTMLDocument */

ui.bootstrap = (document) => {
  if (ui.$doc instanceof HTMLDocument) {
    return Promise.resolve(ui)
  }
  try {
    assert(document instanceof HTMLDocument, 'missing HTMLDocument')
    assert(ui.$doc === null, 'ui.$doc should be null')
  } catch (error) {
    return Promise.reject(error)
  }

  document.body.classList.add('loading')

  return new Promise((resolve, reject) => {
    document.addEventListener('DOMContentLoaded', () => {
      let main = document.querySelector('main')
      // provide a a container for sections, if there isn't
      if (!document.querySelector('main')) {
        console.warn('There is no main container, will inject one')
        main = document.createElement('main')
        document.body.appendChild(main)
      }
      Object.defineProperties(ui, {
        $doc: { value: document },
        head: { value: document.head },
        body: { value: document.body },
        main: { value: main },
        links: { value: document.getElementsByTagName('a') },
        sections: { value: document.getElementsByTagName('section') }
      })
      console.info('WUI initialized (DOMContentLoaded)')
      // TODO should only warn here, no injection
      if (!document.querySelector('meta[name=viewport')) {
        console.warn('will inject viewport meta tag')
        const meta = document.createElement('meta')
        meta.name = 'viewport'
        meta.content = 'width=device-width, initial-scale=1, maximum-scale=2'
        ui.head.appendChild(meta)
      }
      if (!document.querySelector('meta[rel=manifest]')) {
        console.warn('There is no webmanifest meta tag')
      }
      ui
        .assets([
          resource('fluid-typography.css'),
          resource('wui.css')
        ])
        .then(() => ui
          .plugin('notify', new Notifier(document.createElement('div')))
        )
        .then(ui => ui.deploy(ui.notify))
        .then(() => {
          window.onunhandledrejection = (event) => ui.fail(event.reason)
          window.onbeforeunload = (event) => {
            console.warn('will unload window')
            console.debug(event)
          }
          window.onpopstate = (event) => {
            if (event.state === null) return
            ui.show(event.state)
          }
          window.onsubmit = (event) => {
            event.preventDefault()
            ui.submit(event.target)
          }
          console.info('window event handlers bound')
          return ui
        })
        .then(resolve).catch(reject)
    })
  })
}

/* global EventTarget */

ui.query = $
ui.observe = (thing) => {
  // TODO event interface
  if (thing instanceof HtmlView) return $(thing.$)
  if (thing instanceof EventTarget) return $(thing)
  throw new TypeError('expecting instanceof HtmlView or EventTarget')
}

ui.fail = (error) => {
  switch (error.code) {
    case 'EWUI_LOAD_FAILURE':
      ui.notify.warn(`${error.message} (caused by ${error.real.code})`)
      ui.fail(error.real)
      console.warn(error)
      break
    case 'EWUI_HTTP_FAILURE':
      ui.notify[ui.level(error.statusCode)](error.message)
      console.log(error)
      break
    default:
      ui.notify.error(`Unhandled rejection: ${error.message} (${error.code})`)
      console.error(error)
      break
  }
}

ui.fetch = (...args) => window.fetch(...args)

// determine log severity for Http status code "$c"
ui.level = c => c > 499 ? 'error' : c > 399 ? 'warn' : c > 299 ? 'info' : 'log'

ui.HttpError = (res, data) => {
  const motto = res.status >= 500 ? 'Server Failure' : 'Request Failure'
  const error = new Error(`HTTP ${res.status} ${motto}: ${res.statusText}`)
  error.code = 'EWUI_HTTP_FAILURE'
  error.origin = res.url
  error.redirected = res.redirected
  error.statusCode = res.status
  error.statusText = res.statusText
  throw error
  // TODO recycle response data
  // const type = res.headers.get('Content-Type')
  // return res[type === 'application/json' ? 'json' : 'text']()
  //  .then(data => {
}

/* global Request, Headers */
ui.request = (url, opts = {}) => {
  // see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
  return ui.fetch(new Request(url, {
    mode: 'same-origin',
    credentials: 'same-origin',
    // cache: 'reload',
    ...opts,
    headers: new Headers({ Accept: 'application/json', ...opts.headers })
  }))
    .then(res => res.ok || res.status < 400 ? res : ui.HttpError(res))
}

/* global window, alert */
ui.submit = (form) => {
  const method = form.dataset.method || form.method
  console.info('Submit %s (%s)', form.id || form.action, method)

  if (method === 'GET') return ui.fail(new Error('Cant send a GET form'))

  const data = {}
  for (const element of form.elements) {
    element.setAttribute('disabled', '')
    // TODO: mark disableds element.dataset.wui = 'disabled-for-submit'
    const field = element.name || element.id
    if (!field) { continue }
    data[field] = element.value
  }

  return ui.load(`${method}+${form.action}`, (resolve, reject) => {
    return ui.request(form.action, {
      cache: 'reload',
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(handle)
      .then(json => {
        for (const element of form.elements) {
          // TODO research disableds: console.log(element, element.dataset)
          element.removeAttribute('disabled')
        }
        if (json.error) {
          console.error('submit error:', json.error)
          return ui.notify.error(json.error.message, form)
        }
        console.debug('after-submit, show section')
        ui.show(json)
        return ui.show(json)
      })
      .catch(reject)
      .finally(() => ui.forgetURL(`${method}+${form.action}`))
  })
}

ui.display = (location) => ui.load(location, (resolve, reject) => {
  // console.debug('display', location)
  return ui
    .request(location)
    .then(response => response.json())
    .then(section => ui.show(section))
    .then(resolve)
    .catch(reject)
    .finally(() => ui.forgetURL(location))
})

// CSS class to flag current sections/links
const _cssnav = 'selected'

ui.show = (section) => {
  if (!section.data) {
    console.warn('Non semella unha sección:', section)
    return section
  }
  console.info(`show #${section.id} (${section.path})`)
  // FIRST: remove _cssnav class for any link or section within the page
  Array.from(ui.links).forEach(a => a.classList.remove(_cssnav))
  Array.from(ui.sections).forEach(section => section.classList.remove(_cssnav))

  let $ = ui.$doc.getElementById(section.id)
  if ($ !== null) {
    console.debug('refresh section DOM')
    $.remove()
    $ = null
  }
  if ($ === null) {
    $ = ui.$doc.createElement('section')
    $.id = section.id
    $.innerHTML = section.html
    ui.deploy($, ui.main)
  }

  const links = Array.from(ui.links).filter(l => l.onclick === null)
  links.forEach(link => { link.onclick = ui.navigate })
  links.length && console.info('navigate bound for %s links', links.length)

  window.history.pushState(section, '', section.data.url || section.path)
  $.classList.add(_cssnav)
  return section
}

ui.navigate = (event) => {
  const link = event.target
  if (link.tagName !== 'A') {
    console.error('target:', link)
    throw new TypeError('ui.navigate expect an <A> Node as event target')
  }

  // no actions on links:
  if (link.attributes.target) return // with target attribute set
  if (link.attributes.href.value[0] === '#') return // with anchor href values
  // TODO if link.href === ui.$doc.location => ABORT

  // taking actions implies not allowing window to unload
  event.preventDefault()

  // link.href will return a complete location (inc. protocol, host, etc)
  ui.display(link.attributes.href.value)
    .then(() => {
      [
        // links with same href attribute value
        ui.$doc.querySelectorAll(`a[href="${link.attributes.href.value}"]`),
        // links pointing to the full location
        ui.$doc.querySelectorAll(`a[href="${link.href}"]`)
      ]
        .reduce((a, b) => a.concat(Array.from(b)), [])
        .forEach(a => a.classList.add(_cssnav))
    })
}

ui.plugins = (plugins) => {
  return Promise.all(
    Object
      .keys(plugins)
      .map(id => {
        return ui.plugin(id, plugins[id]).then(ui => ui.deploy(plugins[id]))
      })
  )
}

ui.plugin = (id, view) => {
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    assert(typeof ui[id] === 'undefined', `ui.${id} already exists`)
    assert(view instanceof HtmlView)
    assert(view.$.id === '', `${view} has id ${view.$.id}`)
  } catch (e) {
    return Promise.reject(e)
  }
  view.$.id = id
  Object.defineProperty(ui, id, { value: view, enumerable: true })
  console.info(`registered ${view} plugin as #${id}`)
  return view.styles.length ? ui.assets(view.styles) : Promise.resolve(ui)
}

ui.assets = (url) => {
  if (Array.isArray(url)) {
    return Promise.all(url.map(url => ui.assets(url)))
      .then(() => ui) // Promise.all will fulfill an arranged value
  }
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    // TODO assert url is valid url
  } catch (e) {
    return Promise.reject(e)
  }
  // TODO if /*.js$/.test(url)
  url = url.replace(`file://${process.cwd()}`, '')
  const css = ui.$doc.querySelectorAll(`link[rel=stylesheet][href="${url}"]`)
  if (css.length) {
    return Promise.resolve(ui)
  }
  // let's load styles
  return ui.load(url, (resolve, reject) => {
    const link = ui.$doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.onload = resolve
    link.onerror = reject
    ui.deploy(link, ui.head)
  })
}

Object.defineProperty(ui, '_loaded', { value: {} })
ui.isLoading = () => Object.values(ui._loaded).some(value => value === false)
ui.hasLoaded = (url) => ui._loaded[url] === true
ui.hasFailed = (url) => ui._loaded[url] && typeof ui._loaded[url] !== 'boolean'
ui.forgetURL = (url) => { delete ui._loaded[url] }
ui.load = (url, task) => {
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    if (typeof ui._loaded[url] !== 'undefined') {
      throw new ReferenceError(`Already loading "${url}"`)
    }
    // TODO assert url is valid url
    assert(typeof task === 'function', `${task} is not a function`)
  } catch (e) {
    return Promise.reject(e)
  }
  return new Promise((resolve, reject) => {
    ui._loaded[url] = false
    !ui.isLoading() && ui.body.addClass.remove('loading')

    const finish = (err, value = ui) => {
      if (ui._loaded[url] !== false) {
        return reject(new Error('finish callback called twice'))
      }
      ui._loaded[url] = err || true

      const motto = err ? 'Failed load of' : 'Loaded'
      const still = ui.isLoading() ? 'still' : 'done'
      console.debug(`${motto} ${url}, ${still} loading resources`)

      !ui.isLoading() && ui.body.classList.remove('loading')

      if (err === null) return resolve(value)
      if (err) return reject(err)

      const e = new Error(`resource ${url} failed to load`)
      e.code = 'EWUI_LOAD_FAILURE'
      e.real = err
      reject(e)
    }
    setImmediate(task, () => finish(null), (e) => finish(e))
  })
}

// returns a DocumentFragment containing specified string templates as DOM nodes
ui.template = function (...args) {
  assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
  // let's create an off-DOM element to parse the HTML strings
  const tmp = ui.$doc.createElement('div')
  tmp.innerHTML = args.join('\n')
  // now create an new document fragment
  const fragment = tmp.ownerDocument.createDocumentFragment()
  // and move each DOM node from tmp div to fragment
  while (tmp.firstChild) {
    fragment.appendChild(tmp.firstChild)
  }
  return fragment
}

/* global HTMLElement, DocumentFragment */

ui.deploy = (thing, container = ui.body) => {
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    assert(container instanceof HTMLElement, 'container must be HTMLElement')
  } catch (e) {
    return Promise.reject(e)
  }
  // string implies Text, not HTML
  if (typeof thing === 'string') {
    container.insertAdjacentText('beforeend', thing)
    return Promise.resolve(ui)
  }
  // thing should be DocumentFragment to insert multiple DOM nodes
  // HTMLElement is also honored
  if (thing instanceof HTMLElement || thing instanceof DocumentFragment) {
    container.appendChild(thing)
    return Promise.resolve(ui)
  }
  // AbstractView implemented at this package is also honored
  if (thing instanceof HtmlView) {
    return ui.deploy(thing.$, container).then(ui => thing.ready(ui))
  }
  return Promise.reject(
    new TypeError(`can't deploy ${thing} as it has an invalid type`)
  )
}

function handle (response) {
  if (!response.ok) {
    console.warn('response seems not ok')
    return console.error(response)
  }
  const head = {
    host: response.headers.get('host'),
    follow: response.headers.get('location'),
    messages: response.headers.get('X-WUI-Messages')
  }
  switch (response.status) {
    case 201:
      ui.notify.info(`Created, will follow to ${head.follow}`)
      setTimeout(() => { window.location = head.follow }, 2000)
      break
    case 200:
      ui.notify.info('Response Ok, will refresh WUI')
      window.location = window.location
      break
    default:
      alert(`No actions specified for status code ${response.status}`)
      break
  }
  console.log('response info is', head)
  return response.json()
}

// Legacy

ui.get = (...args) => new Promise((resolve, reject) => {
  $.get.apply($, args)
    .done(resolve)
    .fail(jxhr => {
      console[jxhr.status > 499 ? 'error' : 'warn'](
        'GET', args, jxhr.status, jxhr.statusText
      )
      if (jxhr.status < 400) {
        try {
          JSON.parse(jxhr.responseText)
        } catch (error) {
          assert(error instanceof SyntaxError)
          console.debug(jxhr.responseText)
          reject(error) // SyntaxError at received JSON data
        }
      } else {
        reject(jxhr.responseText)
      }
    })
})

/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
