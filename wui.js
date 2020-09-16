const assert = require('assert').strict
const path = require('path')
const pkg = require('./package.json')

const resource = (_path) => path.resolve('/node_modules', pkg.name, _path)

const $ = require('jquery')
const { EventEmitter } = require('events')

const HtmlView = require('./AbstractView')
const Notifier = require('./Notifier')
const Section = require('./Section')

// TODO ui is an HTML View? => seems that NO
const ui = module.exports// = Object.create(null)

Object.defineProperty(ui, 'Section', { value: Section, enumerable: true })

Object.defineProperty(ui, '$doc', { value: null, writable: true })
Object.defineProperty(ui, 'head', { value: null, writable: true })
Object.defineProperty(ui, 'body', { value: null, writable: true })

// following flags enable/disable specific debug logging to console
// they may be enabled through exports.log[flag] = true
// they are stored privately within this module's closure
const _log = {}
'init,load,nav,form'.split(',').forEach(flag => { _log[flag] = false })

Object.defineProperty(ui, 'log', { value: {} })
Object.defineProperties(ui.log, Object.keys(_log).reduce((obj, key) => ({
  ...obj,
  [key]: { get: () => _log[key], set: bool => { _log[key] = !!bool } }
}), {}))

// TODO backend support. see https://github.com/lukechilds/window

/* global HTMLDocument */

ui.bootstrap = (document, assets = []) => {
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
      _log.init && console.info('WUI initialized (DOMContentLoaded)')
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
      Promise.all([
        ui.assets([
          resource('fluid-typography.css'),
          resource('wui.css'),
          ...assets
        ]),
        ui.plugin('notify', new Notifier(document.createElement('div')))
      ])
        .then(() => ui.deploy(ui.notify))
        .then(() => {
          window.onunhandledrejection = (event) => ui.fail(event.reason)
          window.onbeforeunload = (event) => {
            if (!ui._emitter.listenerCount('beforeunload')) {
              return console.info('will unload window', { event })
            }
            ui._emitter.emit('beforeunload', event)
            console.info('there are beforeunload listeners', { event })
          }
          window.onpopstate = (event) => {
            const { state } = event
            if (state === null) return
            if (state.id) ui.body.classList.remove(state.id)
            if (state.root) ui.body.classList.remove(state.root)
            if (state.data.html) return ui.show(state)
            if (state.data.url) return ui.display(state.data.url)
            console.warn('Poped state does not contain html or url', {
              state, event
            })
          }
          window.onsubmit = (event) => {
            event.preventDefault()
            ui.submit(event.target, event.submitter)
          }
          _log.init && console.info('window event handlers bound')
          return ui
        })
        .then(resolve).catch(reject)
    })
  })
}

let _ini = true
ui.ready = (error = null, $dom = ui.body) => {
  ((_ini && _log.init) || (!_ini && _log.nav)) &&
    console.info('WUI becomes ready', _ini ? 'for first time' : 'again')
  if (error) {
    $dom.classList.add('ready-error')
    return Promise.resolve(error)
  }
  if (_ini) {
    // TODO this is dirty
    setTimeout(() => $dom.classList.add('ready'), 500)
  }

  // FIRST: remove _cssnav class from links within the DOM
  const prev = Array.from(ui.links)
    .filter(link => link.classList.contains(_cssnav))
  prev.forEach(a => a.classList.remove(_cssnav))
  _log.nav && prev.length && console.info(
    'remove _cssnav from %s links', prev.length, { links: prev }
  )
  const post = [
    /* global location */
    // links pointing to the location pathname
    ui.$doc.querySelectorAll(`a[href="${location.pathname}"]`),
    // links pointing to the location URL
    ui.$doc.querySelectorAll(`a[href="${location}"]`)
  ]
    .reduce((a, b) => a.concat(Array.from(b)), [])
  post.forEach(a => a.classList.add(_cssnav))
  _log.nav && post.length && console.info(
    'add _cssnav to %s links', post.length, { links: post }
  )

  // OLD "ui.captureLinks()"
  const links = Array.from(ui.links).filter(l => {
    return l.onclick === null && l.target !== '_self'
  })
  links.forEach(link => { link.onclick = ui.navigate })
  _log.nav && links.length && console.info(
    'navigate bound for %s links', links.length, { links }
  )

  setImmediate(() => {
    ui._emitter.emit('ready', _ini, $dom)
    if (_ini) _ini = false
  })
  return Promise.resolve(null)
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
      // TODO /^NetworkError/ (instanceof TypeError)
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

Object.defineProperty(ui, '_emitter', { value: new EventEmitter() })
ui.on = (...args) => {
  ui._emitter.on(...args)
  return ui
}

/* global Request, Headers */
ui.request = (url, opts = {}, context = null) => {
  // see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
  return ui.fetch(new Request(url, {
    mode: 'same-origin',
    credentials: 'same-origin',
    // cache: 'reload',
    ...opts,
    headers: new Headers({ Accept: 'application/json', ...opts.headers })
  }))
    .then(response => new Promise((resolve, reject) => {
      const rets = ui._emitter.emit('response', response, {
        code: response.status,
        text: response.statusMessage,
        // host: response.headers.get('host'),
        follow: response.headers.get('location'),
        // messages: response.headers.get('X-WUI-Messages'),
        ...context
      }, (error = null, fullfill = ui) => {
        if (error) return reject(error)
        resolve(fullfill)
      })
      if (!rets) console.warn('emited response event returns', rets)
    }))
}

/* global window */
ui.assign = (object, keys, value) => {
  if (typeof keys === 'string') keys = keys.split('.')
  return keys.reduce((obj, key, idx) => {
    if (idx === keys.length - 1) {
      /* _log.form && console.debug('assign', {
        obj, key, value,
        isArrayObj: Array.isArray(obj),
        isArrayKey: Array.isArray(obj[key])
      }) // */
      obj[key] = value
      return object
    }
    /* TODO if (key === '[]') {
      if (!Array.isArray(obj)) throw new TypeError('Expected an array')
      if (!obj.length) obj.push({})
      console.warn('Key is an unknown array index', {
        obj, next: keys[idx + 1], nextIsLast: idx + 1 === keys.length - 1,
        heyjoe: obj[obj.length - 1][keys[idx + 1]]
      })
      return obj[obj.length - 1]
    } // */
    if (obj[key] === undefined) {
      obj[key] = keys[idx + 1] === '[]' ? [] : {}
      // console.debug('created obj[key] = val', { obj, key, val: obj[key] })
    }
    return obj[key]
  }, object)
}

ui.submit = (form, submitter) => {
  const method = form.dataset.method || form.method
  _log.form && console.info('Submit', form)

  if (method === 'GET') return ui.fail(new Error('Cant send a GET form'))

  const data = {}
  _log.form && console.debug('disabling form controls and serializing data...')
  for (const element of form.elements) {
    element.dataset.disabled = element.disabled
    element.disabled = true
    // TODO: mark disableds as element.dataset.wui = 'disabled-for-submit'
    const field = element.name || element.id
    if (!field) { continue }

    const parts = field.split(/\]\[|\[|\]/g).map((key, idx, arr) => {
      return key === '' && idx < arr.length - 1 ? '[]' : key
    })
    if (parts[0] === '[]') parts.shift()
    if (parts[parts.length - 1] === '') parts.pop()
    // _log.form && console.debug({ field, parts })

    const { type, value } = element
    if (type === 'checkbox') {
      if (element.checked) ui.assign(data, parts, true)
      continue
    }
    if (type === 'submit') {
      _log.form && console.debug(
        `is ${field} form submitter?`, element === submitter
      )
      // omit submits not being the form submitter
      if (element !== submitter) { continue }
    }
    ui.assign(data, parts, type === 'number' ? value * 1 : value)
  }
  _log.form && console.log(data)

  /* global CustomEvent */
  form.dispatchEvent(new CustomEvent('submit:before', { detail: { data } }))

  return ui.request(form.action, {
    cache: 'reload',
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }, { form }).finally(() => {
    _log.form && console.debug('enabling form controls...')
    for (const element of form.elements) {
      // TODO research disableds: console.log(element, element.dataset)
      if (!JSON.parse(element.dataset.disabled)) {
        element.removeAttribute('disabled')
      }
      element.removeAttribute('data-disabled')
    }
  })
}

ui.display = (location) => ui.load(location, (resolve, reject) => {
  // console.debug('display', location)
  return ui
    .request(location)
    // .then(response => response.json())
    // .then(section => ui.show(section))
    .then(resolve)
    .catch(reject)
    .finally(() => ui.forgetURL(location))
})

// CSS class to flag current sections/links
const _cssnav = 'selected'

ui.show = (section) => {
  if (!section.data) {
    console.trace('Missing section.data:', section)
    return Promise.resolve(section)
  }
  _log.nav && console.info(`show #${section.id} (${section.path})`)
  return Promise.all(Array.from(ui.sections)
    .filter(section => section.classList.contains(_cssnav))
    .map(section => new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        const error = new Error('Timed out awaiting animation end')
        error.$dom = section
        reject(error)
      }, 10000)
      section.onanimationend = () => {
        clearTimeout(to)
        section.remove()
        resolve()
      }
      section.classList.remove(_cssnav)
    }))
  ).then(() => {
    let $ = ui.$doc.getElementById(section.id)
    if ($ !== null) {
      _log.nav && console.debug('recreate section DOM')
      ui._emitter.emit('show:refresh', section, $)
      $.remove()
      $ = null
    }
    if ($ === null) {
      $ = ui.$doc.createElement('section')
      $.id = section.id
      $.classList.add(section.root)
      $.innerHTML = section.html
      ui._emitter.emit('show:created', section, $)
      ui.deploy($, ui.main)
    }

    const ns = `${section.data.url || section.path}`
    if (ns) {
      try {
        window.history.pushState({
          ...section,
          data: {
            url: section.data.url
          },
          html: null
        }, '', section.data.url || section.path)
      } catch (err) {
        console.error(err)
        ui.notify.warn("Can't push history state")
      }
    }

    $.onanimationend = () => ui._emitter.emit('show', section, $)
    ui.ready(null, $)
    $.classList.add(_cssnav, 'fx-show')

    return section
  })
  // return section
}

ui.navigate = (event) => {
  const link = event.target
  if (link.tagName !== 'A') {
    console.error('event target is not <A>', { link })
    throw new TypeError('ui.navigate expect an <A> Node as event target')
  }

  // no actions on links:
  if (link.attributes.target) return // with target attribute set
  if (link.attributes.href.value[0] === '#') return // with anchor href values
  // TODO if link.href === ui.$doc.location => ABORT

  // taking actions implies not allowing window to unload
  event.preventDefault()

  ui.display(link.attributes.href.value)
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
  _log.init && console.info(`registered ${view} plugin as #${id}`)
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
    ui.body.classList.add('loading')
    _log.load && console.log('loading', url)
    ui._emitter.emit('loading', url)

    const finish = (err, value = ui) => {
      if (ui._loaded[url] !== false) {
        return reject(new Error('finish callback called twice'))
      }
      ui._loaded[url] = err || true

      const still = ui.isLoading() ? 'still' : 'done'
      _log.load && console[err ? 'error' : 'log'](`${
        err ? 'Failed load of' : 'Loaded'
      } ${url}, ${still} loading resources`)
      if (err) ui._emitter.emit('loading:error', err, url)
      else ui._emitter.emit(`loading:${still}`, url)

      setTimeout(() => {
        !ui.isLoading() && ui.body.classList.remove('loading')
      }, 200)

      if (err === null) return resolve(value)
      if (err) return reject(err)

      const e = new Error(`Resource ${url} failed to load`)
      e.code = 'EWUI_LOAD_FAILURE'
      e.real = err
      reject(e)
    }
    setImmediate(task, () => finish(null), err => finish(err))
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

// User interaction dialogs
ui.confirm = (message) => new Promise((resolve, reject) => {
  /* global confirm */
  // TODO don't use browser's confirm builtin
  if (confirm(message)) {
    return setImmediate(resolve, true)
  }
  setImmediate(resolve, false)
})

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
