const assert = require('assert')
const path = require('path')
const pkg = require('./package.json')

const resource = (_path) => path.resolve('/node_modules', pkg.name, _path)

const $ = require('jquery')

const HtmlView = require('./AbstractView')
const Notifier = require('./Notifier')
const Section = require('./Section')

//TODO ui is an HTML View? => seems that NO
const ui = module.exports// = Object.create(null)

Object.defineProperty(ui, '$doc', { value: null, writable: true })
Object.defineProperty(ui, 'head', { value: null, writable: true })
Object.defineProperty(ui, 'body', { value: null, writable: true })

// TODO backend support. see https://github.com/lukechilds/window

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

  return new Promise( (resolve, reject) => {
    document.addEventListener('DOMContentLoaded', () => {
      Object.defineProperties(ui, {
        '$doc': { value: document },
        'head': { value: document.head },
        'body': { value: document.body },
        'links': { value: document.getElementsByTagName('a') },
        'sections': { value: document.getElementsByTagName('section') },
      })
      console.info('interface initialized (DOMContentLoaded)')
      // TODO should remove this metas from here?
      if (! document.querySelector('meta[name=viewport')) {
        //console.info('will inject viewport meta tag')
        let meta = document.createElement('meta')
        meta.name = "viewport"
        meta.content = "width=device-width, initial-scale=1, maximum-scale=2"
        ui.head.appendChild(meta)
        delete meta
      }
      if (! document.querySelector('meta[rel=manifest')) {
        console.info('will inject webmanifest link')
        let link = document.createElement('link')
        link.rel = "manifest"
        link.href = "/assets/webmanifest.json"
        ui.head.appendChild(link)
        delete link
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
            console.warn(event.promise)
            ui.notify.error(`${event.reason} (Unhandled rejection)`)
          }
          window.onbeforeunload = (event) => {
            console.warn('will unload window', event)
          }
          return ui
        })
        .then(resolve).catch(reject)
    })
  })
}

ui.query = $
ui.observe = (thing) => {
  // TODO event interface
  if (thing instanceof HtmlView) return $(thing.$)
  if (thing instanceof EventTarget) return $(thing)
  console.error(thing)
  throw new TypeError('expecting instanceof HtmlView or EventTarget')
}

ui.request = () => {
  return Promise.reject('woking on')
}

ui.get = (...args) => new Promise( (resolve, reject) => {
  $.get.apply( $, args )
    .done( resolve )
    .fail( jxhr => {
      console[ jxhr.status > 499 ? 'error':'warn'](
        'GET', args, jxhr.status, jxhr.statusText
      )
      if (jxhr.status<400) {
        try {
          JSON.parse(jxhr.responseText)
        } catch (error) {
          assert(error instanceof SyntaxError)
          console.debug(jxhr.responseText)
          reject(error) //SyntaxError at received JSON data
        }
      } else {
        reject(jxhr.responseText)
      }
    })
})

ui.fetch = (url) => window.fetch(url)

ui.plugins = (plugins) => {
  return Promise.all(
    Object
    .keys(plugins)
    .map(id => ui.plugin(id, plugins[id]).then(ui => ui.deploy(plugins[id])))
  )
}

ui.plugin = (id, view) => {
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    assert('undefined' === typeof ui[id], `ui.${id} already exists`)
    assert(view instanceof HtmlView)
    assert(view.$.id === '', `${view} has id ${view.$.id}`)
  } catch (e) {
    return Promise.reject(e)
  }
  view.$.id = id
  Object.defineProperty(ui, id, { value: view, enumerable: true })
  console.info(`registered ${view} plugin as #${id}`)
  return view.styles.length? ui.assets(view.styles) : Promise.resolve(ui)
}

ui.assets = (url) => {
  if( Array.isArray(url) ) {
    return Promise.all( url.map(url => ui.assets(url)) )
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
  let css = ui.$doc.querySelectorAll(`link[rel=stylesheet][href="${url}"]`)
  if (css.length) {
    return Promise.resolve(ui)
  }
  // let's load styles
  return ui.load(url, (resolve, reject) => {
    let link = ui.$doc.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    link.onload = resolve
    link.onerror = reject
    ui.deploy(link, ui.head)
  })
}

Object.defineProperty(ui, '_loaded', { value: {} })
ui.load = (url, task) => {
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    if ('undefined' !== typeof ui._loaded[url]) {
      throw new ReferenceError(`ui._loaded[${url}] already exists`)
    }
    // TODO assert url is valid url
    assert('function' === typeof task, `${task} is not a function`)
  } catch (e) {
    return Promise.reject(e)
  }
  return new Promise( (resolve, reject) => {
    try {
      ui._loaded[url] = false
      $(ui.body).addClass('loading')
      task(() => {
        ui._loaded[url] = true
        console.debug(`resource ${url} loaded`)
        $(ui.body).removeClass('loading')
        resolve(ui)
      }, (error) => {
        ui._loaded[url] = error
        $(ui.body).removeClass('loading')
        reject(`resource ${url} failed to load`)
      })
    } catch (e) {
      reject(e)
    }
  })
}

ui.deploy = (thing, container = ui.body) => {
  try {
    assert(ui.$doc instanceof HTMLDocument, 'ui is not initialized')
    assert(container instanceof HTMLElement, 'container must be HTMLElement')
  } catch (e) {
    return Promise.reject(e)
  }
  if (thing instanceof HTMLElement) {
    container.appendChild(thing)
    return Promise.resolve(ui)
  }
  if (thing instanceof HtmlView) {
    return ui.deploy(thing.$, container).then(ui => thing.ready(ui))
  }
  return Promise.reject(
    new TypeError(`thing must be either HTMLElement or HtmlView but is ${thing}`)
  )
}

Object.defineProperty(ui, 'Section', { value: Section, enumerable: true })
// CSS class to flag current sections/links
let _cssnav = 'selected'
ui.navigate = (link) => {
  try {
    assert.equal(link.tagName, 'A', 'ui.navigate expect an <A> Node')
  } catch (error) {
    console.error(link)
    throw error
  }
  // TODO if link.href === ui.$doc.location => ABORT

  // TODO link.attributes.target.value === _blank?

  // FIRST: remove _cssnav class for any link or section within the page
  Array.from(ui.links).forEach(a => a.classList.remove(_cssnav))
  Array.from(ui.sections).forEach(section => section.classList.remove(_cssnav))

  // link.href will return a complete location (inc. protocol, host, etc)
  let href = link.attributes.href.value
  // retrieve first links with same href attribute value
  let same = ui.$doc.querySelectorAll(`a[href="${href}"]`)
  // and retrieve also links pointing to the full location
  let also = ui.$doc.querySelectorAll(`a[href="${link.href}"]`)
  // now iterate and setup the _cssnav class
  Array.from(same).concat(Array.from(also)).forEach(a => a.classList.add(_cssnav))

  // now display the section
  let section = ui.Section.find({ href: href })
  if (section === null) {
    // TODO no section may mean "open this in browser"
    throw new Error(`there is no ui.Section with href=${href}`)
  }
  let section_id = section.$.id
  if (ui.$doc.getElementById(section_id) === null) {
    // provide a a container for sections, if there isn't
    if (! document.querySelector('main')) {
      console.info('will inject main container')
      ui.main = document.createElement('main')
      ui.body.appendChild(ui.main)
    }
    ui.deploy(section, ui.main)
  }
  section.addClass(_cssnav)
}

ui.display = (location) => {
  assert(location instanceof Location, 'expecting location object')
  // see https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
  let request = new Request(location, {
    method: 'get',
    mode: 'same-origin',
    credentials: 'same-origin',
    headers: new Headers({
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    })
  })
  return fetch(request).then(response => {
    console.log('awaiting response for', location)
    console.log(response)
    return response.json()
  }).then(data => {
    console.log('data is', data)
    return data
  }).catch(error => {
    if (error instanceof Error) {
      console.error(error)
      if (error instanceof SyntaxError) {
        ui.notify.error('Response produces SyntaxError')
      } else {
        ui.notify.error(`Response produces ${error.constructor.name}`)
      }
    } else {
      console.error(error)
      throw new Error('catched a promise rejection with non-error')
    }
  })
}
/* vim: set expandtab: */
/* vim: set filetype=javascript ts=2 shiftwidth=2: */
