/**
 * @namespace hbpCollaboratoryAutomator
 * @memberof hbpCollaboratory
 * @desc
 * hbpCollaboratoryAutomator is an AngularJS factory that
 * provide task automation to accomplish a sequence of
 * common operation in Collaboratory.
 *
 * How to add new tasks
 * --------------------
 *
 * New tasks can be added by calling ``hbpCollaboratoryAutomator.registerHandler``.
 *
 * @param {object} $q injected dependency
 * @return {object} hbpCollaboratoryAutomator angular service
 * @example <caption>Create a Collab with a few navigation items</caption>
 * // Create a Collab with a few navigation items.
 * angular.module('MyModule', ['hbpCollaboratory'])
 * .run(function(hbpCollaboratoryAutomator, $log) {
 *   var config = {
 *     title: 'My Custom Collab',
 *     content: 'My Collab Content',
 *     private: false
 *   }
 *   hbpCollaboratoryAutomator.task(config).run().then(function(collab) {
 *   	 $log.info('Created Collab', collab);
 *   })
 * })
 */
angular.module('hbpCollaboratoryAutomator', [
  'bbpConfig',
  'hbpCommon',
  'hbpDocumentClient',
  'hbpCollaboratoryAppStore',
  'hbpCollaboratoryNavStore',
  'hbpCollaboratoryStorage'
])
.factory('hbpCollaboratoryAutomator', ['$q', '$log', 'hbpErrorService', function hbpCollaboratoryAutomator(
  $q, $log, hbpErrorService
) {
  var handlers = {};

  /**
   * Register a handler function for the given task name.
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @param  {string}   name handle actions with the specified name
   * @param  {Function} fn a function that accept the current context in
   *                       parameter.
   */
  function registerHandler(name, fn) {
    handlers[name] = fn;
  }

  /**
   * @namespace Tasks
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @desc
   * Available tasks.
   */

  /**
   * Instantiate a new Task intance that will run the code describe for
   * a handlers with the give ``name``.
   *
   * The descriptor is passed to the task and parametrize it.
   * The task context is computed at the time the task is ran. A default context
   * can be given at load time and it will be fed with the result of each parent
   * (but not sibling) tasks as well.
   *
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @param {string} name the name of the task to instantiate
   * @param {object} [descriptor] a configuration object that will determine
   *                            which task to run and in which order
   * @param {object} [descriptor.after] an array of task to run after this one
   * @param {object} [context] a default context to run the task with
   *
   * @return {Task} - the new task instance
   */
  function task(name, descriptor, context) {
    try {
      return new Task(name, descriptor, context);
    } catch (ex) {
      $log.error('EXCEPTION', ex);
      throw hbpErrorService.error({
        type: 'InvalidTask',
        message: 'Invalid task ' + name + ': ' + ex,
        data: {
          cause: ex,
          name: name,
          descriptor: descriptor,
          context: context
        }
      });
    }
  }

  /**
   * Create an array of tasks given an array containing object where
   * the key is the task name to run and the value is the descriptor
   * parameter.
   *
   * @param  {object} after the content of ``descriptor.after``
   * @return {Array/Task} array of subtasks
   * @private
   */
  function createSubtasks(after) {
    var subtasks = [];
    if (!after || !after.length) {
      return subtasks;
    }
    for (var i = 0; i < after.length; i++) {
      var taskDef = after[i];
      for (var name in taskDef) {
        if (taskDef.hasOwnProperty(name)) {
          subtasks.push(task(name, taskDef[name]));
        }
      }
    }
    return subtasks;
  }

  /**
   * @class Task
   * @desc
   * Instantiate a task given the given `config`.
   * The task can then be run using the `run()` instance method.
   * @param {string} name the name of the task to instantiate
   * @param {object} [descriptor] a configuration object that will determine
   *                            which task to run and in which order
   * @param {object} [descriptor.after] an array of task to run after this one
   * @param {object} [context] a default context to run the task with
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @see hbpCollaboratory.hbpCollaboratoryAutomator.task
   *
   */
  function Task(name, descriptor, context) {
    if (!handlers[name]) {
      throw new Error('TaskNotFound');
    }
    descriptor = descriptor || {};
    context = context || {};
    this.state = 'idle';
    this.name = name;
    this.descriptor = descriptor;
    this.defaultContext = context;
    this.state = 'idle';
    this.promise = null;
    this.error = null;
    this.subtasks = createSubtasks(descriptor.after);
  }

  Task.prototype = {
    /**
     * Launch the task.
     *
     * @memberof hbpCollaboratory.hbpCollaboratoryAutomator.Task
     * @param {object} context current context will be merged into the default
     *                         one.
     * @return {Promise} promise to return the result of the task
     */
    run: function(context) {
      var self = this;
      // run an intance of task only once.
      if (self.state !== 'idle') {
        return self.promise;
      }
      context = angular.extend({}, this.defaultContext, context);
      var onSuccess = function(result) {
        var subContext = angular.copy(context);
        subContext[self.name] = result;
        return self.runSubtasks(subContext)
        .then(function() {
          self.state = 'success';
          return result;
        });
      };
      var onError = function(err) {
        self.state = 'error';
        // noop operation if is already one
        return $q.reject(hbpErrorService.error(err));
      };
      self.state = 'progress';
      self.promise = $q.when(handlers[self.name](self.descriptor, context))
        .then(onSuccess)
        .catch(onError);
      return self.promise;
    },

    /**
     * Run all subtasks of the this tasks.
     *
     * @param  {object} context the current context
     * @return {Array}          all the results in an array
     */
    runSubtasks: function(context) {
      var promises = [];
      angular.forEach(this.subtasks, function(task) {
        promises.push(task.run(context));
      });
      return $q.all(promises);
    }
  };

  /**
   * Return a HbpError when a parameter is missing.
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @param  {string} key    name of the key
   * @param  {object} config the invalid configuration object
   * @return {HbpError}      a HbpError instance
   * @private
   */
  function missingDataError(key, config) {
    return hbpErrorService({
      type: 'KeyError',
      message: 'Missing `' + key + '` key in config',
      data: {
        config: config
      }
    });
  }

  /**
   * Ensure that all parameters listed after config are presents.
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @param  {object} config task descriptor
   * @return {object} created entities
   */
  function ensureParameters(config) {
    var parameters = Array.prototype.splice(1);
    for (var p in parameters) {
      if (angular.isUndefined(parameters[p])) {
        return $q.reject(missingDataError(p, config));
      }
    }
    return $q.when(config);
  }

  /**
   * Return an object that only contains attributes
   * from the `attrs` list.
   *
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator
   * @param  {object} config key-value store
   * @param  {Array} attrs   a list of keys to extract from `config`
   * @return {object}        key-value store containing only keys from attrs
   *                         found in `config`
   */
  function extractAttributes(config, attrs) {
    var r = {};
    angular.forEach(attrs, function(a) {
      if (angular.isDefined(config[a])) {
        r[a] = config[a];
      }
    });
    return r;
  }

  return {
    handlers: handlers,
    registerHandler: registerHandler,
    task: task,
    extractAttributes: extractAttributes,
    ensureParameters: ensureParameters
  };
}]);

/* eslint camelcase: 0 */

angular.module('hbpCollaboratoryAppStore', ['bbpConfig', 'hbpCommon'])
.constant('folderAppId', '__collab_folder__')
.service('hbpCollaboratoryAppStore', ['$q', '$http', '$cacheFactory', 'hbpErrorService', 'bbpConfig', 'hbpUtil', function(
  $q, $http, $cacheFactory,
  hbpErrorService, bbpConfig, hbpUtil
) {
  var appsCache = $cacheFactory('__appsCache__');
  var urlBase = bbpConfig.get('api.collab.v0') + '/extension/';
  var apps = null;

  var App = function(attrs) {
    var self = this;
    angular.forEach(attrs, function(v, k) {
      self[k] = v;
    });
  };
  App.prototype = {
    toJson: function() {
      return {
        id: this.id,
        description: this.description,
        edit_url: this.editUrl,
        run_url: this.runUrl,
        title: this.title
      };
    }
  };
  App.fromJson = function(json) {
    /* jshint camelcase: false */
    return new App({
      id: json.id,
      deleted: json.deleted,
      description: json.description,
      editUrl: json.edit_url,
      runUrl: json.run_url,
      title: json.title,
      createdBy: json.created_by
    });
  };

  appsCache.put('__collab_folder__', {
    id: '__collab_folder__',
    title: 'Folder'
  });

  var loadAll = function(promise) {
    return promise.then(function(rs) {
      if (rs.hasNext) {
        return loadAll(rs.next());
      }
      apps = rs.results;
      return apps;
    });
  };

  var getApps = function() {
    if (!apps) {
      return loadAll(hbpUtil.paginatedResultSet($http.get(urlBase), {
        factory: App.fromJson
      }));
    }
    return $q.when(apps);
  };

  var getById = function(id) {
    if (!id) {
      return $q.when(null);
    }
    var ext = appsCache.get(id);
    if (ext) {
      return $q.when(ext);
    }
    return $http.get(urlBase + id + '/').then(function(res) {
      appsCache.put(id, App.fromJson(res.data));
      return appsCache.get(id);
    }, function(res) {
      return $q.reject(hbpErrorService.httpError(res));
    });
  };

  var findOne = function(options) {
    return $http.get(urlBase, {params: options}).then(function(res) {
      var results = res.data.results;
      // Reject if more than one results
      if (results.length > 1) {
        return $q.reject(hbpErrorService.error({
          type: 'TooManyResults',
          message: 'Multiple apps has been retrieved ' +
                   'when only one was expected.',
          data: res.data
        }));
      }
      // Null when no result
      if (results.length === 0) {
        return null;
      }
      // Build the app if exactly one result
      var app = App.fromJson(results[0]);
      appsCache.put(app.id, app);
      return app;
    }, hbpUtil.ferr);
  };

  return {
    list: getApps,
    getById: getById,
    findOne: findOne
  };
}]);

/* eslint camelcase:[2, {properties: "never"}] */
'use strict';

angular.module('hbpCollaboratoryNavStore', ['hbpCommon', 'uuid4'])
.service('hbpCollaboratoryNavStore', ['$q', '$http', '$log', '$cacheFactory', '$timeout', 'orderByFilter', 'uuid4', 'hbpUtil', 'bbpConfig', function($q, $http, $log,
    $cacheFactory, $timeout, orderByFilter, uuid4,
    hbpUtil, bbpConfig) {
  var collabApiUrl = bbpConfig.get('api.collab.v0') + '/collab/';
  // a cache with individual nav items
  var cacheNavItems = $cacheFactory('navItem');

  // a cache with the promises of each collab's nav tree root
  var cacheNavRoots = $cacheFactory('navRoot');

  var NavItem = function(attr) {
    var self = this;
    angular.forEach(attr, function(v, k) {
      self[k] = v;
    });
    if (angular.isUndefined(this.context)) {
      this.context = uuid4.generate();
    }
    if (angular.isUndefined(this.children)) {
      this.children = [];
    }
  };
  NavItem.prototype = {
    toJson: function() {
      /* jshint camelcase: false */
      return {
        id: this.id,
        app_id: this.appId,
        collab: this.collabId,
        name: this.name,
        context: this.context,
        order_index: this.order,
        type: this.type || (this.folder ? 'FO' : 'IT'),
        parent: this.parentId
      };
    },
    update: function(attrs) {
      angular.forEach([
        'id', 'name', 'children', 'context',
        'collabId', 'appId', 'order', 'folder',
        'parentId', 'type'
      ], function(a) {
        if (angular.isDefined(attrs[a])) {
          this[a] = attrs[a];
        }
      }, this);

      return this;
    },
    ensureCached: function() {
      cacheNavItems.put(key(this.collabId, this.id), this);
      return this;
    }
  };
  /**
   * Manage `acc` accumulator with all the data from jsonArray and return it.
   *
   * @param  {int} collabId  the collab ID
   * @param  {array} jsonArray description of the children
   * @param  {Array} acc       the accumulator
   * @return {Array}           the children
   */
  function childrenFromJson(collabId, jsonArray, acc) {
    acc = acc || [];
    // an undefined array means we abort the process
    // where an empty array will ensure the resulting array
    // is empty as well.
    if (angular.isUndefined(jsonArray)) {
      return acc;
    }

    acc.length = 0;
    angular.forEach(jsonArray, function(json) {
      acc.push(NavItem.fromJson(collabId, json));
    });
    return acc;
  }
  NavItem.fromJson = function(collabId, json) {
    /* jshint camelcase: false */
    var attrs = {
      id: json.id,
      appId: json.app_id,
      collabId: collabId,
      name: json.name,
      context: json.context,
      order: json.order_index,
      folder: json.type === 'FO',
      type: json.type,
      parentId: json.parent,
      children: childrenFromJson(collabId, json.children)
    };
    var k = key(collabId, attrs.id);
    var cached = cacheNavItems.get(k);
    if (cached) {
      return cached.update(attrs);
    }
    return new NavItem(attrs).ensureCached();
  };

  var getRoot = function(collabId) {
    var treePromise = cacheNavRoots.get(collabId);

    if (!treePromise) {
      treePromise = $http.get(collabApiUrl + collabId + '/nav/all/').then(
        function(resp) {
          var root;
          var i;
          var item;
          var data = orderByFilter(resp.data, '+order_index');

          // fill in the cache
          for (i = 0; i !== data.length; ++i) {
            item = NavItem.fromJson(collabId, data[i]);
            if (item.context === 'root') {
              root = item;
            }
          }

          // link children and parents
          for (i = 0; i !== data.length; ++i) {
            item = cacheNavItems.get(key(collabId, data[i].id));
            if (item.parentId) {
              var parent = cacheNavItems.get(key(collabId, item.parentId));
              parent.children.push(item);
            }
          }

          return root;
        },
        hbpUtil.ferr
      );

      cacheNavRoots.put(collabId, treePromise);
    }

    return treePromise;
  };

  var get = function(collabId, nodeId) {
    return getRoot(collabId).then(function() {
      var k = key(collabId, nodeId);
      var item = cacheNavItems.get(k);

      if (!item) {
        $log.error('unknown nav item', k);
      }

      return item;
    });
  };

  var addNode = function(collabId, navItem) {
    return $http.post(collabApiUrl + collabId + '/nav/', navItem.toJson())
    .then(function(resp) {
      return NavItem.fromJson(collabId, resp.data);
    }, hbpUtil.ferr);
  };

  var deleteNode = function(collabId, navItem) {
    return $http.delete(collabApiUrl + collabId + '/nav/' + navItem.id + '/')
    .then(function() {
      cacheNavItems.remove(key(collabId, navItem.id));
    }, hbpUtil.ferr);
  };

  var update = function(collabId, navItem) {
    navItem.collabId = collabId;
    return $http.put(collabApiUrl + collabId + '/nav/' +
      navItem.id + '/', navItem.toJson())
    .then(function(resp) {
      return NavItem.fromJson(collabId, resp.data);
    }, hbpUtil.ferr);
  };

  // ordering operation needs to be globally queued to ensure consistency.
  var insertQueue = $q.when();

  /**
   * Insert node in the three.
   *
   * @param  {int} collabId   id of the collab
   * @param  {NavItem} navItem    Nav item instance
   * @param  {NavItem} parentItem parent item
   * @param  {int} insertAt   add to the menu
   * @return {Promise}        a promise that will
   *                          return the update nav item
   */
  function insertNode(collabId, navItem, parentItem, insertAt) {
    return insertQueue.then(function() {
      navItem.order = insertAt + 1; // first item order_index must be 1
      navItem.parentId = parentItem.id;
      return update(collabId, navItem);
    });
  }

  /**
   * Return a unique key for chaching a nav item.
   * @param  {int} collabId collab ID
   * @param  {int} nodeId   NavItem ID
   * @return {string}       the unique key
   */
  function key(collabId, nodeId) {
    return collabId + '--' + nodeId;
  }

  return {
    NavItem: NavItem,
    getRoot: getRoot,
    getNode: get,
    addNode: addNode,
    saveNode: update,
    deleteNode: deleteNode,
    insertNode: insertNode
  };
}]);

/* eslint camelcase: 0 */
/**
 * @namespace hbpCollaboratoryStorage
 * @memberof hbpCollaboratory
 * @desc
 * storageUtil provides utility functions to ease the interaction of apps with storage.
 */
angular.module('hbpCollaboratoryStorage', ['hbpCommon'])
.factory('hbpCollaboratoryStorage',
  ['hbpUtil', 'hbpEntityStore', 'hbpErrorService', function hbpCollaboratoryStorage(hbpUtil, hbpEntityStore, hbpErrorService) {
    /**
     * Retrieve the key to lookup for on entities given the ctx
     * @memberof hbpCollaboratory.hbpCollaboratoryStorage
     * @param  {string} ctx application context UUID
     * @return {string}     name of the entity attribute that should be used
     * @private
     */
    function metadataKey(ctx) {
      return 'ctx_' + ctx;
    }

    /**
     * @name setContextMetadata
     * @memberof hbpCollaboratory.hbpCollaboratoryStorage
     * @desc
     * the function links the contextId with the doc browser entity in input
     * by setting a specific metadata on the entity.
     *
     * Entity object in input must contain the following properties:
     * - _entityType
     * - _uuid
     *
     * In case of error, the promise is rejected with a `HbpError` instance.
     *
     * @param  {Object} entity doc browser entity
     * @param  {String} contextId collab app context id
     * @return {Promise} a promise that resolves when the operation is completed
     */
    function setContextMetadata(entity, contextId) {
      var newMetadata = {};
      newMetadata[metadataKey(contextId)] = 1;

      return hbpEntityStore.addMetadata(entity, newMetadata)
      .catch(hbpErrorService.error);
    }

    /**
     * @name getEntityByContext
     * @memberof hbpCollaboratory.hbpCollaboratoryStorage
     * @desc
     * the function gets the entity linked to the contextId in input.
     *
     * In case of error, the promise is rejected with a `HbpError` instance.
     *
     * @param  {String} contextId collab app context id
     * @return {Promise} a promise that resolves when the operation is completed
     */
    function getEntityByContext(contextId) {
      var queryParams = {};
      queryParams[metadataKey(contextId)] = 1;

      return hbpEntityStore.query(queryParams).then(null, hbpUtil.ferr);
    }

    /**
     * @name deleteContextMetadata
     * @memberof hbpCollaboratory.hbpCollaboratoryStorage
     * @desc
     * the function unlink the contextId from the entity in input
     * by deleting the context metadata.
     *
     * Entity object in input must contain the following properties:
     * - _entityType
     * - _uuid
     *
     * In case of error, the promise is rejected with a `HbpError` instance.
     *
     * @param  {Object} entity doc browser entity
     * @param  {String} contextId collab app context id
     * @return {Promise} a promise that resolves when the operation is completed
     */
    function deleteContextMetadata(entity, contextId) {
      var key = metadataKey(contextId);

      return hbpEntityStore.deleteMetadata(entity, [key])
      .then(null, hbpErrorService.error);
    }

    /**
     * @name updateContextMetadata
     * @memberof hbpCollaboratory.hbpCollaboratoryStorage
     * @desc
     * the function delete the contextId from the `oldEntity` metadata and add
     * it as `newEntity` metadata.
     *
     * Entity objects in input must contain the following properties:
     * - _entityType
     * - _uuid
     *
     * In case of error, the promise is rejected with a `HbpError` instance.
     *
     * @param  {Object} newEntity doc browser entity to link to the context
     * @param  {Object} oldEntity doc browser entity to unlink from the context
     * @param  {String} contextId collab app context id
     * @return {Promise} a promise that resolves when the operation is completed
     */
    function updateContextMetadata(newEntity, oldEntity, contextId) {
      return deleteContextMetadata(oldEntity, contextId).then(function() {
        return setContextMetadata(newEntity, contextId);
      }).catch(hbpErrorService.error);
    }

    /**
     * @name getProjectByCollab
     * @memberof hbpCollaboratory.hbpCollaboratoryStorage
     * @desc
     * the function returns the storage project of the collabId in input.
     *
     * In case of error, the promise is rejected with a `HbpError` instance.
     *
     * @param  {String} collabId collab id
     * @return {Promise} a promise that resolves to the project details
     */
    function getProjectByCollab(collabId) {
      var queryParams = {
        managed_by_collab: collabId
      };
      return hbpEntityStore.query(queryParams).then(null, hbpUtil.ferr);
    }

    return {
      setContextMetadata: setContextMetadata,
      getEntityByContext: getEntityByContext,
      deleteContextMetadata: deleteContextMetadata,
      updateContextMetadata: updateContextMetadata,
      getProjectByCollab: getProjectByCollab
    };
  }]);

angular.module('hbpCollaboratoryAutomator')
.run(['$log', '$q', 'hbpCollabStore', 'hbpCollaboratoryAutomator', function createCollabService(
  $log, $q, hbpCollabStore,
  hbpCollaboratoryAutomator
) {
  hbpCollaboratoryAutomator.registerHandler('collab', createCollab);

  /**
   * @function createCollab
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator.Tasks
   * @desc
   *  Create a collab defined by the given options.
   * @param {object} descriptor - Parameters to create the collab
   * @param {string} descriptor.name - Name of the collab
   * @param {string} descriptor.description - Description in less than 140 characters
   *                                       of the collab
   * @param {string} [descriptor.privacy] - 'private' or 'public'. Notes that only
   *                                   HBP Members can create private collab
   * @param {Array} [after] - descriptor of subtasks
   * @return {Promise} - promise of a collab
   */
  function createCollab(descriptor) {
    var attr = hbpCollaboratoryAutomator.extractAttributes(
      descriptor,
      ['title', 'content', 'private']
    );
    $log.debug('Create collab', descriptor);
    return hbpCollabStore.create(attr);
  }
}]);

angular.module('hbpCollaboratoryAutomator')
.run(['$log', 'hbpCollaboratoryAppStore', 'hbpCollaboratoryNavStore', 'hbpCollaboratoryAutomator', 'hbpCollaboratoryStorage', 'hbpEntityStore', function createNavItem(
  $log,
  hbpCollaboratoryAppStore,
  hbpCollaboratoryNavStore,
  hbpCollaboratoryAutomator,
  hbpCollaboratoryStorage,
  hbpEntityStore
) {
  hbpCollaboratoryAutomator.registerHandler('nav', createNavItem);

  /**
   * Create a new nav item.
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator.Tasks
   * @param {object} descriptor a descriptor description
   * @param {string} descriptor.name name of the nav item
   * @param {Collab} descriptor.collabId collab in which to add the item in.
   * @param {string} descriptor.app app name linked to the nav item
   * @param {object} [context] the current run context
   * @param {object} [context.collab] a collab instance created previously
   * @return {Promise} promise of a NavItem instance
   */
  function createNavItem(descriptor, context) {
    var collabId = function() {
      return (descriptor && descriptor.collab) ||
        (context && context.collab.id);
    };
    var findApp = function() {
      return hbpCollaboratoryAppStore.findOne({title: descriptor.app});
    };
    var createNav = function(app) {
      return hbpCollaboratoryNavStore.getRoot(collabId())
      .then(function(parentItem) {
        return hbpCollaboratoryNavStore.addNode(collabId(),
          new hbpCollaboratoryNavStore.NavItem({
            collab: collabId(),
            name: descriptor.name,
            appId: app.id,
            parentId: parentItem.id
          })
        );
      });
    };
    var linkToStorage = function(nav) {
      if (!descriptor.entity) {
        return nav;
      }
      var setLink = function(entity) {
        return hbpCollaboratoryStorage.setContextMetadata(entity, nav.context)
        .then(function() {
          return nav;
        });
      };
      // It might be the name used in a previous storage task.
      if (context && context.storage && context.storage[descriptor.entity]) {
        return setLink(context.storage[descriptor.entity]);
      }
      return hbpEntityStore.get(descriptor.entity).then(setLink);
    };
    $log.debug('Create nav item', descriptor, context);
    return findApp(descriptor.app)
    .then(createNav)
    .then(linkToStorage);
  }
}]);

angular.module('hbpCollaboratoryAutomator')
.run(['$log', '$q', 'hbpEntityStore', 'hbpErrorService', 'hbpCollaboratoryAutomator', 'hbpCollaboratoryStorage', function createCollabService(
  $log, $q, hbpEntityStore,
  hbpErrorService,
  hbpCollaboratoryAutomator,
  hbpCollaboratoryStorage
) {
  hbpCollaboratoryAutomator.registerHandler('storage', storage);

  /**
   * Copy files and folders to the destination collab storage.
   *
   * @memberof hbpCollaboratory.hbpCollaboratoryAutomator.Tasks
   * @param {object} descriptor the task configuration
   * @param {object} descriptor.storage a object where keys are the file path in the
   *                                new collab and value are the UUID of the
   *                                entity to copy at this path.
   * @param {object} [descriptor.collab] id of the collab
   * @param {object} context the current task context
   * @param {object} [context.collab] the collab in which entities will be copied
   * @return {object} created entities where keys are the same as provided in
   *                  config.storage
   */
  function storage(descriptor, context) {
    return hbpCollaboratoryAutomator.ensureParameters(
      descriptor, 'storage'
    ).then(function() {
      return hbpCollaboratoryStorage
        .getProjectByCollab(descriptor.collab || context.collab.id)
        .then(function(projectEntity) {
          var promises = {};
          angular.forEach(descriptor.storage, function(value, name) {
            if (angular.isString(value)) {
              promises[name] = (
                hbpEntityStore.copy(value, projectEntity._uuid));
            } else {
              $log.warn('Invalid configuration for storage task', descriptor);
            }
          });
          return $q.all(promises);
        });
    });
  }
}]);

/**
 * @namespace hbpCollaboratory
 * @desc
 * Provides angular services to work with HBP Collaboratory.
 */
angular.module('hbpCollaboratory', [
  'hbpCollaboratoryAutomator',
  'hbpCollaboratoryNavStore',
  'hbpCollaboratoryAppStore'
]);

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImF1dG9tYXRvci9hdXRvbWF0b3IuanMiLCJzZXJ2aWNlcy9hcHAtc3RvcmUuanMiLCJzZXJ2aWNlcy9uYXYtc3RvcmUuanMiLCJzZXJ2aWNlcy9zdG9yYWdlLmpzIiwiYXV0b21hdG9yL3Rhc2tzL2NyZWF0ZS1jb2xsYWIuanMiLCJhdXRvbWF0b3IvdGFza3MvY3JlYXRlLW5hdi1pdGVtLmpzIiwiYXV0b21hdG9yL3Rhc2tzL3N0b3JhZ2UuanMiLCJtYWluLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQTZCQSxRQUFRLE9BQU8sNkJBQTZCO0VBQzFDO0VBQ0E7RUFDQTtFQUNBO0VBQ0E7RUFDQTs7Q0FFRCxRQUFRLCtEQUE2QixTQUFTO0VBQzdDLElBQUksTUFBTTtFQUNWO0VBQ0EsSUFBSSxXQUFXOzs7Ozs7Ozs7RUFTZixTQUFTLGdCQUFnQixNQUFNLElBQUk7SUFDakMsU0FBUyxRQUFROzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBNEJuQixTQUFTLEtBQUssTUFBTSxZQUFZLFNBQVM7SUFDdkMsSUFBSTtNQUNGLE9BQU8sSUFBSSxLQUFLLE1BQU0sWUFBWTtNQUNsQyxPQUFPLElBQUk7TUFDWCxLQUFLLE1BQU0sYUFBYTtNQUN4QixNQUFNLGdCQUFnQixNQUFNO1FBQzFCLE1BQU07UUFDTixTQUFTLGtCQUFrQixPQUFPLE9BQU87UUFDekMsTUFBTTtVQUNKLE9BQU87VUFDUCxNQUFNO1VBQ04sWUFBWTtVQUNaLFNBQVM7Ozs7Ozs7Ozs7Ozs7OztFQWVqQixTQUFTLGVBQWUsT0FBTztJQUM3QixJQUFJLFdBQVc7SUFDZixJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sUUFBUTtNQUMzQixPQUFPOztJQUVULEtBQUssSUFBSSxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztNQUNyQyxJQUFJLFVBQVUsTUFBTTtNQUNwQixLQUFLLElBQUksUUFBUSxTQUFTO1FBQ3hCLElBQUks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bmFtZXNwYWNlIGhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3JcbiAqIEBtZW1iZXJvZiBoYnBDb2xsYWJvcmF0b3J5XG4gKiBAZGVzY1xuICogaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvciBpcyBhbiBBbmd1bGFySlMgZmFjdG9yeSB0aGF0XG4gKiBwcm92aWRlIHRhc2sgYXV0b21hdGlvbiB0byBhY2NvbXBsaXNoIGEgc2VxdWVuY2Ugb2ZcbiAqIGNvbW1vbiBvcGVyYXRpb24gaW4gQ29sbGFib3JhdG9yeS5cbiAqXG4gKiBIb3cgdG8gYWRkIG5ldyB0YXNrc1xuICogLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqXG4gKiBOZXcgdGFza3MgY2FuIGJlIGFkZGVkIGJ5IGNhbGxpbmcgYGBoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yLnJlZ2lzdGVySGFuZGxlcmBgLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSAkcSBpbmplY3RlZCBkZXBlbmRlbmN5XG4gKiBAcmV0dXJuIHtvYmplY3R9IGhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3IgYW5ndWxhciBzZXJ2aWNlXG4gKiBAZXhhbXBsZSA8Y2FwdGlvbj5DcmVhdGUgYSBDb2xsYWIgd2l0aCBhIGZldyBuYXZpZ2F0aW9uIGl0ZW1zPC9jYXB0aW9uPlxuICogLy8gQ3JlYXRlIGEgQ29sbGFiIHdpdGggYSBmZXcgbmF2aWdhdGlvbiBpdGVtcy5cbiAqIGFuZ3VsYXIubW9kdWxlKCdNeU1vZHVsZScsIFsnaGJwQ29sbGFib3JhdG9yeSddKVxuICogLnJ1bihmdW5jdGlvbihoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yLCAkbG9nKSB7XG4gKiAgIHZhciBjb25maWcgPSB7XG4gKiAgICAgdGl0bGU6ICdNeSBDdXN0b20gQ29sbGFiJyxcbiAqICAgICBjb250ZW50OiAnTXkgQ29sbGFiIENvbnRlbnQnLFxuICogICAgIHByaXZhdGU6IGZhbHNlXG4gKiAgIH1cbiAqICAgaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvci50YXNrKGNvbmZpZykucnVuKCkudGhlbihmdW5jdGlvbihjb2xsYWIpIHtcbiAqICAgXHQgJGxvZy5pbmZvKCdDcmVhdGVkIENvbGxhYicsIGNvbGxhYik7XG4gKiAgIH0pXG4gKiB9KVxuICovXG5hbmd1bGFyLm1vZHVsZSgnaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvcicsIFtcbiAgJ2JicENvbmZpZycsXG4gICdoYnBDb21tb24nLFxuICAnaGJwRG9jdW1lbnRDbGllbnQnLFxuICAnaGJwQ29sbGFib3JhdG9yeUFwcFN0b3JlJyxcbiAgJ2hicENvbGxhYm9yYXRvcnlOYXZTdG9yZScsXG4gICdoYnBDb2xsYWJvcmF0b3J5U3RvcmFnZSdcbl0pXG4uZmFjdG9yeSgnaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvcicsIGZ1bmN0aW9uIGhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3IoXG4gICRxLCAkbG9nLCBoYnBFcnJvclNlcnZpY2Vcbikge1xuICB2YXIgaGFuZGxlcnMgPSB7fTtcblxuICAvKipcbiAgICogUmVnaXN0ZXIgYSBoYW5kbGVyIGZ1bmN0aW9uIGZvciB0aGUgZ2l2ZW4gdGFzayBuYW1lLlxuICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yXG4gICAqIEBwYXJhbSAge3N0cmluZ30gICBuYW1lIGhhbmRsZSBhY3Rpb25zIHdpdGggdGhlIHNwZWNpZmllZCBuYW1lXG4gICAqIEBwYXJhbSAge0Z1bmN0aW9ufSBmbiBhIGZ1bmN0aW9uIHRoYXQgYWNjZXB0IHRoZSBjdXJyZW50IGNvbnRleHQgaW5cbiAgICogICAgICAgICAgICAgICAgICAgICAgIHBhcmFtZXRlci5cbiAgICovXG4gIGZ1bmN0aW9uIHJlZ2lzdGVySGFuZGxlcihuYW1lLCBmbikge1xuICAgIGhhbmRsZXJzW25hbWVdID0gZm47XG4gIH1cblxuICAvKipcbiAgICogQG5hbWVzcGFjZSBUYXNrc1xuICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yXG4gICAqIEBkZXNjXG4gICAqIEF2YWlsYWJsZSB0YXNrcy5cbiAgICovXG5cbiAgLyoqXG4gICAqIEluc3RhbnRpYXRlIGEgbmV3IFRhc2sgaW50YW5jZSB0aGF0IHdpbGwgcnVuIHRoZSBjb2RlIGRlc2NyaWJlIGZvclxuICAgKiBhIGhhbmRsZXJzIHdpdGggdGhlIGdpdmUgYGBuYW1lYGAuXG4gICAqXG4gICAqIFRoZSBkZXNjcmlwdG9yIGlzIHBhc3NlZCB0byB0aGUgdGFzayBhbmQgcGFyYW1ldHJpemUgaXQuXG4gICAqIFRoZSB0YXNrIGNvbnRleHQgaXMgY29tcHV0ZWQgYXQgdGhlIHRpbWUgdGhlIHRhc2sgaXMgcmFuLiBBIGRlZmF1bHQgY29udGV4dFxuICAgKiBjYW4gYmUgZ2l2ZW4gYXQgbG9hZCB0aW1lIGFuZCBpdCB3aWxsIGJlIGZlZCB3aXRoIHRoZSByZXN1bHQgb2YgZWFjaCBwYXJlbnRcbiAgICogKGJ1dCBub3Qgc2libGluZykgdGFza3MgYXMgd2VsbC5cbiAgICpcbiAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvclxuICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZSB0aGUgbmFtZSBvZiB0aGUgdGFzayB0byBpbnN0YW50aWF0ZVxuICAgKiBAcGFyYW0ge29iamVjdH0gW2Rlc2NyaXB0b3JdIGEgY29uZmlndXJhdGlvbiBvYmplY3QgdGhhdCB3aWxsIGRldGVybWluZVxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGljaCB0YXNrIHRvIHJ1biBhbmQgaW4gd2hpY2ggb3JkZXJcbiAgICogQHBhcmFtIHtvYmplY3R9IFtkZXNjcmlwdG9yLmFmdGVyXSBhbiBhcnJheSBvZiB0YXNrIHRvIHJ1biBhZnRlciB0aGlzIG9uZVxuICAgKiBAcGFyYW0ge29iamVjdH0gW2NvbnRleHRdIGEgZGVmYXVsdCBjb250ZXh0IHRvIHJ1biB0aGUgdGFzayB3aXRoXG4gICAqXG4gICAqIEByZXR1cm4ge1Rhc2t9IC0gdGhlIG5ldyB0YXNrIGluc3RhbmNlXG4gICAqL1xuICBmdW5jdGlvbiB0YXNrKG5hbWUsIGRlc2NyaXB0b3IsIGNvbnRleHQpIHtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIG5ldyBUYXNrKG5hbWUsIGRlc2NyaXB0b3IsIGNvbnRleHQpO1xuICAgIH0gY2F0Y2ggKGV4KSB7XG4gICAgICAkbG9nLmVycm9yKCdFWENFUFRJT04nLCBleCk7XG4gICAgICB0aHJvdyBoYnBFcnJvclNlcnZpY2UuZXJyb3Ioe1xuICAgICAgICB0eXBlOiAnSW52YWxpZFRhc2snLFxuICAgICAgICBtZXNzYWdlOiAnSW52YWxpZCB0YXNrICcgKyBuYW1lICsgJzogJyArIGV4LFxuICAgICAgICBkYXRhOiB7XG4gICAgICAgICAgY2F1c2U6IGV4LFxuICAgICAgICAgIG5hbWU6IG5hbWUsXG4gICAgICAgICAgZGVzY3JpcHRvcjogZGVzY3JpcHRvcixcbiAgICAgICAgICBjb250ZXh0OiBjb250ZXh0XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYW4gYXJyYXkgb2YgdGFza3MgZ2l2ZW4gYW4gYXJyYXkgY29udGFpbmluZyBvYmplY3Qgd2hlcmVcbiAgICogdGhlIGtleSBpcyB0aGUgdGFzayBuYW1lIHRvIHJ1biBhbmQgdGhlIHZhbHVlIGlzIHRoZSBkZXNjcmlwdG9yXG4gICAqIHBhcmFtZXRlci5cbiAgICpcbiAgICogQHBhcmFtICB7b2JqZWN0fSBhZnRlciB0aGUgY29udGVudCBvZiBgYGRlc2NyaXB0b3IuYWZ0ZXJgYFxuICAgKiBAcmV0dXJuIHtBcnJheS9UYXNrfSBhcnJheSBvZiBzdWJ0YXNrc1xuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgZnVuY3Rpb24gY3JlYXRlU3VidGFza3MoYWZ0ZXIpIHtcbiAgICB2YXIgc3VidGFza3MgPSBbXTtcbiAgICBpZiAoIWFmdGVyIHx8ICFhZnRlci5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBzdWJ0YXNrcztcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhZnRlci5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHRhc2tEZWYgPSBhZnRlcltpXTtcbiAgICAgIGZvciAodmFyIG5hbWUgaW4gdGFza0RlZikge1xuICAgICAgICBpZiAodGFza0RlZi5oYXNPd25Qcm9wZXJ0eShuYW1lKSkge1xuICAgICAgICAgIHN1YnRhc2tzLnB1c2godGFzayhuYW1lLCB0YXNrRGVmW25hbWVdKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN1YnRhc2tzO1xuICB9XG5cbiAgLyoqXG4gICAqIEBjbGFzcyBUYXNrXG4gICAqIEBkZXNjXG4gICAqIEluc3RhbnRpYXRlIGEgdGFzayBnaXZlbiB0aGUgZ2l2ZW4gYGNvbmZpZ2AuXG4gICAqIFRoZSB0YXNrIGNhbiB0aGVuIGJlIHJ1biB1c2luZyB0aGUgYHJ1bigpYCBpbnN0YW5jZSBtZXRob2QuXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lIHRoZSBuYW1lIG9mIHRoZSB0YXNrIHRvIGluc3RhbnRpYXRlXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBbZGVzY3JpcHRvcl0gYSBjb25maWd1cmF0aW9uIG9iamVjdCB0aGF0IHdpbGwgZGV0ZXJtaW5lXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWNoIHRhc2sgdG8gcnVuIGFuZCBpbiB3aGljaCBvcmRlclxuICAgKiBAcGFyYW0ge29iamVjdH0gW2Rlc2NyaXB0b3IuYWZ0ZXJdIGFuIGFycmF5IG9mIHRhc2sgdG8gcnVuIGFmdGVyIHRoaXMgb25lXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBbY29udGV4dF0gYSBkZWZhdWx0IGNvbnRleHQgdG8gcnVuIHRoZSB0YXNrIHdpdGhcbiAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvclxuICAgKiBAc2VlIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvci50YXNrXG4gICAqXG4gICAqL1xuICBmdW5jdGlvbiBUYXNrKG5hbWUsIGRlc2NyaXB0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWhhbmRsZXJzW25hbWVdKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Rhc2tOb3RGb3VuZCcpO1xuICAgIH1cbiAgICBkZXNjcmlwdG9yID0gZGVzY3JpcHRvciB8fCB7fTtcbiAgICBjb250ZXh0ID0gY29udGV4dCB8fCB7fTtcbiAgICB0aGlzLnN0YXRlID0gJ2lkbGUnO1xuICAgIHRoaXMubmFtZSA9IG5hbWU7XG4gICAgdGhpcy5kZXNjcmlwdG9yID0gZGVzY3JpcHRvcjtcbiAgICB0aGlzLmRlZmF1bHRDb250ZXh0ID0gY29udGV4dDtcbiAgICB0aGlzLnN0YXRlID0gJ2lkbGUnO1xuICAgIHRoaXMucHJvbWlzZSA9IG51bGw7XG4gICAgdGhpcy5lcnJvciA9IG51bGw7XG4gICAgdGhpcy5zdWJ0YXNrcyA9IGNyZWF0ZVN1YnRhc2tzKGRlc2NyaXB0b3IuYWZ0ZXIpO1xuICB9XG5cbiAgVGFzay5wcm90b3R5cGUgPSB7XG4gICAgLyoqXG4gICAgICogTGF1bmNoIHRoZSB0YXNrLlxuICAgICAqXG4gICAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvci5UYXNrXG4gICAgICogQHBhcmFtIHtvYmplY3R9IGNvbnRleHQgY3VycmVudCBjb250ZXh0IHdpbGwgYmUgbWVyZ2VkIGludG8gdGhlIGRlZmF1bHRcbiAgICAgKiAgICAgICAgICAgICAgICAgICAgICAgICBvbmUuXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gcHJvbWlzZSB0byByZXR1cm4gdGhlIHJlc3VsdCBvZiB0aGUgdGFza1xuICAgICAqL1xuICAgIHJ1bjogZnVuY3Rpb24oY29udGV4dCkge1xuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgLy8gcnVuIGFuIGludGFuY2Ugb2YgdGFzayBvbmx5IG9uY2UuXG4gICAgICBpZiAoc2VsZi5zdGF0ZSAhPT0gJ2lkbGUnKSB7XG4gICAgICAgIHJldHVybiBzZWxmLnByb21pc2U7XG4gICAgICB9XG4gICAgICBjb250ZXh0ID0gYW5ndWxhci5leHRlbmQoe30sIHRoaXMuZGVmYXVsdENvbnRleHQsIGNvbnRleHQpO1xuICAgICAgdmFyIG9uU3VjY2VzcyA9IGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgICB2YXIgc3ViQ29udGV4dCA9IGFuZ3VsYXIuY29weShjb250ZXh0KTtcbiAgICAgICAgc3ViQ29udGV4dFtzZWxmLm5hbWVdID0gcmVzdWx0O1xuICAgICAgICByZXR1cm4gc2VsZi5ydW5TdWJ0YXNrcyhzdWJDb250ZXh0KVxuICAgICAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICBzZWxmLnN0YXRlID0gJ3N1Y2Nlc3MnO1xuICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIHZhciBvbkVycm9yID0gZnVuY3Rpb24oZXJyKSB7XG4gICAgICAgIHNlbGYuc3RhdGUgPSAnZXJyb3InO1xuICAgICAgICAvLyBub29wIG9wZXJhdGlvbiBpZiBpcyBhbHJlYWR5IG9uZVxuICAgICAgICByZXR1cm4gJHEucmVqZWN0KGhicEVycm9yU2VydmljZS5lcnJvcihlcnIpKTtcbiAgICAgIH07XG4gICAgICBzZWxmLnN0YXRlID0gJ3Byb2dyZXNzJztcbiAgICAgIHNlbGYucHJvbWlzZSA9ICRxLndoZW4oaGFuZGxlcnNbc2VsZi5uYW1lXShzZWxmLmRlc2NyaXB0b3IsIGNvbnRleHQpKVxuICAgICAgICAudGhlbihvblN1Y2Nlc3MpXG4gICAgICAgIC5jYXRjaChvbkVycm9yKTtcbiAgICAgIHJldHVybiBzZWxmLnByb21pc2U7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJ1biBhbGwgc3VidGFza3Mgb2YgdGhlIHRoaXMgdGFza3MuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gIHtvYmplY3R9IGNvbnRleHQgdGhlIGN1cnJlbnQgY29udGV4dFxuICAgICAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICBhbGwgdGhlIHJlc3VsdHMgaW4gYW4gYXJyYXlcbiAgICAgKi9cbiAgICBydW5TdWJ0YXNrczogZnVuY3Rpb24oY29udGV4dCkge1xuICAgICAgdmFyIHByb21pc2VzID0gW107XG4gICAgICBhbmd1bGFyLmZvckVhY2godGhpcy5zdWJ0YXNrcywgZnVuY3Rpb24odGFzaykge1xuICAgICAgICBwcm9taXNlcy5wdXNoKHRhc2sucnVuKGNvbnRleHQpKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuICRxLmFsbChwcm9taXNlcyk7XG4gICAgfVxuICB9O1xuXG4gIC8qKlxuICAgKiBSZXR1cm4gYSBIYnBFcnJvciB3aGVuIGEgcGFyYW1ldGVyIGlzIG1pc3NpbmcuXG4gICAqIEBtZW1iZXJvZiBoYnBDb2xsYWJvcmF0b3J5LmhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3JcbiAgICogQHBhcmFtICB7c3RyaW5nfSBrZXkgICAgbmFtZSBvZiB0aGUga2V5XG4gICAqIEBwYXJhbSAge29iamVjdH0gY29uZmlnIHRoZSBpbnZhbGlkIGNvbmZpZ3VyYXRpb24gb2JqZWN0XG4gICAqIEByZXR1cm4ge0hicEVycm9yfSAgICAgIGEgSGJwRXJyb3IgaW5zdGFuY2VcbiAgICogQHByaXZhdGVcbiAgICovXG4gIGZ1bmN0aW9uIG1pc3NpbmdEYXRhRXJyb3Ioa2V5LCBjb25maWcpIHtcbiAgICByZXR1cm4gaGJwRXJyb3JTZXJ2aWNlKHtcbiAgICAgIHR5cGU6ICdLZXlFcnJvcicsXG4gICAgICBtZXNzYWdlOiAnTWlzc2luZyBgJyArIGtleSArICdgIGtleSBpbiBjb25maWcnLFxuICAgICAgZGF0YToge1xuICAgICAgICBjb25maWc6IGNvbmZpZ1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEVuc3VyZSB0aGF0IGFsbCBwYXJhbWV0ZXJzIGxpc3RlZCBhZnRlciBjb25maWcgYXJlIHByZXNlbnRzLlxuICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yXG4gICAqIEBwYXJhbSAge29iamVjdH0gY29uZmlnIHRhc2sgZGVzY3JpcHRvclxuICAgKiBAcmV0dXJuIHtvYmplY3R9IGNyZWF0ZWQgZW50aXRpZXNcbiAgICovXG4gIGZ1bmN0aW9uIGVuc3VyZVBhcmFtZXRlcnMoY29uZmlnKSB7XG4gICAgdmFyIHBhcmFtZXRlcnMgPSBBcnJheS5wcm90b3R5cGUuc3BsaWNlKDEpO1xuICAgIGZvciAodmFyIHAgaW4gcGFyYW1ldGVycykge1xuICAgICAgaWYgKGFuZ3VsYXIuaXNVbmRlZmluZWQocGFyYW1ldGVyc1twXSkpIHtcbiAgICAgICAgcmV0dXJuICRxLnJlamVjdChtaXNzaW5nRGF0YUVycm9yKHAsIGNvbmZpZykpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gJHEud2hlbihjb25maWcpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybiBhbiBvYmplY3QgdGhhdCBvbmx5IGNvbnRhaW5zIGF0dHJpYnV0ZXNcbiAgICogZnJvbSB0aGUgYGF0dHJzYCBsaXN0LlxuICAgKlxuICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yXG4gICAqIEBwYXJhbSAge29iamVjdH0gY29uZmlnIGtleS12YWx1ZSBzdG9yZVxuICAgKiBAcGFyYW0gIHtBcnJheX0gYXR0cnMgICBhIGxpc3Qgb2Yga2V5cyB0byBleHRyYWN0IGZyb20gYGNvbmZpZ2BcbiAgICogQHJldHVybiB7b2JqZWN0fSAgICAgICAga2V5LXZhbHVlIHN0b3JlIGNvbnRhaW5pbmcgb25seSBrZXlzIGZyb20gYXR0cnNcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgaW4gYGNvbmZpZ2BcbiAgICovXG4gIGZ1bmN0aW9uIGV4dHJhY3RBdHRyaWJ1dGVzKGNvbmZpZywgYXR0cnMpIHtcbiAgICB2YXIgciA9IHt9O1xuICAgIGFuZ3VsYXIuZm9yRWFjaChhdHRycywgZnVuY3Rpb24oYSkge1xuICAgICAgaWYgKGFuZ3VsYXIuaXNEZWZpbmVkKGNvbmZpZ1thXSkpIHtcbiAgICAgICAgclthXSA9IGNvbmZpZ1thXTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcjtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgaGFuZGxlcnM6IGhhbmRsZXJzLFxuICAgIHJlZ2lzdGVySGFuZGxlcjogcmVnaXN0ZXJIYW5kbGVyLFxuICAgIHRhc2s6IHRhc2ssXG4gICAgZXh0cmFjdEF0dHJpYnV0ZXM6IGV4dHJhY3RBdHRyaWJ1dGVzLFxuICAgIGVuc3VyZVBhcmFtZXRlcnM6IGVuc3VyZVBhcmFtZXRlcnNcbiAgfTtcbn0pO1xuIiwiLyogZXNsaW50IGNhbWVsY2FzZTogMCAqL1xuXG5hbmd1bGFyLm1vZHVsZSgnaGJwQ29sbGFib3JhdG9yeUFwcFN0b3JlJywgWydiYnBDb25maWcnLCAnaGJwQ29tbW9uJ10pXG4uY29uc3RhbnQoJ2ZvbGRlckFwcElkJywgJ19fY29sbGFiX2ZvbGRlcl9fJylcbi5zZXJ2aWNlKCdoYnBDb2xsYWJvcmF0b3J5QXBwU3RvcmUnLCBmdW5jdGlvbihcbiAgJHEsICRodHRwLCAkY2FjaGVGYWN0b3J5LFxuICBoYnBFcnJvclNlcnZpY2UsIGJicENvbmZpZywgaGJwVXRpbFxuKSB7XG4gIHZhciBhcHBzQ2FjaGUgPSAkY2FjaGVGYWN0b3J5KCdfX2FwcHNDYWNoZV9fJyk7XG4gIHZhciB1cmxCYXNlID0gYmJwQ29uZmlnLmdldCgnYXBpLmNvbGxhYi52MCcpICsgJy9leHRlbnNpb24vJztcbiAgdmFyIGFwcHMgPSBudWxsO1xuXG4gIHZhciBBcHAgPSBmdW5jdGlvbihhdHRycykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBhbmd1bGFyLmZvckVhY2goYXR0cnMsIGZ1bmN0aW9uKHYsIGspIHtcbiAgICAgIHNlbGZba10gPSB2O1xuICAgIH0pO1xuICB9O1xuICBBcHAucHJvdG90eXBlID0ge1xuICAgIHRvSnNvbjogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBpZDogdGhpcy5pZCxcbiAgICAgICAgZGVzY3JpcHRpb246IHRoaXMuZGVzY3JpcHRpb24sXG4gICAgICAgIGVkaXRfdXJsOiB0aGlzLmVkaXRVcmwsXG4gICAgICAgIHJ1bl91cmw6IHRoaXMucnVuVXJsLFxuICAgICAgICB0aXRsZTogdGhpcy50aXRsZVxuICAgICAgfTtcbiAgICB9XG4gIH07XG4gIEFwcC5mcm9tSnNvbiA9IGZ1bmN0aW9uKGpzb24pIHtcbiAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHJldHVybiBuZXcgQXBwKHtcbiAgICAgIGlkOiBqc29uLmlkLFxuICAgICAgZGVsZXRlZDoganNvbi5kZWxldGVkLFxuICAgICAgZGVzY3JpcHRpb246IGpzb24uZGVzY3JpcHRpb24sXG4gICAgICBlZGl0VXJsOiBqc29uLmVkaXRfdXJsLFxuICAgICAgcnVuVXJsOiBqc29uLnJ1bl91cmwsXG4gICAgICB0aXRsZToganNvbi50aXRsZSxcbiAgICAgIGNyZWF0ZWRCeToganNvbi5jcmVhdGVkX2J5XG4gICAgfSk7XG4gIH07XG5cbiAgYXBwc0NhY2hlLnB1dCgnX19jb2xsYWJfZm9sZGVyX18nLCB7XG4gICAgaWQ6ICdfX2NvbGxhYl9mb2xkZXJfXycsXG4gICAgdGl0bGU6ICdGb2xkZXInXG4gIH0pO1xuXG4gIHZhciBsb2FkQWxsID0gZnVuY3Rpb24ocHJvbWlzZSkge1xuICAgIHJldHVybiBwcm9taXNlLnRoZW4oZnVuY3Rpb24ocnMpIHtcbiAgICAgIGlmIChycy5oYXNOZXh0KSB7XG4gICAgICAgIHJldHVybiBsb2FkQWxsKHJzLm5leHQoKSk7XG4gICAgICB9XG4gICAgICBhcHBzID0gcnMucmVzdWx0cztcbiAgICAgIHJldHVybiBhcHBzO1xuICAgIH0pO1xuICB9O1xuXG4gIHZhciBnZXRBcHBzID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKCFhcHBzKSB7XG4gICAgICByZXR1cm4gbG9hZEFsbChoYnBVdGlsLnBhZ2luYXRlZFJlc3VsdFNldCgkaHR0cC5nZXQodXJsQmFzZSksIHtcbiAgICAgICAgZmFjdG9yeTogQXBwLmZyb21Kc29uXG4gICAgICB9KSk7XG4gICAgfVxuICAgIHJldHVybiAkcS53aGVuKGFwcHMpO1xuICB9O1xuXG4gIHZhciBnZXRCeUlkID0gZnVuY3Rpb24oaWQpIHtcbiAgICBpZiAoIWlkKSB7XG4gICAgICByZXR1cm4gJHEud2hlbihudWxsKTtcbiAgICB9XG4gICAgdmFyIGV4dCA9IGFwcHNDYWNoZS5nZXQoaWQpO1xuICAgIGlmIChleHQpIHtcbiAgICAgIHJldHVybiAkcS53aGVuKGV4dCk7XG4gICAgfVxuICAgIHJldHVybiAkaHR0cC5nZXQodXJsQmFzZSArIGlkICsgJy8nKS50aGVuKGZ1bmN0aW9uKHJlcykge1xuICAgICAgYXBwc0NhY2hlLnB1dChpZCwgQXBwLmZyb21Kc29uKHJlcy5kYXRhKSk7XG4gICAgICByZXR1cm4gYXBwc0NhY2hlLmdldChpZCk7XG4gICAgfSwgZnVuY3Rpb24ocmVzKSB7XG4gICAgICByZXR1cm4gJHEucmVqZWN0KGhicEVycm9yU2VydmljZS5odHRwRXJyb3IocmVzKSk7XG4gICAgfSk7XG4gIH07XG5cbiAgdmFyIGZpbmRPbmUgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuICRodHRwLmdldCh1cmxCYXNlLCB7cGFyYW1zOiBvcHRpb25zfSkudGhlbihmdW5jdGlvbihyZXMpIHtcbiAgICAgIHZhciByZXN1bHRzID0gcmVzLmRhdGEucmVzdWx0cztcbiAgICAgIC8vIFJlamVjdCBpZiBtb3JlIHRoYW4gb25lIHJlc3VsdHNcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgcmV0dXJuICRxLnJlamVjdChoYnBFcnJvclNlcnZpY2UuZXJyb3Ioe1xuICAgICAgICAgIHR5cGU6ICdUb29NYW55UmVzdWx0cycsXG4gICAgICAgICAgbWVzc2FnZTogJ011bHRpcGxlIGFwcHMgaGFzIGJlZW4gcmV0cmlldmVkICcgK1xuICAgICAgICAgICAgICAgICAgICd3aGVuIG9ubHkgb25lIHdhcyBleHBlY3RlZC4nLFxuICAgICAgICAgIGRhdGE6IHJlcy5kYXRhXG4gICAgICAgIH0pKTtcbiAgICAgIH1cbiAgICAgIC8vIE51bGwgd2hlbiBubyByZXN1bHRcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIC8vIEJ1aWxkIHRoZSBhcHAgaWYgZXhhY3RseSBvbmUgcmVzdWx0XG4gICAgICB2YXIgYXBwID0gQXBwLmZyb21Kc29uKHJlc3VsdHNbMF0pO1xuICAgICAgYXBwc0NhY2hlLnB1dChhcHAuaWQsIGFwcCk7XG4gICAgICByZXR1cm4gYXBwO1xuICAgIH0sIGhicFV0aWwuZmVycik7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBsaXN0OiBnZXRBcHBzLFxuICAgIGdldEJ5SWQ6IGdldEJ5SWQsXG4gICAgZmluZE9uZTogZmluZE9uZVxuICB9O1xufSk7XG4iLCIvKiBlc2xpbnQgY2FtZWxjYXNlOlsyLCB7cHJvcGVydGllczogXCJuZXZlclwifV0gKi9cbid1c2Ugc3RyaWN0JztcblxuYW5ndWxhci5tb2R1bGUoJ2hicENvbGxhYm9yYXRvcnlOYXZTdG9yZScsIFsnaGJwQ29tbW9uJywgJ3V1aWQ0J10pXG4uc2VydmljZSgnaGJwQ29sbGFib3JhdG9yeU5hdlN0b3JlJywgZnVuY3Rpb24oJHEsICRodHRwLCAkbG9nLFxuICAgICRjYWNoZUZhY3RvcnksICR0aW1lb3V0LCBvcmRlckJ5RmlsdGVyLCB1dWlkNCxcbiAgICBoYnBVdGlsLCBiYnBDb25maWcpIHtcbiAgdmFyIGNvbGxhYkFwaVVybCA9IGJicENvbmZpZy5nZXQoJ2FwaS5jb2xsYWIudjAnKSArICcvY29sbGFiLyc7XG4gIC8vIGEgY2FjaGUgd2l0aCBpbmRpdmlkdWFsIG5hdiBpdGVtc1xuICB2YXIgY2FjaGVOYXZJdGVtcyA9ICRjYWNoZUZhY3RvcnkoJ25hdkl0ZW0nKTtcblxuICAvLyBhIGNhY2hlIHdpdGggdGhlIHByb21pc2VzIG9mIGVhY2ggY29sbGFiJ3MgbmF2IHRyZWUgcm9vdFxuICB2YXIgY2FjaGVOYXZSb290cyA9ICRjYWNoZUZhY3RvcnkoJ25hdlJvb3QnKTtcblxuICB2YXIgTmF2SXRlbSA9IGZ1bmN0aW9uKGF0dHIpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgYW5ndWxhci5mb3JFYWNoKGF0dHIsIGZ1bmN0aW9uKHYsIGspIHtcbiAgICAgIHNlbGZba10gPSB2O1xuICAgIH0pO1xuICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHRoaXMuY29udGV4dCkpIHtcbiAgICAgIHRoaXMuY29udGV4dCA9IHV1aWQ0LmdlbmVyYXRlKCk7XG4gICAgfVxuICAgIGlmIChhbmd1bGFyLmlzVW5kZWZpbmVkKHRoaXMuY2hpbGRyZW4pKSB7XG4gICAgICB0aGlzLmNoaWxkcmVuID0gW107XG4gICAgfVxuICB9O1xuICBOYXZJdGVtLnByb3RvdHlwZSA9IHtcbiAgICB0b0pzb246IGZ1bmN0aW9uKCkge1xuICAgICAgLyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiB0aGlzLmlkLFxuICAgICAgICBhcHBfaWQ6IHRoaXMuYXBwSWQsXG4gICAgICAgIGNvbGxhYjogdGhpcy5jb2xsYWJJZCxcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxuICAgICAgICBjb250ZXh0OiB0aGlzLmNvbnRleHQsXG4gICAgICAgIG9yZGVyX2luZGV4OiB0aGlzLm9yZGVyLFxuICAgICAgICB0eXBlOiB0aGlzLnR5cGUgfHwgKHRoaXMuZm9sZGVyID8gJ0ZPJyA6ICdJVCcpLFxuICAgICAgICBwYXJlbnQ6IHRoaXMucGFyZW50SWRcbiAgICAgIH07XG4gICAgfSxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgICBhbmd1bGFyLmZvckVhY2goW1xuICAgICAgICAnaWQnLCAnbmFtZScsICdjaGlsZHJlbicsICdjb250ZXh0JyxcbiAgICAgICAgJ2NvbGxhYklkJywgJ2FwcElkJywgJ29yZGVyJywgJ2ZvbGRlcicsXG4gICAgICAgICdwYXJlbnRJZCcsICd0eXBlJ1xuICAgICAgXSwgZnVuY3Rpb24oYSkge1xuICAgICAgICBpZiAoYW5ndWxhci5pc0RlZmluZWQoYXR0cnNbYV0pKSB7XG4gICAgICAgICAgdGhpc1thXSA9IGF0dHJzW2FdO1xuICAgICAgICB9XG4gICAgICB9LCB0aGlzKTtcblxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcbiAgICBlbnN1cmVDYWNoZWQ6IGZ1bmN0aW9uKCkge1xuICAgICAgY2FjaGVOYXZJdGVtcy5wdXQoa2V5KHRoaXMuY29sbGFiSWQsIHRoaXMuaWQpLCB0aGlzKTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgfTtcbiAgLyoqXG4gICAqIE1hbmFnZSBgYWNjYCBhY2N1bXVsYXRvciB3aXRoIGFsbCB0aGUgZGF0YSBmcm9tIGpzb25BcnJheSBhbmQgcmV0dXJuIGl0LlxuICAgKlxuICAgKiBAcGFyYW0gIHtpbnR9IGNvbGxhYklkICB0aGUgY29sbGFiIElEXG4gICAqIEBwYXJhbSAge2FycmF5fSBqc29uQXJyYXkgZGVzY3JpcHRpb24gb2YgdGhlIGNoaWxkcmVuXG4gICAqIEBwYXJhbSAge0FycmF5fSBhY2MgICAgICAgdGhlIGFjY3VtdWxhdG9yXG4gICAqIEByZXR1cm4ge0FycmF5fSAgICAgICAgICAgdGhlIGNoaWxkcmVuXG4gICAqL1xuICBmdW5jdGlvbiBjaGlsZHJlbkZyb21Kc29uKGNvbGxhYklkLCBqc29uQXJyYXksIGFjYykge1xuICAgIGFjYyA9IGFjYyB8fCBbXTtcbiAgICAvLyBhbiB1bmRlZmluZWQgYXJyYXkgbWVhbnMgd2UgYWJvcnQgdGhlIHByb2Nlc3NcbiAgICAvLyB3aGVyZSBhbiBlbXB0eSBhcnJheSB3aWxsIGVuc3VyZSB0aGUgcmVzdWx0aW5nIGFycmF5XG4gICAgLy8gaXMgZW1wdHkgYXMgd2VsbC5cbiAgICBpZiAoYW5ndWxhci5pc1VuZGVmaW5lZChqc29uQXJyYXkpKSB7XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH1cblxuICAgIGFjYy5sZW5ndGggPSAwO1xuICAgIGFuZ3VsYXIuZm9yRWFjaChqc29uQXJyYXksIGZ1bmN0aW9uKGpzb24pIHtcbiAgICAgIGFjYy5wdXNoKE5hdkl0ZW0uZnJvbUpzb24oY29sbGFiSWQsIGpzb24pKTtcbiAgICB9KTtcbiAgICByZXR1cm4gYWNjO1xuICB9XG4gIE5hdkl0ZW0uZnJvbUpzb24gPSBmdW5jdGlvbihjb2xsYWJJZCwganNvbikge1xuICAgIC8qIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgdmFyIGF0dHJzID0ge1xuICAgICAgaWQ6IGpzb24uaWQsXG4gICAgICBhcHBJZDoganNvbi5hcHBfaWQsXG4gICAgICBjb2xsYWJJZDogY29sbGFiSWQsXG4gICAgICBuYW1lOiBqc29uLm5hbWUsXG4gICAgICBjb250ZXh0OiBqc29uLmNvbnRleHQsXG4gICAgICBvcmRlcjoganNvbi5vcmRlcl9pbmRleCxcbiAgICAgIGZvbGRlcjoganNvbi50eXBlID09PSAnRk8nLFxuICAgICAgdHlwZToganNvbi50eXBlLFxuICAgICAgcGFyZW50SWQ6IGpzb24ucGFyZW50LFxuICAgICAgY2hpbGRyZW46IGNoaWxkcmVuRnJvbUpzb24oY29sbGFiSWQsIGpzb24uY2hpbGRyZW4pXG4gICAgfTtcbiAgICB2YXIgayA9IGtleShjb2xsYWJJZCwgYXR0cnMuaWQpO1xuICAgIHZhciBjYWNoZWQgPSBjYWNoZU5hdkl0ZW1zLmdldChrKTtcbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICByZXR1cm4gY2FjaGVkLnVwZGF0ZShhdHRycyk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgTmF2SXRlbShhdHRycykuZW5zdXJlQ2FjaGVkKCk7XG4gIH07XG5cbiAgdmFyIGdldFJvb3QgPSBmdW5jdGlvbihjb2xsYWJJZCkge1xuICAgIHZhciB0cmVlUHJvbWlzZSA9IGNhY2hlTmF2Um9vdHMuZ2V0KGNvbGxhYklkKTtcblxuICAgIGlmICghdHJlZVByb21pc2UpIHtcbiAgICAgIHRyZWVQcm9taXNlID0gJGh0dHAuZ2V0KGNvbGxhYkFwaVVybCArIGNvbGxhYklkICsgJy9uYXYvYWxsLycpLnRoZW4oXG4gICAgICAgIGZ1bmN0aW9uKHJlc3ApIHtcbiAgICAgICAgICB2YXIgcm9vdDtcbiAgICAgICAgICB2YXIgaTtcbiAgICAgICAgICB2YXIgaXRlbTtcbiAgICAgICAgICB2YXIgZGF0YSA9IG9yZGVyQnlGaWx0ZXIocmVzcC5kYXRhLCAnK29yZGVyX2luZGV4Jyk7XG5cbiAgICAgICAgICAvLyBmaWxsIGluIHRoZSBjYWNoZVxuICAgICAgICAgIGZvciAoaSA9IDA7IGkgIT09IGRhdGEubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgICAgIGl0ZW0gPSBOYXZJdGVtLmZyb21Kc29uKGNvbGxhYklkLCBkYXRhW2ldKTtcbiAgICAgICAgICAgIGlmIChpdGVtLmNvbnRleHQgPT09ICdyb290Jykge1xuICAgICAgICAgICAgICByb290ID0gaXRlbTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBsaW5rIGNoaWxkcmVuIGFuZCBwYXJlbnRzXG4gICAgICAgICAgZm9yIChpID0gMDsgaSAhPT0gZGF0YS5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaXRlbSA9IGNhY2hlTmF2SXRlbXMuZ2V0KGtleShjb2xsYWJJZCwgZGF0YVtpXS5pZCkpO1xuICAgICAgICAgICAgaWYgKGl0ZW0ucGFyZW50SWQpIHtcbiAgICAgICAgICAgICAgdmFyIHBhcmVudCA9IGNhY2hlTmF2SXRlbXMuZ2V0KGtleShjb2xsYWJJZCwgaXRlbS5wYXJlbnRJZCkpO1xuICAgICAgICAgICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChpdGVtKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gcm9vdDtcbiAgICAgICAgfSxcbiAgICAgICAgaGJwVXRpbC5mZXJyXG4gICAgICApO1xuXG4gICAgICBjYWNoZU5hdlJvb3RzLnB1dChjb2xsYWJJZCwgdHJlZVByb21pc2UpO1xuICAgIH1cblxuICAgIHJldHVybiB0cmVlUHJvbWlzZTtcbiAgfTtcblxuICB2YXIgZ2V0ID0gZnVuY3Rpb24oY29sbGFiSWQsIG5vZGVJZCkge1xuICAgIHJldHVybiBnZXRSb290KGNvbGxhYklkKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGsgPSBrZXkoY29sbGFiSWQsIG5vZGVJZCk7XG4gICAgICB2YXIgaXRlbSA9IGNhY2hlTmF2SXRlbXMuZ2V0KGspO1xuXG4gICAgICBpZiAoIWl0ZW0pIHtcbiAgICAgICAgJGxvZy5lcnJvcigndW5rbm93biBuYXYgaXRlbScsIGspO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXRlbTtcbiAgICB9KTtcbiAgfTtcblxuICB2YXIgYWRkTm9kZSA9IGZ1bmN0aW9uKGNvbGxhYklkLCBuYXZJdGVtKSB7XG4gICAgcmV0dXJuICRodHRwLnBvc3QoY29sbGFiQXBpVXJsICsgY29sbGFiSWQgKyAnL25hdi8nLCBuYXZJdGVtLnRvSnNvbigpKVxuICAgIC50aGVuKGZ1bmN0aW9uKHJlc3ApIHtcbiAgICAgIHJldHVybiBOYXZJdGVtLmZyb21Kc29uKGNvbGxhYklkLCByZXNwLmRhdGEpO1xuICAgIH0sIGhicFV0aWwuZmVycik7XG4gIH07XG5cbiAgdmFyIGRlbGV0ZU5vZGUgPSBmdW5jdGlvbihjb2xsYWJJZCwgbmF2SXRlbSkge1xuICAgIHJldHVybiAkaHR0cC5kZWxldGUoY29sbGFiQXBpVXJsICsgY29sbGFiSWQgKyAnL25hdi8nICsgbmF2SXRlbS5pZCArICcvJylcbiAgICAudGhlbihmdW5jdGlvbigpIHtcbiAgICAgIGNhY2hlTmF2SXRlbXMucmVtb3ZlKGtleShjb2xsYWJJZCwgbmF2SXRlbS5pZCkpO1xuICAgIH0sIGhicFV0aWwuZmVycik7XG4gIH07XG5cbiAgdmFyIHVwZGF0ZSA9IGZ1bmN0aW9uKGNvbGxhYklkLCBuYXZJdGVtKSB7XG4gICAgbmF2SXRlbS5jb2xsYWJJZCA9IGNvbGxhYklkO1xuICAgIHJldHVybiAkaHR0cC5wdXQoY29sbGFiQXBpVXJsICsgY29sbGFiSWQgKyAnL25hdi8nICtcbiAgICAgIG5hdkl0ZW0uaWQgKyAnLycsIG5hdkl0ZW0udG9Kc29uKCkpXG4gICAgLnRoZW4oZnVuY3Rpb24ocmVzcCkge1xuICAgICAgcmV0dXJuIE5hdkl0ZW0uZnJvbUpzb24oY29sbGFiSWQsIHJlc3AuZGF0YSk7XG4gICAgfSwgaGJwVXRpbC5mZXJyKTtcbiAgfTtcblxuICAvLyBvcmRlcmluZyBvcGVyYXRpb24gbmVlZHMgdG8gYmUgZ2xvYmFsbHkgcXVldWVkIHRvIGVuc3VyZSBjb25zaXN0ZW5jeS5cbiAgdmFyIGluc2VydFF1ZXVlID0gJHEud2hlbigpO1xuXG4gIC8qKlxuICAgKiBJbnNlcnQgbm9kZSBpbiB0aGUgdGhyZWUuXG4gICAqXG4gICAqIEBwYXJhbSAge2ludH0gY29sbGFiSWQgICBpZCBvZiB0aGUgY29sbGFiXG4gICAqIEBwYXJhbSAge05hdkl0ZW19IG5hdkl0ZW0gICAgTmF2IGl0ZW0gaW5zdGFuY2VcbiAgICogQHBhcmFtICB7TmF2SXRlbX0gcGFyZW50SXRlbSBwYXJlbnQgaXRlbVxuICAgKiBAcGFyYW0gIHtpbnR9IGluc2VydEF0ICAgYWRkIHRvIHRoZSBtZW51XG4gICAqIEByZXR1cm4ge1Byb21pc2V9ICAgICAgICBhIHByb21pc2UgdGhhdCB3aWxsXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhlIHVwZGF0ZSBuYXYgaXRlbVxuICAgKi9cbiAgZnVuY3Rpb24gaW5zZXJ0Tm9kZShjb2xsYWJJZCwgbmF2SXRlbSwgcGFyZW50SXRlbSwgaW5zZXJ0QXQpIHtcbiAgICByZXR1cm4gaW5zZXJ0UXVldWUudGhlbihmdW5jdGlvbigpIHtcbiAgICAgIG5hdkl0ZW0ub3JkZXIgPSBpbnNlcnRBdCArIDE7IC8vIGZpcnN0IGl0ZW0gb3JkZXJfaW5kZXggbXVzdCBiZSAxXG4gICAgICBuYXZJdGVtLnBhcmVudElkID0gcGFyZW50SXRlbS5pZDtcbiAgICAgIHJldHVybiB1cGRhdGUoY29sbGFiSWQsIG5hdkl0ZW0pO1xuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybiBhIHVuaXF1ZSBrZXkgZm9yIGNoYWNoaW5nIGEgbmF2IGl0ZW0uXG4gICAqIEBwYXJhbSAge2ludH0gY29sbGFiSWQgY29sbGFiIElEXG4gICAqIEBwYXJhbSAge2ludH0gbm9kZUlkICAgTmF2SXRlbSBJRFxuICAgKiBAcmV0dXJuIHtzdHJpbmd9ICAgICAgIHRoZSB1bmlxdWUga2V5XG4gICAqL1xuICBmdW5jdGlvbiBrZXkoY29sbGFiSWQsIG5vZGVJZCkge1xuICAgIHJldHVybiBjb2xsYWJJZCArICctLScgKyBub2RlSWQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIE5hdkl0ZW06IE5hdkl0ZW0sXG4gICAgZ2V0Um9vdDogZ2V0Um9vdCxcbiAgICBnZXROb2RlOiBnZXQsXG4gICAgYWRkTm9kZTogYWRkTm9kZSxcbiAgICBzYXZlTm9kZTogdXBkYXRlLFxuICAgIGRlbGV0ZU5vZGU6IGRlbGV0ZU5vZGUsXG4gICAgaW5zZXJ0Tm9kZTogaW5zZXJ0Tm9kZVxuICB9O1xufSk7XG4iLCIvKiBlc2xpbnQgY2FtZWxjYXNlOiAwICovXG4vKipcbiAqIEBuYW1lc3BhY2UgaGJwQ29sbGFib3JhdG9yeVN0b3JhZ2VcbiAqIEBtZW1iZXJvZiBoYnBDb2xsYWJvcmF0b3J5XG4gKiBAZGVzY1xuICogc3RvcmFnZVV0aWwgcHJvdmlkZXMgdXRpbGl0eSBmdW5jdGlvbnMgdG8gZWFzZSB0aGUgaW50ZXJhY3Rpb24gb2YgYXBwcyB3aXRoIHN0b3JhZ2UuXG4gKi9cbmFuZ3VsYXIubW9kdWxlKCdoYnBDb2xsYWJvcmF0b3J5U3RvcmFnZScsIFsnaGJwQ29tbW9uJ10pXG4uZmFjdG9yeSgnaGJwQ29sbGFib3JhdG9yeVN0b3JhZ2UnLFxuICBmdW5jdGlvbiBoYnBDb2xsYWJvcmF0b3J5U3RvcmFnZShoYnBVdGlsLCBoYnBFbnRpdHlTdG9yZSwgaGJwRXJyb3JTZXJ2aWNlKSB7XG4gICAgLyoqXG4gICAgICogUmV0cmlldmUgdGhlIGtleSB0byBsb29rdXAgZm9yIG9uIGVudGl0aWVzIGdpdmVuIHRoZSBjdHhcbiAgICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5U3RvcmFnZVxuICAgICAqIEBwYXJhbSAge3N0cmluZ30gY3R4IGFwcGxpY2F0aW9uIGNvbnRleHQgVVVJRFxuICAgICAqIEByZXR1cm4ge3N0cmluZ30gICAgIG5hbWUgb2YgdGhlIGVudGl0eSBhdHRyaWJ1dGUgdGhhdCBzaG91bGQgYmUgdXNlZFxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgZnVuY3Rpb24gbWV0YWRhdGFLZXkoY3R4KSB7XG4gICAgICByZXR1cm4gJ2N0eF8nICsgY3R4O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBuYW1lIHNldENvbnRleHRNZXRhZGF0YVxuICAgICAqIEBtZW1iZXJvZiBoYnBDb2xsYWJvcmF0b3J5LmhicENvbGxhYm9yYXRvcnlTdG9yYWdlXG4gICAgICogQGRlc2NcbiAgICAgKiB0aGUgZnVuY3Rpb24gbGlua3MgdGhlIGNvbnRleHRJZCB3aXRoIHRoZSBkb2MgYnJvd3NlciBlbnRpdHkgaW4gaW5wdXRcbiAgICAgKiBieSBzZXR0aW5nIGEgc3BlY2lmaWMgbWV0YWRhdGEgb24gdGhlIGVudGl0eS5cbiAgICAgKlxuICAgICAqIEVudGl0eSBvYmplY3QgaW4gaW5wdXQgbXVzdCBjb250YWluIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllczpcbiAgICAgKiAtIF9lbnRpdHlUeXBlXG4gICAgICogLSBfdXVpZFxuICAgICAqXG4gICAgICogSW4gY2FzZSBvZiBlcnJvciwgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQgd2l0aCBhIGBIYnBFcnJvcmAgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gIHtPYmplY3R9IGVudGl0eSBkb2MgYnJvd3NlciBlbnRpdHlcbiAgICAgKiBAcGFyYW0gIHtTdHJpbmd9IGNvbnRleHRJZCBjb2xsYWIgYXBwIGNvbnRleHQgaWRcbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlfSBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGVkXG4gICAgICovXG4gICAgZnVuY3Rpb24gc2V0Q29udGV4dE1ldGFkYXRhKGVudGl0eSwgY29udGV4dElkKSB7XG4gICAgICB2YXIgbmV3TWV0YWRhdGEgPSB7fTtcbiAgICAgIG5ld01ldGFkYXRhW21ldGFkYXRhS2V5KGNvbnRleHRJZCldID0gMTtcblxuICAgICAgcmV0dXJuIGhicEVudGl0eVN0b3JlLmFkZE1ldGFkYXRhKGVudGl0eSwgbmV3TWV0YWRhdGEpXG4gICAgICAuY2F0Y2goaGJwRXJyb3JTZXJ2aWNlLmVycm9yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbmFtZSBnZXRFbnRpdHlCeUNvbnRleHRcbiAgICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5U3RvcmFnZVxuICAgICAqIEBkZXNjXG4gICAgICogdGhlIGZ1bmN0aW9uIGdldHMgdGhlIGVudGl0eSBsaW5rZWQgdG8gdGhlIGNvbnRleHRJZCBpbiBpbnB1dC5cbiAgICAgKlxuICAgICAqIEluIGNhc2Ugb2YgZXJyb3IsIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIHdpdGggYSBgSGJwRXJyb3JgIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHBhcmFtICB7U3RyaW5nfSBjb250ZXh0SWQgY29sbGFiIGFwcCBjb250ZXh0IGlkXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlZFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIGdldEVudGl0eUJ5Q29udGV4dChjb250ZXh0SWQpIHtcbiAgICAgIHZhciBxdWVyeVBhcmFtcyA9IHt9O1xuICAgICAgcXVlcnlQYXJhbXNbbWV0YWRhdGFLZXkoY29udGV4dElkKV0gPSAxO1xuXG4gICAgICByZXR1cm4gaGJwRW50aXR5U3RvcmUucXVlcnkocXVlcnlQYXJhbXMpLnRoZW4obnVsbCwgaGJwVXRpbC5mZXJyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbmFtZSBkZWxldGVDb250ZXh0TWV0YWRhdGFcbiAgICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5U3RvcmFnZVxuICAgICAqIEBkZXNjXG4gICAgICogdGhlIGZ1bmN0aW9uIHVubGluayB0aGUgY29udGV4dElkIGZyb20gdGhlIGVudGl0eSBpbiBpbnB1dFxuICAgICAqIGJ5IGRlbGV0aW5nIHRoZSBjb250ZXh0IG1ldGFkYXRhLlxuICAgICAqXG4gICAgICogRW50aXR5IG9iamVjdCBpbiBpbnB1dCBtdXN0IGNvbnRhaW4gdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgICAqIC0gX2VudGl0eVR5cGVcbiAgICAgKiAtIF91dWlkXG4gICAgICpcbiAgICAgKiBJbiBjYXNlIG9mIGVycm9yLCB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCB3aXRoIGEgYEhicEVycm9yYCBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSAge09iamVjdH0gZW50aXR5IGRvYyBicm93c2VyIGVudGl0eVxuICAgICAqIEBwYXJhbSAge1N0cmluZ30gY29udGV4dElkIGNvbGxhYiBhcHAgY29udGV4dCBpZFxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlIG9wZXJhdGlvbiBpcyBjb21wbGV0ZWRcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBkZWxldGVDb250ZXh0TWV0YWRhdGEoZW50aXR5LCBjb250ZXh0SWQpIHtcbiAgICAgIHZhciBrZXkgPSBtZXRhZGF0YUtleShjb250ZXh0SWQpO1xuXG4gICAgICByZXR1cm4gaGJwRW50aXR5U3RvcmUuZGVsZXRlTWV0YWRhdGEoZW50aXR5LCBba2V5XSlcbiAgICAgIC50aGVuKG51bGwsIGhicEVycm9yU2VydmljZS5lcnJvcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG5hbWUgdXBkYXRlQ29udGV4dE1ldGFkYXRhXG4gICAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeVN0b3JhZ2VcbiAgICAgKiBAZGVzY1xuICAgICAqIHRoZSBmdW5jdGlvbiBkZWxldGUgdGhlIGNvbnRleHRJZCBmcm9tIHRoZSBgb2xkRW50aXR5YCBtZXRhZGF0YSBhbmQgYWRkXG4gICAgICogaXQgYXMgYG5ld0VudGl0eWAgbWV0YWRhdGEuXG4gICAgICpcbiAgICAgKiBFbnRpdHkgb2JqZWN0cyBpbiBpbnB1dCBtdXN0IGNvbnRhaW4gdGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzOlxuICAgICAqIC0gX2VudGl0eVR5cGVcbiAgICAgKiAtIF91dWlkXG4gICAgICpcbiAgICAgKiBJbiBjYXNlIG9mIGVycm9yLCB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCB3aXRoIGEgYEhicEVycm9yYCBpbnN0YW5jZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSAge09iamVjdH0gbmV3RW50aXR5IGRvYyBicm93c2VyIGVudGl0eSB0byBsaW5rIHRvIHRoZSBjb250ZXh0XG4gICAgICogQHBhcmFtICB7T2JqZWN0fSBvbGRFbnRpdHkgZG9jIGJyb3dzZXIgZW50aXR5IHRvIHVubGluayBmcm9tIHRoZSBjb250ZXh0XG4gICAgICogQHBhcmFtICB7U3RyaW5nfSBjb250ZXh0SWQgY29sbGFiIGFwcCBjb250ZXh0IGlkXG4gICAgICogQHJldHVybiB7UHJvbWlzZX0gYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlZFxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHVwZGF0ZUNvbnRleHRNZXRhZGF0YShuZXdFbnRpdHksIG9sZEVudGl0eSwgY29udGV4dElkKSB7XG4gICAgICByZXR1cm4gZGVsZXRlQ29udGV4dE1ldGFkYXRhKG9sZEVudGl0eSwgY29udGV4dElkKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gc2V0Q29udGV4dE1ldGFkYXRhKG5ld0VudGl0eSwgY29udGV4dElkKTtcbiAgICAgIH0pLmNhdGNoKGhicEVycm9yU2VydmljZS5lcnJvcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG5hbWUgZ2V0UHJvamVjdEJ5Q29sbGFiXG4gICAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeVN0b3JhZ2VcbiAgICAgKiBAZGVzY1xuICAgICAqIHRoZSBmdW5jdGlvbiByZXR1cm5zIHRoZSBzdG9yYWdlIHByb2plY3Qgb2YgdGhlIGNvbGxhYklkIGluIGlucHV0LlxuICAgICAqXG4gICAgICogSW4gY2FzZSBvZiBlcnJvciwgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQgd2l0aCBhIGBIYnBFcnJvcmAgaW5zdGFuY2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0gIHtTdHJpbmd9IGNvbGxhYklkIGNvbGxhYiBpZFxuICAgICAqIEByZXR1cm4ge1Byb21pc2V9IGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBwcm9qZWN0IGRldGFpbHNcbiAgICAgKi9cbiAgICBmdW5jdGlvbiBnZXRQcm9qZWN0QnlDb2xsYWIoY29sbGFiSWQpIHtcbiAgICAgIHZhciBxdWVyeVBhcmFtcyA9IHtcbiAgICAgICAgbWFuYWdlZF9ieV9jb2xsYWI6IGNvbGxhYklkXG4gICAgICB9O1xuICAgICAgcmV0dXJuIGhicEVudGl0eVN0b3JlLnF1ZXJ5KHF1ZXJ5UGFyYW1zKS50aGVuKG51bGwsIGhicFV0aWwuZmVycik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNldENvbnRleHRNZXRhZGF0YTogc2V0Q29udGV4dE1ldGFkYXRhLFxuICAgICAgZ2V0RW50aXR5QnlDb250ZXh0OiBnZXRFbnRpdHlCeUNvbnRleHQsXG4gICAgICBkZWxldGVDb250ZXh0TWV0YWRhdGE6IGRlbGV0ZUNvbnRleHRNZXRhZGF0YSxcbiAgICAgIHVwZGF0ZUNvbnRleHRNZXRhZGF0YTogdXBkYXRlQ29udGV4dE1ldGFkYXRhLFxuICAgICAgZ2V0UHJvamVjdEJ5Q29sbGFiOiBnZXRQcm9qZWN0QnlDb2xsYWJcbiAgICB9O1xuICB9KTtcbiIsImFuZ3VsYXIubW9kdWxlKCdoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yJylcbi5ydW4oZnVuY3Rpb24gY3JlYXRlQ29sbGFiU2VydmljZShcbiAgJGxvZywgJHEsIGhicENvbGxhYlN0b3JlLFxuICBoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yXG4pIHtcbiAgaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvci5yZWdpc3RlckhhbmRsZXIoJ2NvbGxhYicsIGNyZWF0ZUNvbGxhYik7XG5cbiAgLyoqXG4gICAqIEBmdW5jdGlvbiBjcmVhdGVDb2xsYWJcbiAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvci5UYXNrc1xuICAgKiBAZGVzY1xuICAgKiAgQ3JlYXRlIGEgY29sbGFiIGRlZmluZWQgYnkgdGhlIGdpdmVuIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBkZXNjcmlwdG9yIC0gUGFyYW1ldGVycyB0byBjcmVhdGUgdGhlIGNvbGxhYlxuICAgKiBAcGFyYW0ge3N0cmluZ30gZGVzY3JpcHRvci5uYW1lIC0gTmFtZSBvZiB0aGUgY29sbGFiXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBkZXNjcmlwdG9yLmRlc2NyaXB0aW9uIC0gRGVzY3JpcHRpb24gaW4gbGVzcyB0aGFuIDE0MCBjaGFyYWN0ZXJzXG4gICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2YgdGhlIGNvbGxhYlxuICAgKiBAcGFyYW0ge3N0cmluZ30gW2Rlc2NyaXB0b3IucHJpdmFjeV0gLSAncHJpdmF0ZScgb3IgJ3B1YmxpYycuIE5vdGVzIHRoYXQgb25seVxuICAgKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSEJQIE1lbWJlcnMgY2FuIGNyZWF0ZSBwcml2YXRlIGNvbGxhYlxuICAgKiBAcGFyYW0ge0FycmF5fSBbYWZ0ZXJdIC0gZGVzY3JpcHRvciBvZiBzdWJ0YXNrc1xuICAgKiBAcmV0dXJuIHtQcm9taXNlfSAtIHByb21pc2Ugb2YgYSBjb2xsYWJcbiAgICovXG4gIGZ1bmN0aW9uIGNyZWF0ZUNvbGxhYihkZXNjcmlwdG9yKSB7XG4gICAgdmFyIGF0dHIgPSBoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yLmV4dHJhY3RBdHRyaWJ1dGVzKFxuICAgICAgZGVzY3JpcHRvcixcbiAgICAgIFsndGl0bGUnLCAnY29udGVudCcsICdwcml2YXRlJ11cbiAgICApO1xuICAgICRsb2cuZGVidWcoJ0NyZWF0ZSBjb2xsYWInLCBkZXNjcmlwdG9yKTtcbiAgICByZXR1cm4gaGJwQ29sbGFiU3RvcmUuY3JlYXRlKGF0dHIpO1xuICB9XG59KTtcbiIsImFuZ3VsYXIubW9kdWxlKCdoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yJylcbi5ydW4oZnVuY3Rpb24gY3JlYXRlTmF2SXRlbShcbiAgJGxvZyxcbiAgaGJwQ29sbGFib3JhdG9yeUFwcFN0b3JlLFxuICBoYnBDb2xsYWJvcmF0b3J5TmF2U3RvcmUsXG4gIGhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3IsXG4gIGhicENvbGxhYm9yYXRvcnlTdG9yYWdlLFxuICBoYnBFbnRpdHlTdG9yZVxuKSB7XG4gIGhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3IucmVnaXN0ZXJIYW5kbGVyKCduYXYnLCBjcmVhdGVOYXZJdGVtKTtcblxuICAvKipcbiAgICogQ3JlYXRlIGEgbmV3IG5hdiBpdGVtLlxuICAgKiBAbWVtYmVyb2YgaGJwQ29sbGFib3JhdG9yeS5oYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yLlRhc2tzXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBkZXNjcmlwdG9yIGEgZGVzY3JpcHRvciBkZXNjcmlwdGlvblxuICAgKiBAcGFyYW0ge3N0cmluZ30gZGVzY3JpcHRvci5uYW1lIG5hbWUgb2YgdGhlIG5hdiBpdGVtXG4gICAqIEBwYXJhbSB7Q29sbGFifSBkZXNjcmlwdG9yLmNvbGxhYklkIGNvbGxhYiBpbiB3aGljaCB0byBhZGQgdGhlIGl0ZW0gaW4uXG4gICAqIEBwYXJhbSB7c3RyaW5nfSBkZXNjcmlwdG9yLmFwcCBhcHAgbmFtZSBsaW5rZWQgdG8gdGhlIG5hdiBpdGVtXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBbY29udGV4dF0gdGhlIGN1cnJlbnQgcnVuIGNvbnRleHRcbiAgICogQHBhcmFtIHtvYmplY3R9IFtjb250ZXh0LmNvbGxhYl0gYSBjb2xsYWIgaW5zdGFuY2UgY3JlYXRlZCBwcmV2aW91c2x5XG4gICAqIEByZXR1cm4ge1Byb21pc2V9IHByb21pc2Ugb2YgYSBOYXZJdGVtIGluc3RhbmNlXG4gICAqL1xuICBmdW5jdGlvbiBjcmVhdGVOYXZJdGVtKGRlc2NyaXB0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgY29sbGFiSWQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoZGVzY3JpcHRvciAmJiBkZXNjcmlwdG9yLmNvbGxhYikgfHxcbiAgICAgICAgKGNvbnRleHQgJiYgY29udGV4dC5jb2xsYWIuaWQpO1xuICAgIH07XG4gICAgdmFyIGZpbmRBcHAgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBoYnBDb2xsYWJvcmF0b3J5QXBwU3RvcmUuZmluZE9uZSh7dGl0bGU6IGRlc2NyaXB0b3IuYXBwfSk7XG4gICAgfTtcbiAgICB2YXIgY3JlYXRlTmF2ID0gZnVuY3Rpb24oYXBwKSB7XG4gICAgICByZXR1cm4gaGJwQ29sbGFib3JhdG9yeU5hdlN0b3JlLmdldFJvb3QoY29sbGFiSWQoKSlcbiAgICAgIC50aGVuKGZ1bmN0aW9uKHBhcmVudEl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGhicENvbGxhYm9yYXRvcnlOYXZTdG9yZS5hZGROb2RlKGNvbGxhYklkKCksXG4gICAgICAgICAgbmV3IGhicENvbGxhYm9yYXRvcnlOYXZTdG9yZS5OYXZJdGVtKHtcbiAgICAgICAgICAgIGNvbGxhYjogY29sbGFiSWQoKSxcbiAgICAgICAgICAgIG5hbWU6IGRlc2NyaXB0b3IubmFtZSxcbiAgICAgICAgICAgIGFwcElkOiBhcHAuaWQsXG4gICAgICAgICAgICBwYXJlbnRJZDogcGFyZW50SXRlbS5pZFxuICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9O1xuICAgIHZhciBsaW5rVG9TdG9yYWdlID0gZnVuY3Rpb24obmF2KSB7XG4gICAgICBpZiAoIWRlc2NyaXB0b3IuZW50aXR5KSB7XG4gICAgICAgIHJldHVybiBuYXY7XG4gICAgICB9XG4gICAgICB2YXIgc2V0TGluayA9IGZ1bmN0aW9uKGVudGl0eSkge1xuICAgICAgICByZXR1cm4gaGJwQ29sbGFib3JhdG9yeVN0b3JhZ2Uuc2V0Q29udGV4dE1ldGFkYXRhKGVudGl0eSwgbmF2LmNvbnRleHQpXG4gICAgICAgIC50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgIHJldHVybiBuYXY7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIC8vIEl0IG1pZ2h0IGJlIHRoZSBuYW1lIHVzZWQgaW4gYSBwcmV2aW91cyBzdG9yYWdlIHRhc2suXG4gICAgICBpZiAoY29udGV4dCAmJiBjb250ZXh0LnN0b3JhZ2UgJiYgY29udGV4dC5zdG9yYWdlW2Rlc2NyaXB0b3IuZW50aXR5XSkge1xuICAgICAgICByZXR1cm4gc2V0TGluayhjb250ZXh0LnN0b3JhZ2VbZGVzY3JpcHRvci5lbnRpdHldKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBoYnBFbnRpdHlTdG9yZS5nZXQoZGVzY3JpcHRvci5lbnRpdHkpLnRoZW4oc2V0TGluayk7XG4gICAgfTtcbiAgICAkbG9nLmRlYnVnKCdDcmVhdGUgbmF2IGl0ZW0nLCBkZXNjcmlwdG9yLCBjb250ZXh0KTtcbiAgICByZXR1cm4gZmluZEFwcChkZXNjcmlwdG9yLmFwcClcbiAgICAudGhlbihjcmVhdGVOYXYpXG4gICAgLnRoZW4obGlua1RvU3RvcmFnZSk7XG4gIH1cbn0pO1xuIiwiYW5ndWxhci5tb2R1bGUoJ2hicENvbGxhYm9yYXRvcnlBdXRvbWF0b3InKVxuLnJ1bihmdW5jdGlvbiBjcmVhdGVDb2xsYWJTZXJ2aWNlKFxuICAkbG9nLCAkcSwgaGJwRW50aXR5U3RvcmUsXG4gIGhicEVycm9yU2VydmljZSxcbiAgaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvcixcbiAgaGJwQ29sbGFib3JhdG9yeVN0b3JhZ2Vcbikge1xuICBoYnBDb2xsYWJvcmF0b3J5QXV0b21hdG9yLnJlZ2lzdGVySGFuZGxlcignc3RvcmFnZScsIHN0b3JhZ2UpO1xuXG4gIC8qKlxuICAgKiBDb3B5IGZpbGVzIGFuZCBmb2xkZXJzIHRvIHRoZSBkZXN0aW5hdGlvbiBjb2xsYWIgc3RvcmFnZS5cbiAgICpcbiAgICogQG1lbWJlcm9mIGhicENvbGxhYm9yYXRvcnkuaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvci5UYXNrc1xuICAgKiBAcGFyYW0ge29iamVjdH0gZGVzY3JpcHRvciB0aGUgdGFzayBjb25maWd1cmF0aW9uXG4gICAqIEBwYXJhbSB7b2JqZWN0fSBkZXNjcmlwdG9yLnN0b3JhZ2UgYSBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpbGUgcGF0aCBpbiB0aGVcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBjb2xsYWIgYW5kIHZhbHVlIGFyZSB0aGUgVVVJRCBvZiB0aGVcbiAgICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVudGl0eSB0byBjb3B5IGF0IHRoaXMgcGF0aC5cbiAgICogQHBhcmFtIHtvYmplY3R9IFtkZXNjcmlwdG9yLmNvbGxhYl0gaWQgb2YgdGhlIGNvbGxhYlxuICAgKiBAcGFyYW0ge29iamVjdH0gY29udGV4dCB0aGUgY3VycmVudCB0YXNrIGNvbnRleHRcbiAgICogQHBhcmFtIHtvYmplY3R9IFtjb250ZXh0LmNvbGxhYl0gdGhlIGNvbGxhYiBpbiB3aGljaCBlbnRpdGllcyB3aWxsIGJlIGNvcGllZFxuICAgKiBAcmV0dXJuIHtvYmplY3R9IGNyZWF0ZWQgZW50aXRpZXMgd2hlcmUga2V5cyBhcmUgdGhlIHNhbWUgYXMgcHJvdmlkZWQgaW5cbiAgICogICAgICAgICAgICAgICAgICBjb25maWcuc3RvcmFnZVxuICAgKi9cbiAgZnVuY3Rpb24gc3RvcmFnZShkZXNjcmlwdG9yLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIGhicENvbGxhYm9yYXRvcnlBdXRvbWF0b3IuZW5zdXJlUGFyYW1ldGVycyhcbiAgICAgIGRlc2NyaXB0b3IsICdzdG9yYWdlJ1xuICAgICkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBoYnBDb2xsYWJvcmF0b3J5U3RvcmFnZVxuICAgICAgICAuZ2V0UHJvamVjdEJ5Q29sbGFiKGRlc2NyaXB0b3IuY29sbGFiIHx8IGNvbnRleHQuY29sbGFiLmlkKVxuICAgICAgICAudGhlbihmdW5jdGlvbihwcm9qZWN0RW50aXR5KSB7XG4gICAgICAgICAgdmFyIHByb21pc2VzID0ge307XG4gICAgICAgICAgYW5ndWxhci5mb3JFYWNoKGRlc2NyaXB0b3Iuc3RvcmFnZSwgZnVuY3Rpb24odmFsdWUsIG5hbWUpIHtcbiAgICAgICAgICAgIGlmIChhbmd1bGFyLmlzU3RyaW5nKHZhbHVlKSkge1xuICAgICAgICAgICAgICBwcm9taXNlc1tuYW1lXSA9IChcbiAgICAgICAgICAgICAgICBoYnBFbnRpdHlTdG9yZS5jb3B5KHZhbHVlLCBwcm9qZWN0RW50aXR5Ll91dWlkKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAkbG9nLndhcm4oJ0ludmFsaWQgY29uZmlndXJhdGlvbiBmb3Igc3RvcmFnZSB0YXNrJywgZGVzY3JpcHRvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuICRxLmFsbChwcm9taXNlcyk7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59KTtcbiIsIi8qKlxuICogQG5hbWVzcGFjZSBoYnBDb2xsYWJvcmF0b3J5XG4gKiBAZGVzY1xuICogUHJvdmlkZXMgYW5ndWxhciBzZXJ2aWNlcyB0byB3b3JrIHdpdGggSEJQIENvbGxhYm9yYXRvcnkuXG4gKi9cbmFuZ3VsYXIubW9kdWxlKCdoYnBDb2xsYWJvcmF0b3J5JywgW1xuICAnaGJwQ29sbGFib3JhdG9yeUF1dG9tYXRvcicsXG4gICdoYnBDb2xsYWJvcmF0b3J5TmF2U3RvcmUnLFxuICAnaGJwQ29sbGFib3JhdG9yeUFwcFN0b3JlJ1xuXSk7XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
