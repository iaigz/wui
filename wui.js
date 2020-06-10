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
          window.onunhandledrejection = (event) => {
            console.warn(event.promise, event.reason)
            ui.notify.error(`${event.reason} (Unhandled rejection)`)
          }
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

ui.fetch = (...args) => window.fetch(...args)

/* global Request, Headers */

ui.request = (url, opts = {}) => {
  // see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
  opts = {
    mode: 'same-origin',
    credentials: 'same-origin',
    ...opts
  }
  return ui.fetch(new Request(url, {
    ...opts,
    headers: new Headers({ Accept: 'application/json', ...opts.headers })
  }))
}

ui.submit = (form) => {
  console.info('Submit', form.id || form.action)
  const data = {}
  for (const element of form.elements) {
    element.setAttribute('disabled', '')
    // TODO: mark disableds element.dataset.wui = 'disabled-for-submit'
    const field = element.name || element.id
    if (!field) continue
    data[field] = element.value
  }
  ui.load(`${form.method} ${form.action}`, (resolve, reject) => {
    ui.request(form.action, {
      method: form.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      // TODO if status != 200
      .then(response => response.json())
      .then(data => {
        for (const element of form.elements) {
          // TODO research disableds: console.log(element, element.dataset)
          element.removeAttribute('disabled')
        }
        if (data.error) {
          console.error('submit error:', data.error)
          ui.notify.error(data.error.message, form)
        } else {
          console.debug('after-submit, show section')
          ui.show(data)
        }
        resolve()
      })
      .catch(reject)
  })
}

// CSS class to flag current sections/links
const _cssnav = 'selected'

ui.show = (section) => {
  console.info(`show ${section.path} (#${section.id})`)
  // FIRST: remove _cssnav class for any link or section within the page
  Array.from(ui.links).forEach(a => a.classList.remove(_cssnav))
  Array.from(ui.sections).forEach(section => section.classList.remove(_cssnav))

  let $ = ui.$doc.getElementById(section.id)
  if ($ !== null) {
    console.info('refresh section DOM')
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

ui.display = (location) => {
  // console.log('display', location)
  return ui.load(location, (resolve, reject) => ui
    .request(location)
    // TODO if status != 200
    .then(response => response.json())
    .then(section => ui.show(section))
    .then(resolve)
    .catch(error => {
      if (!(error instanceof Error)) {
        console.error(error)
        return reject(new Error('catched a promise rejection with non-error'))
      }
      console.error(error)
      if (error instanceof SyntaxError) {
        ui.notify.error('Response produces SyntaxError')
      } else {
        ui.notify.error(`Response produces ${error.constructor.name}`)
      }
      reject(error)
    })
  )
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
    .catch(err => console.error(err))
}

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
ui.isLoading = () => Object.values(ui._loaded).some(value => value !== true)
ui.hasLoaded = (url) => ui._loaded[url] === true
ui.load = (url, task) => {
  if (ui.hasLoaded(url)) {
    console.debug('already loaded %s (will reload anyway)', url)
    delete ui._loaded[url]
  }
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    if (typeof ui._loaded[url] !== 'undefined') {
      throw new ReferenceError(`ui._loaded[${url}] already exists`)
    }
    // TODO assert url is valid url
    assert(typeof task === 'function', `${task} is not a function`)
  } catch (e) {
    return Promise.reject(e)
  }
  return new Promise((resolve, reject) => {
    try {
      ui._loaded[url] = false
      $(ui.body).addClass('loading')
      task(() => {
        ui._loaded[url] = true
        const still = ui.isLoading() ? 'still' : 'done'
        console.debug(`resource ${url} loaded (${still} loading resources)`)
        !ui.isLoading() && ui.body.classList.remove('loading')
        resolve(ui)
      }, (error) => {
        const e = new Error(`resource ${url} failed to load`)
        e.code = 'EWUI_LOAD_FAILURE'
        e.real = error
        ui._loaded[url] = e
        $(ui.body).removeClass('loading')
        reject(e)
      })
    } catch (e) {
      reject(e)
    }
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

/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
