(function() {
function visit(vertex, fn, visited, path) {
  var name = vertex.name,
    vertices = vertex.incoming,
    names = vertex.incomingNames,
    len = names.length,
    i;
  if (!visited) {
    visited = {};
  }
  if (!path) {
    path = [];
  }
  if (visited.hasOwnProperty(name)) {
    return;
  }
  path.push(name);
  visited[name] = true;
  for (i = 0; i < len; i++) {
    visit(vertices[names[i]], fn, visited, path);
  }
  fn(vertex, path);
  path.pop();
}

function DAG() {
  this.names = [];
  this.vertices = {};
}

DAG.prototype.add = function(name) {
  if (!name) { return; }
  if (this.vertices.hasOwnProperty(name)) {
    return this.vertices[name];
  }
  var vertex = {
    name: name, incoming: {}, incomingNames: [], hasOutgoing: false, value: null
  };
  this.vertices[name] = vertex;
  this.names.push(name);
  return vertex;
};

DAG.prototype.map = function(name, value) {
  this.add(name).value = value;
};

DAG.prototype.addEdge = function(fromName, toName) {
  if (!fromName || !toName || fromName === toName) {
    return;
  }
  var from = this.add(fromName), to = this.add(toName);
  if (to.incoming.hasOwnProperty(fromName)) {
    return;
  }
  function checkCycle(vertex, path) {
    if (vertex.name === toName) {
      throw new Error("cycle detected: " + toName + " <- " + path.join(" <- "));
    }
  }
  visit(from, checkCycle);
  from.hasOutgoing = true;
  to.incoming[fromName] = from;
  to.incomingNames.push(fromName);
};

DAG.prototype.topsort = function(fn) {
  var visited = {},
    vertices = this.vertices,
    names = this.names,
    len = names.length,
    i, vertex;
  for (i = 0; i < len; i++) {
    vertex = vertices[names[i]];
    if (!vertex.hasOutgoing) {
      visit(vertex, fn, visited);
    }
  }
};

DAG.prototype.addEdges = function(name, value, before, after) {
  var i;
  this.map(name, value);
  if (before) {
    if (typeof before === 'string') {
      this.addEdge(name, before);
    } else {
      for (i = 0; i < before.length; i++) {
        this.addEdge(name, before[i]);
      }
    }
  }
  if (after) {
    if (typeof after === 'string') {
      this.addEdge(after, name);
    } else {
      for (i = 0; i < after.length; i++) {
        this.addEdge(after[i], name);
      }
    }
  }
};

Ember.DAG = DAG;

})();



(function() {
/**
@module ember
@submodule ember-application
*/

var get = Ember.get,
    classify = Ember.String.classify,
    capitalize = Ember.String.capitalize,
    decamelize = Ember.String.decamelize;

/**
  The DefaultResolver defines the default lookup rules to resolve
  container lookups before consulting the container for registered
  items:

  * templates are looked up on `Ember.TEMPLATES`
  * other names are looked up on the application after converting
    the name. For example, `controller:post` looks up
    `App.PostController` by default.
  * there are some nuances (see examples below)

  ### How Resolving Works

  The container calls this object's `resolve` method with the
  `fullName` argument.

  It first parses the fullName into an object using `parseName`.

  Then it checks for the presence of a type-specific instance
  method of the form `resolve[Type]` and calls it if it exists.
  For example if it was resolving 'template:post', it would call
  the `resolveTemplate` method.

  Its last resort is to call the `resolveOther` method.

  The methods of this object are designed to be easy to override
  in a subclass. For example, you could enhance how a template
  is resolved like so:

  ```javascript
  App = Ember.Application.create({
    resolver: Ember.DefaultResolver.extend({
      resolveTemplate: function(parsedName) {
        var resolvedTemplate = this._super(parsedName);
        if (resolvedTemplate) { return resolvedTemplate; }
        return Ember.TEMPLATES['not_found'];
      }
    })
  });
  ```

  Some examples of how names are resolved:

  ```
  'template:post' //=> Ember.TEMPLATES['post']
  'template:posts/byline' //=> Ember.TEMPLATES['posts/byline']
  'template:posts.byline' //=> Ember.TEMPLATES['posts/byline']
  'template:blogPost' //=> Ember.TEMPLATES['blogPost']
                      //   OR
                      //   Ember.TEMPLATES['blog_post']
  'controller:post' //=> App.PostController
  'controller:posts.index' //=> App.PostsIndexController
  'controller:blog/post' //=> Blog.PostController
  'controller:basic' //=> Ember.Controller
  'route:post' //=> App.PostRoute
  'route:posts.index' //=> App.PostsIndexRoute
  'route:blog/post' //=> Blog.PostRoute
  'route:basic' //=> Ember.Route
  'view:post' //=> App.PostView
  'view:posts.index' //=> App.PostsIndexView
  'view:blog/post' //=> Blog.PostView
  'view:basic' //=> Ember.View
  'foo:post' //=> App.PostFoo
  ```

  @class DefaultResolver
  @namespace Ember
  @extends Ember.Object
*/
Ember.DefaultResolver = Ember.Object.extend({
  /**
    This will be set to the Application instance when it is
    created.

    @property namespace
  */
  namespace: null,
  /**
    This method is called via the container's resolver method.
    It parses the provided `fullName` and then looks up and
    returns the appropriate template or class.

    @method resolve
    @param {String} fullName the lookup string
    @return {Object} the resolved factory
  */
  resolve: function(fullName) {
    var parsedName = this.parseName(fullName),
        typeSpecificResolveMethod = this[parsedName.resolveMethodName];
    if (typeSpecificResolveMethod) {
      var resolved = typeSpecificResolveMethod.call(this, parsedName);
      if (resolved) { return resolved; }
    }
    return this.resolveOther(parsedName);
  },
  /**
    Convert the string name of the form "type:name" to
    a Javascript object with the parsed aspects of the name
    broken out.

    @protected
    @method parseName
  */
  parseName: function(fullName) {
    var nameParts = fullName.split(":"),
        type = nameParts[0], fullNameWithoutType = nameParts[1],
        name = fullNameWithoutType,
        namespace = get(this, 'namespace'),
        root = namespace;

    if (type !== 'template' && name.indexOf('/') !== -1) {
      var parts = name.split('/');
      name = parts[parts.length - 1];
      var namespaceName = capitalize(parts.slice(0, -1).join('.'));
      root = Ember.Namespace.byName(namespaceName);

      Ember.assert('You are looking for a ' + name + ' ' + type + ' in the ' + namespaceName + ' namespace, but the namespace could not be found', root);
    }

    return {
      fullName: fullName,
      type: type,
      fullNameWithoutType: fullNameWithoutType,
      name: name,
      root: root,
      resolveMethodName: "resolve" + classify(type)
    };
  },
  /**
    Look up the template in Ember.TEMPLATES

    @protected
    @method resolveTemplate
  */
  resolveTemplate: function(parsedName) {
    var templateName = parsedName.fullNameWithoutType.replace(/\./g, '/');

    if (Ember.TEMPLATES[templateName]) {
      return Ember.TEMPLATES[templateName];
    }

    templateName = decamelize(templateName);
    if (Ember.TEMPLATES[templateName]) {
      return Ember.TEMPLATES[templateName];
    }
  },
  /**
    Given a parseName object (output from `parseName`), apply
    the conventions expected by `Ember.Router`

    @protected
    @method useRouterNaming
  */
  useRouterNaming: function(parsedName) {
    parsedName.name = parsedName.name.replace(/\./g, '_');
    if (parsedName.name === 'basic') {
      parsedName.name = '';
    }
  },
  /**
    @protected
    @method resolveController
  */
  resolveController: function(parsedName) {
    this.useRouterNaming(parsedName);
    return this.resolveOther(parsedName);
  },
  /**
    @protected
    @method resolveRoute
  */
  resolveRoute: function(parsedName) {
    this.useRouterNaming(parsedName);
    return this.resolveOther(parsedName);
  },
  /**
    @protected
    @method resolveView
  */
  resolveView: function(parsedName) {
    this.useRouterNaming(parsedName);
    return this.resolveOther(parsedName);
  },
  /**
    Look up the specified object (from parsedName) on the appropriate
    namespace (usually on the Application)

    @protected
    @method resolveOther
  */
  resolveOther: function(parsedName) {
    var className = classify(parsedName.name) + classify(parsedName.type),
        factory = get(parsedName.root, className);
    if (factory) { return factory; }
  }
});

})();



(function() {
/**
@module ember
@submodule ember-application
*/

var get = Ember.get, set = Ember.set,
    classify = Ember.String.classify,
    capitalize = Ember.String.capitalize,
    decamelize = Ember.String.decamelize;

/**
  An instance of `Ember.Application` is the starting point for every Ember
  application. It helps to instantiate, initialize and coordinate the many
  objects that make up your app.

  Each Ember app has one and only one `Ember.Application` object. In fact, the
  very first thing you should do in your application is create the instance:

  ```javascript
  window.App = Ember.Application.create();
  ```

  Typically, the application object is the only global variable. All other
  classes in your app should be properties on the `Ember.Application` instance,
  which highlights its first role: a global namespace.

  For example, if you define a view class, it might look like this:

  ```javascript
  App.MyView = Ember.View.extend();
  ```

  By default, calling `Ember.Application.create()` will automatically initialize
  your application by calling the `Ember.Application.initialize()` method. If
  you need to delay initialization, you can call your app's `deferReadiness()`
  method. When you are ready for your app to be initialized, call its
  `advanceReadiness()` method.

  You can define a `ready` method on the `Ember.Application` instance, which
  will be run by Ember when the application is initialized.

  Because `Ember.Application` inherits from `Ember.Namespace`, any classes
  you create will have useful string representations when calling `toString()`.
  See the `Ember.Namespace` documentation for more information.

  While you can think of your `Ember.Application` as a container that holds the
  other classes in your application, there are several other responsibilities
  going on under-the-hood that you may want to understand.

  ### Event Delegation

  Ember uses a technique called _event delegation_. This allows the framework
  to set up a global, shared event listener instead of requiring each view to
  do it manually. For example, instead of each view registering its own
  `mousedown` listener on its associated element, Ember sets up a `mousedown`
  listener on the `body`.

  If a `mousedown` event occurs, Ember will look at the target of the event and
  start walking up the DOM node tree, finding corresponding views and invoking
  their `mouseDown` method as it goes.

  `Ember.Application` has a number of default events that it listens for, as
  well as a mapping from lowercase events to camel-cased view method names. For
  example, the `keypress` event causes the `keyPress` method on the view to be
  called, the `dblclick` event causes `doubleClick` to be called, and so on.

  If there is a browser event that Ember does not listen for by default, you
  can specify custom events and their corresponding view method names by
  setting the application's `customEvents` property:

  ```javascript
  App = Ember.Application.create({
    customEvents: {
      // add support for the loadedmetadata media
      // player event
      'loadedmetadata': "loadedMetadata"
    }
  });
  ```

  By default, the application sets up these event listeners on the document
  body. However, in cases where you are embedding an Ember application inside
  an existing page, you may want it to set up the listeners on an element
  inside the body.

  For example, if only events inside a DOM element with the ID of `ember-app`
  should be delegated, set your application's `rootElement` property:

  ```javascript
  window.App = Ember.Application.create({
    rootElement: '#ember-app'
  });
  ```

  The `rootElement` can be either a DOM element or a jQuery-compatible selector
  string. Note that *views appended to the DOM outside the root element will
  not receive events.* If you specify a custom root element, make sure you only
  append views inside it!

  To learn more about the advantages of event delegation and the Ember view
  layer, and a list of the event listeners that are setup by default, visit the
  [Ember View Layer guide](http://emberjs.com/guides/understanding-ember/the-view-layer/#toc_event-delegation).

  ### Initializers

  Libraries on top of Ember can register additional initializers, like so:

  ```javascript
  Ember.Application.initializer({
    name: "store",

    initialize: function(container, application) {
      container.register('store:main', application.Store);
    }
  });
  ```

  ### Routing

  In addition to creating your application's router, `Ember.Application` is
  also responsible for telling the router when to start routing. Transitions
  between routes can be logged with the LOG_TRANSITIONS flag:

  ```javascript
  window.App = Ember.Application.create({
    LOG_TRANSITIONS: true
  });
  ```

  By default, the router will begin trying to translate the current URL into
  application state once the browser emits the `DOMContentReady` event. If you
  need to defer routing, you can call the application's `deferReadiness()`
  method. Once routing can begin, call the `advanceReadiness()` method.

  If there is any setup required before routing begins, you can implement a
  `ready()` method on your app that will be invoked immediately before routing
  begins.

  To begin routing, you must have at a minimum a top-level controller and view.
  You define these as `App.ApplicationController` and `App.ApplicationView`,
  respectively. Your application will not work if you do not define these two
  mandatory classes. For example:

  ```javascript
  App.ApplicationView = Ember.View.extend({
    templateName: 'application'
  });
  App.ApplicationController = Ember.Controller.extend();
  ```

  @class Application
  @namespace Ember
  @extends Ember.Namespace
*/
var Application = Ember.Application = Ember.Namespace.extend({

  /**
    The root DOM element of the Application. This can be specified as an
    element or a
    [jQuery-compatible selector string](http://api.jquery.com/category/selectors/).

    This is the element that will be passed to the Application's,
    `eventDispatcher`, which sets up the listeners for event delegation. Every
    view in your application should be a child of the element you specify here.

    @property rootElement
    @type DOMElement
    @default 'body'
  */
  rootElement: 'body',

  /**
    The `Ember.EventDispatcher` responsible for delegating events to this
    application's views.

    The event dispatcher is created by the application at initialization time
    and sets up event listeners on the DOM element described by the
    application's `rootElement` property.

    See the documentation for `Ember.EventDispatcher` for more information.

    @property eventDispatcher
    @type Ember.EventDispatcher
    @default null
  */
  eventDispatcher: null,

  /**
    The DOM events for which the event dispatcher should listen.

    By default, the application's `Ember.EventDispatcher` listens
    for a set of standard DOM events, such as `mousedown` and
    `keyup`, and delegates them to your application's `Ember.View`
    instances.

    If you would like additional events to be delegated to your
    views, set your `Ember.Application`'s `customEvents` property
    to a hash containing the DOM event name as the key and the
    corresponding view method name as the value. For example:

    ```javascript
    App = Ember.Application.create({
      customEvents: {
        // add support for the loadedmetadata media
        // player event
        'loadedmetadata': "loadedMetadata"
      }
    });
    ```

    @property customEvents
    @type Object
    @default null
  */
  customEvents: null,

  isInitialized: false,

  // Start off the number of deferrals at 1. This will be
  // decremented by the Application's own `initialize` method.
  _readinessDeferrals: 1,

  init: function() {
    if (!this.$) { this.$ = Ember.$; }
    this.__container__ = this.buildContainer();

    this.Router = this.Router || this.defaultRouter();
    if (this.Router) { this.Router.namespace = this; }

    this._super();

    this.scheduleInitialize();

    if ( Ember.LOG_VERSION ) {
      Ember.LOG_VERSION = false; // we only need to see this once per Application#init
      Ember.debug('-------------------------------');
      Ember.debug('Ember.VERSION : ' + Ember.VERSION);
      Ember.debug('Handlebars.VERSION : ' + Ember.Handlebars.VERSION);
      Ember.debug('jQuery.VERSION : ' + Ember.$().jquery);
      Ember.debug('-------------------------------');
    }
  },

  /**
    @private

    Build the container for the current application.

    Also register a default application view in case the application
    itself does not.

    @method buildContainer
    @return {Ember.Container} the configured container
  */
  buildContainer: function() {
    var container = this.__container__ = Application.buildContainer(this);

    return container;
  },

  /**
    @private

    If the application has not opted out of routing and has not explicitly
    defined a router, supply a default router for the application author
    to configure.

    This allows application developers to do:

    ```javascript
    App = Ember.Application.create();

    App.Router.map(function(match) {
      match("/").to("index");
    });
    ```

    @method defaultRouter
    @return {Ember.Router} the default router
  */
  defaultRouter: function() {
    // Create a default App.Router if one was not supplied to make
    // it possible to do App.Router.map(...) without explicitly
    // creating a router first.
    if (this.router === undefined) {
      return Ember.Router.extend();
    }
  },

  /**
    @private

    Automatically initialize the application once the DOM has
    become ready.

    The initialization itself is scheduled on the actions queue
    which ensures that application loading finishes before
    booting.

    If you are asynchronously loading code, you should call
    `deferReadiness()` to defer booting, and then call
    `advanceReadiness()` once all of your code has finished
    loading.

    @method scheduleInitialize
  */
  scheduleInitialize: function() {
    var self = this;
    this.$().ready(function() {
      if (self.isDestroyed || self.isInitialized) { return; }
      Ember.run.schedule('actions', self, 'initialize');
    });
  },

  /**
    Use this to defer readiness until some condition is true.

    Example:

    ```javascript
    App = Ember.Application.create();
    App.deferReadiness();

    jQuery.getJSON("/auth-token", function(token) {
      App.token = token;
      App.advanceReadiness();
    });
    ```

    This allows you to perform asynchronous setup logic and defer
    booting your application until the setup has finished.

    However, if the setup requires a loading UI, it might be better
    to use the router for this purpose.

    @method deferReadiness
  */
  deferReadiness: function() {
    Ember.assert("You cannot defer readiness since the `ready()` hook has already been called.", this._readinessDeferrals > 0);
    this._readinessDeferrals++;
  },

  /**
    @method advanceReadiness
    @see {Ember.Application#deferReadiness}
  */
  advanceReadiness: function() {
    this._readinessDeferrals--;

    if (this._readinessDeferrals === 0) {
      Ember.run.once(this, this.didBecomeReady);
    }
  },

  /**
    registers a factory for later injection

    Example:

    ```javascript
    App = Ember.Application.create();

    App.Person = Ember.Object.extend({});
    App.Orange = Ember.Object.extend({});
    App.Email  = Ember.Object.extend({});

    App.register('model:user', App.Person, {singleton: false });
    App.register('fruit:favorite', App.Orange);
    App.register('communication:main', App.Email, {singleton: false});
    ```

    @method register
    @param  type {String}
    @param  name {String}
    @param  factory {String}
    @param  options {String} (optional)
  **/
  register: function() {
    var container = this.__container__;
    container.register.apply(container, arguments);
  },
  /**
    defines an injection or typeInjection

    Example:

    ```javascript
    App.inject(<full_name or type>, <property name>, <full_name>)
    App.inject('model:user', 'email', 'model:email')
    App.inject('model', 'source', 'source:main')
    ```

    @method inject
    @param  factoryNameOrType {String}
    @param  property {String}
    @param  injectionName {String}
  **/
  inject: function(){
    var container = this.__container__;
    container.injection.apply(container, arguments);
  },

  /**
    @private

    Initialize the application. This happens automatically.

    Run any initializers and run the application load hook. These hooks may
    choose to defer readiness. For example, an authentication hook might want
    to defer readiness until the auth token has been retrieved.

    @method initialize
  */
  initialize: function() {
    Ember.assert("Application initialize may only be called once", !this.isInitialized);
    Ember.assert("Cannot initialize a destroyed application", !this.isDestroyed);
    this.isInitialized = true;

    // At this point, the App.Router must already be assigned
    this.register('router:main', this.Router);

    this.runInitializers();
    Ember.runLoadHooks('application', this);

    // At this point, any initializers or load hooks that would have wanted
    // to defer readiness have fired. In general, advancing readiness here
    // will proceed to didBecomeReady.
    this.advanceReadiness();

    return this;
  },

  reset: function() {
    get(this, '__container__').destroy();
    this.buildContainer();

    this.isInitialized = false;
    this.initialize();
    this.startRouting();
  },

  /**
    @private
    @method runInitializers
  */
  runInitializers: function() {
    var initializers = get(this.constructor, 'initializers'),
        container = this.__container__,
        graph = new Ember.DAG(),
        namespace = this,
        i, initializer;

    for (i=0; i<initializers.length; i++) {
      initializer = initializers[i];
      graph.addEdges(initializer.name, initializer.initialize, initializer.before, initializer.after);
    }

    graph.topsort(function (vertex) {
      var initializer = vertex.value;
      Ember.assert("No application initializer named '"+vertex.name+"'", initializer);
      initializer(container, namespace);
    });
  },

  /**
    @private
    @method didBecomeReady
  */
  didBecomeReady: function() {
    this.setupEventDispatcher();
    this.ready(); // user hook
    this.startRouting();

    if (!Ember.testing) {
      // Eagerly name all classes that are already loaded
      Ember.Namespace.processAll();
      Ember.BOOTED = true;
    }
  },

  /**
    @private

    Setup up the event dispatcher to receive events on the
    application's `rootElement` with any registered
    `customEvents`.

    @method setupEventDispatcher
  */
  setupEventDispatcher: function() {
    var eventDispatcher = this.createEventDispatcher(),
        customEvents    = get(this, 'customEvents');

    eventDispatcher.setup(customEvents);
  },

  /**
    @private

    Create an event dispatcher for the application's `rootElement`.

    @method createEventDispatcher
  */
  createEventDispatcher: function() {
    var rootElement = get(this, 'rootElement'),
        eventDispatcher = Ember.EventDispatcher.create({
          rootElement: rootElement
        });

    set(this, 'eventDispatcher', eventDispatcher);
    return eventDispatcher;
  },

  /**
    @private

    If the application has a router, use it to route to the current URL, and
    trigger a new call to `route` whenever the URL changes.

    @method startRouting
    @property router {Ember.Router}
  */
  startRouting: function() {
    var router = this.__container__.lookup('router:main');
    if (!router) { return; }

    router.startRouting();
  },

  handleURL: function(url) {
    var router = this.__container__.lookup('router:main');

    router.handleURL(url);
  },

  /**
    Called when the Application has become ready.
    The call will be delayed until the DOM has become ready.

    @event ready
  */
  ready: Ember.K,

  /**
    Set this to provide an alternate class to `Ember.DefaultResolver`

    @property resolver
  */
  resolver: null,

  willDestroy: function() {
    Ember.BOOTED = false;

    var eventDispatcher = get(this, 'eventDispatcher');
    if (eventDispatcher) { eventDispatcher.destroy(); }

    get(this, '__container__').destroy();
  },

  initializer: function(options) {
    this.constructor.initializer(options);
  }
});

Ember.Application.reopenClass({
  concatenatedProperties: ['initializers'],
  initializers: Ember.A(),
  initializer: function(initializer) {
    var initializers = get(this, 'initializers');

    Ember.assert("The initializer '" + initializer.name + "' has already been registered", !initializers.findProperty('name', initializers.name));
    Ember.assert("An injection cannot be registered with both a before and an after", !(initializer.before && initializer.after));
    Ember.assert("An injection cannot be registered without an injection function", Ember.canInvoke(initializer, 'initialize'));

    initializers.push(initializer);
  },

  /**
    @private

    This creates a container with the default Ember naming conventions.

    It also configures the container:

    * registered views are created every time they are looked up (they are
      not singletons)
    * registered templates are not factories; the registered value is
      returned directly.
    * the router receives the application as its `namespace` property
    * all controllers receive the router as their `target` and `controllers`
      properties
    * all controllers receive the application as their `namespace` property
    * the application view receives the application controller as its
      `controller` property
    * the application view receives the application template as its
      `defaultTemplate` property

    @method buildContainer
    @static
    @param {Ember.Application} namespace the application to build the
      container for.
    @return {Ember.Container} the built container
  */
  buildContainer: function(namespace) {
    var container = new Ember.Container();
    Ember.Container.defaultContainer = Ember.Container.defaultContainer || container;

    container.set = Ember.set;
    container.normalize = normalize;
    container.resolver = resolverFor(namespace);
    container.optionsForType('view', { singleton: false });
    container.optionsForType('template', { instantiate: false });
    container.register('application:main', namespace, { instantiate: false });

    container.register('controller:basic', Ember.Controller, { instantiate: false });
    container.register('controller:object', Ember.ObjectController, { instantiate: false });
    container.register('controller:array', Ember.ArrayController, { instantiate: false });
    container.register('route:basic', Ember.Route, { instantiate: false });

    container.injection('router:main', 'namespace', 'application:main');

    container.typeInjection('controller', 'target', 'router:main');
    container.typeInjection('controller', 'namespace', 'application:main');

    container.typeInjection('route', 'router', 'router:main');

    return container;
  }
});

/**
  @private

  This function defines the default lookup rules for container lookups:

  * templates are looked up on `Ember.TEMPLATES`
  * other names are looked up on the application after classifying the name.
    For example, `controller:post` looks up `App.PostController` by default.
  * if the default lookup fails, look for registered classes on the container

  This allows the application to register default injections in the container
  that could be overridden by the normal naming convention.

  @param {Ember.Namespace} namespace the namespace to look for classes
  @return {any} the resolved value for a given lookup
*/
function resolverFor(namespace) {
  var resolverClass = namespace.get('resolver') || Ember.DefaultResolver;
  var resolver = resolverClass.create({
    namespace: namespace
  });
  return function(fullName) {
    return resolver.resolve(fullName);
  };
}

function normalize(fullName) {
  var split = fullName.split(':'),
      type = split[0],
      name = split[1];


  if (type !== 'template') {
    var result = name;

    if (result.indexOf('.') > -1) {
      result = result.replace(/\.(.)/g, function(m) { return m.charAt(1).toUpperCase(); });
    }

    if (name.indexOf('_') > -1) {
      result = result.replace(/_(.)/g, function(m) { return m.charAt(1).toUpperCase(); });
    }

    return type + ':' + result;
  } else {
    return fullName;
  }
}

Ember.runLoadHooks('Ember.Application', Ember.Application);

})();



(function() {

})();



(function() {
/**
@module ember
@submodule ember-application
*/

var get = Ember.get, set = Ember.set;
var ControllersProxy = Ember.Object.extend({
  controller: null,

  unknownProperty: function(controllerName) {
    var controller = get(this, 'controller'),
      needs = get(controller, 'needs'),
      container = controller.get('container'),
      dependency;

    for (var i=0, l=needs.length; i<l; i++) {
      dependency = needs[i];
      if (dependency === controllerName) {
        return container.lookup('controller:' + controllerName);
      }
    }
  }
});

function verifyDependencies(controller) {
  var needs = get(controller, 'needs'),
      container = get(controller, 'container'),
      dependency, satisfied = true;

  for (var i=0, l=needs.length; i<l; i++) {
    dependency = needs[i];
    if (dependency.indexOf(':') === -1) {
      dependency = "controller:" + dependency;
    }

    if (!container.has(dependency)) {
      satisfied = false;
      Ember.assert(controller + " needs " + dependency + " but it does not exist", false);
    }
  }

  return satisfied;
}

Ember.ControllerMixin.reopen({
  concatenatedProperties: ['needs'],
  needs: [],

  init: function() {
    this._super.apply(this, arguments);

    // Structure asserts to still do verification but not string concat in production
    if(!verifyDependencies(this)) {
      Ember.assert("Missing dependencies", false);
    }
  },

  controllerFor: function(controllerName) {
    Ember.deprecate("Controller#controllerFor is deprecated, please use Controller#needs instead");
    var container = get(this, 'container');
    return container.lookup('controller:' + controllerName);
  },

  controllers: Ember.computed(function() {
    return ControllersProxy.create({ controller: this });
  })
});

})();



(function() {

})();



(function() {
/**
Ember Application

@module ember
@submodule ember-application
@requires ember-views, ember-states, ember-routing
*/

})();
