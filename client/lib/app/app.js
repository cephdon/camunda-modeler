'use strict';

var merge = require('lodash/object/merge'),
    bind = require('lodash/function/bind'),
    assign = require('lodash/object/assign'),
    find = require('lodash/collection/find'),
    filter = require('lodash/collection/filter'),
    map = require('lodash/collection/map'),
    debounce = require('lodash/function/debounce');

var inherits = require('inherits');

var BaseComponent = require('base/component'),
    MenuBar = require('base/components/menu-bar'),
    Tabbed = require('base/components/tabbed'),
    ModalOverlay = require('base/components/modal-overlay');

var MultiButton = require('base/components/buttons/multi-button'),
    Button = require('base/components/buttons/button'),
    Separator = require('base/components/buttons/separator');

var BpmnProvider = require('./tabs/bpmn/provider'),
    DmnProvider = require('./tabs/dmn/provider'),
    CmmnProvider = require('./tabs/cmmn/provider');

var EmptyTab = require('./tabs/empty-tab');

var Footer = require('./footer');

var ensureOpts = require('util/ensure-opts'),
    series = require('util/async/series'),
    isUnsaved = require('util/file/is-unsaved'),
    parseFileType = require('./util/parse-file-type'),
    namespace = require('./util/namespace'),
    dragger = require('util/dom/dragger'),
    copy = require('util/copy'),
    fileDrop = require('./util/dom/file-drop');

var debug = require('debug')('app');

var dragTabs = require('util/dom/drag-tabs');


/**
 * The main application entry point
 */
function App(options) {

  ensureOpts([
    'logger',
    'events',
    'dialog',
    'fileSystem',
    'config',
    'metaData'
  ], options);

  BaseComponent.call(this, options);

  this.layout = {
    propertiesPanel: {
      open: false,
      width: 250
    },
    panesLayout: {
      width: 0,
      type: 'min-width'
    },
    log: {
      open: false,
      height: 150
    }
  };

  this.mainPane = {
    tabs: []
  };

  var EXPORT_BUTTONS = {
    png: {
      id: 'png',
      action: this.compose('triggerAction', 'export-tab', { type: 'png' }),
      label: 'Export as PNG',
      icon: 'icon-picture',
      primary: true
    },
    jpeg: {
      id: 'jpeg',
      action: this.compose('triggerAction', 'export-tab', { type: 'jpeg' }),
      label: 'Export as JPEG'
    },
    svg: {
      id: 'svg',
      action: this.compose('triggerAction', 'export-tab', { type: 'svg' }),
      label: 'Export as SVG'
    }
  };

  this.menuEntries = {
    modeler: {
      visible: true,
      name: 'modeler',
      buttons: [
        MultiButton({
          id: 'create',
          choices: [
            {
              id: 'create-bpmn-diagram',
              action: this.compose('triggerAction', 'create-bpmn-diagram'),
              label: 'Create new BPMN Diagram',
              icon: 'icon-new',
              primary: true
            },
            {
              id: 'create-dmn-table',
              action: this.compose('triggerAction', 'create-dmn-table'),
              label: 'Create new DMN Table'
            },
            {
              id: 'create-dmn-diagram',
              action: this.compose('triggerAction', 'create-dmn-diagram'),
              label: 'Create new DMN Diagram (DRD)'
            },
            {
              id: 'create-cmmn-diagram',
              action: this.compose('triggerAction', 'create-cmmn-diagram'),
              label: 'Create new CMMN Diagram'
            }
          ]
        }),
        Button({
          id: 'open',
          group: 'modeler',
          icon: 'icon-open',
          label: 'Open a Diagram',
          action: this.compose('triggerAction', 'open-diagram')
        }),
        Separator(),
        Button({
          id: 'save',
          group: 'modeler',
          icon: 'icon-save-normal',
          label: 'Save Diagram',
          action: this.compose('triggerAction', 'save')
        }),
        Button({
          id: 'save-as',
          group: 'modeler',
          icon: 'icon-save-as',
          label: 'Save Diagram as...',
          action: this.compose('triggerAction', 'save-as')
        }),
        Separator(),
        Button({
          id: 'undo',
          group: 'modeler',
          icon: 'icon-undo',
          label: 'Undo',
          action: this.compose('triggerAction', 'undo'),
          disabled: true
        }),
        Button({
          id: 'redo',
          group: 'modeler',
          icon: 'icon-redo',
          label: 'Redo',
          action: this.compose('triggerAction', 'redo'),
          disabled: true
        }),
        Separator(),
        MultiButton({
          id: 'export-as',
          group: 'modeler',
          icon: 'icon-picture',
          disabled: true,
          choices: map(EXPORT_BUTTONS, function(btn) {
            return btn;
          })
        }),
        Separator(),
        Button({
          id: 'create-other-pane',
          group: 'modeler',
          label: 'Split Pane View',
          icon: 'icon-size-reset',
          action: this.compose('triggerAction', 'toggle-other-pane'),
        })
      ]
    },
    bpmn: {
      visible: false,
      name: 'bpmn',
      buttons: [
        Separator(),
        Button({
          id: 'align-left',
          icon: 'icon-align-left-tool',
          label: 'Align Elements to the Left',
          action: this.compose('triggerAction', 'alignElements', {
            type: 'left'
          })
        }),
        Button({
          id: 'align-center',
          icon: 'icon-align-horizontal-center-tool',
          label: 'Align Elements to the Center',
          action: this.compose('triggerAction', 'alignElements', {
            type: 'center'
          })
        }),
        Button({
          id: 'align-right',
          icon: 'icon-align-right-tool',
          label: 'Align Elements to the Right',
          action: this.compose('triggerAction', 'alignElements', {
            type: 'right'
          })
        }),
        Button({
          id: 'align-top',
          icon: 'icon-align-top-tool',
          label: 'Align Elements to the Top',
          action: this.compose('triggerAction', 'alignElements', {
            type: 'top'
          })
        }),
        Button({
          id: 'align-middle',
          icon: 'icon-align-vertical-center-tool',
          label: 'Align Elements to the Middle',
          action: this.compose('triggerAction', 'alignElements', {
            type: 'middle'
          })
        }),
        Button({
          id: 'align-bottom',
          icon: 'icon-align-bottom-tool',
          label: 'Align Elements to the Middle',
          action: this.compose('triggerAction', 'alignElements', {
            type: 'bottom'
          })
        }),
        Separator(),
        Button({
          id: 'distribute-horizontally',
          icon: 'icon-distribute-horizontally-tool',
          label: 'Distribute Elements Horizontally',
          action: this.compose('triggerAction', 'distributeHorizontally')
        }),
        Button({
          id: 'distribute-bottom',
          icon: 'icon-distribute-vertically-tool',
          label: 'Distribute Elements Vertically',
          action: this.compose('triggerAction', 'distributeVertically')
        })
      ]
    }
  };

  this.mainPane.tabs = this._initTabs('main');

  this.activeTab = this.mainPane.activeTab = this.mainPane.tabs[0];

  this.fileHistory = [];


  this.events.on('workspace:changed', debounce((done) => {
    this.persistWorkspace((err) => {
      debug('workspace persisted?', err);

      // this is to prevent a race condition when quitting the app
      if (done) {
        done(err);
      }
    });
  }, 100));


  this.events.on('tools:state-changed', (tab, newState) => {

    var button;

    // todo(ricardo): make it less hacky please
    if (!contains(this[this.focusedPane + 'Pane'].tabs, tab)) {
      return this.selectTab(tab);
    }

    if (this.activeTab !== tab) {
      return debug('Warning: state updated on incative tab! This should never happen!');
    }

    // update undo/redo/export based on state
    [ 'undo', 'redo' ].forEach((key) => {
      this.updateMenuEntry('modeler', key, !newState[key]);
    });

    debug('tools:state-changed', newState);

    [ 'bpmn', 'cmmn', 'dmn' ].forEach((key) => {
      if (newState[key] && this.menuEntries[key]) {

        this.menuEntries[key].visible = true;
      } else if (this.menuEntries[key]) {

        this.menuEntries[key].visible = false;
      }
    });

    // update export button state
    button = find(this.menuEntries.modeler.buttons, { id: 'export-as' });

    button.choices = (newState['exportAs'] || []).map((type) => {
      return EXPORT_BUTTONS[type];
    });

    if (button.choices.length) {
      button.disabled = false;
      button.choices[0] = assign({}, button.choices[0], { icon: 'icon-picture', primary: true });
    } else {
      button.disabled = true;
      button.choices[0] = { icon: 'icon-picture', primary: true, label: 'Export as Image' };
    }

    // save and saveAs buttons
    // should work all the time as long as the
    // tab provides a save action
    [ 'save', 'save-as' ].forEach((key) => {
      var enabled = 'save' in newState;

      this.updateMenuEntry('modeler', key, !enabled);
    });

    if (this.otherPane) {
      newState.splitPane = true;
    }

    this.events.emit('changed');
  });

  this.events.on('log:toggle', (options) => {

    var open = options && options.open;

    if (typeof open === 'undefined') {
      open = !(this.layout.log && this.layout.log.open);
    }

    this.events.emit('layout:update', {
      log: {
        open: open
      }
    });
  });

  this.logger.on('changed', this.events.composeEmitter('changed'));

  this.events.on('layout:update', newLayout => {
    this.layout = merge(this.layout, newLayout);

    this.events.emit('changed');
  });

  this.events.on('dialog-overlay:toggle', this.compose('toggleOverlay'));

  ///////// public API yea! //////////////////////////////////////

  /**
   * Listen to an app event
   *
   * @param {String} event
   * @param {Function} callbackFn
   */
  this.on = bind(this.events.on, this.events);

  /**
   * Emit an event via the app
   *
   * @param {String} event
   * @param {Object...} additionalArgs
   */
  this.emit = bind(this.events.emit, this.events);


  // bootstrap support for diagram files

  this.tabProviders = [
    this.createComponent(BpmnProvider, { app: this }),
    this.createComponent(DmnProvider, { app: this }),
    this.createComponent(CmmnProvider, { app: this })
  ];

  // let other components know that the window has been resized
  window.addEventListener('resize', this.events.composeEmitter('window:resized'));
}

inherits(App, BaseComponent);

module.exports = App;


App.prototype.render = function() {
  var otherPane,
      dragTabsOpts = {
        selectors: {
          tabsContainer: '.tabs-container',
          tab: '.tab',
          active: '.active',
          ignore: '.empty'
        }
      },
      propertiesStyle = {
        'min-width': '50%'
      },
      panesLayout = this.layout.panesLayout,
      resizeHandle;

  if (this.otherPane) {
    otherPane = (
      <Tabbed className="other pane"
              tabs={ this.otherPane.tabs }
              active={ this.otherPane.activeTab }
              pane={ 'other' }
              isFocused={ this.focusedPane === 'other' }
              onPositionChanged={ this.compose('dragTab')}
              onSelect={ this.compose('selectTab') }
              onContextMenu={ this.compose('openTabContextMenu') }
              onClose={ this.compose('closeTab') } />
    );

    propertiesStyle = {};

    propertiesStyle[panesLayout.type] = panesLayout.width + 'px';

    resizeHandle = (
      <div className="resize-panes"
           draggable="true"
           onDragStart={ dragger(this.compose('resizePanes', copy(panesLayout))) }></div>
    );
  }

  var html =
    <div className="app"
         onDragover={ fileDrop(this.compose('openFiles')) }
         drag={ dragTabs(dragTabsOpts, this.compose('dragTab')) } >
      <ModalOverlay
        isActive={ this._activeOverlay }
        content={ this._overlayContent }
        events={ this.events } />
      <MenuBar entries={ this.menuEntries } />
      <div className="panes">
        <Tabbed
          className="main pane"
          styles={ propertiesStyle }
          tabs={ this.mainPane.tabs }
          active={ this.mainPane.activeTab }
          pane={ 'main' }
          isFocused={ this.focusedPane === 'main' }
          onSelect={ this.compose('selectTab') }
          onContextMenu={ this.compose('openTabContextMenu') }
          onClose={ this.compose('closeTab') } />
        { resizeHandle ? resizeHandle : undefined }
        { otherPane ? otherPane : undefined }
      </div>
      <Footer
        layout={ this.layout }
        log={ this.logger }
        events={ this.events } />
    </div>;

  return html;
};

App.prototype.resizePanes = function onDrag(panelLayout, event, delta) {
  var oldWidth = panelLayout.width,
      halfPanesWidth = document.querySelector('.panes').scrollWidth / 2;

  var newWidth = Math.max(oldWidth + delta.x, 0);

  if ((newWidth > halfPanesWidth && newWidth < halfPanesWidth + 20) ||
       newWidth < halfPanesWidth && newWidth > halfPanesWidth - 20) {

    newWidth = halfPanesWidth;
  }

  this.emit('layout:update', {
    panesLayout: {
      width: newWidth,
      type: newWidth > halfPanesWidth ? 'min-width' : 'max-width'
    }
  });
};

App.prototype.dragTab = function(context) {
  var dragTab = context.dragTab,
      newIdx = context.newIndex,
      tabContainer = context.tabContainer;

  var pane = tabContainer.belongsToPane;

  var tabs = this.getAllTabs();

  var tab = find(tabs, { id: dragTab.tabId });

  this.shiftTab(tab, pane, newIdx);
};

App.prototype._initTabs = function(pane) {
  return [
    EmptyTab({
      id: 'empty-tab-' + pane,
      label: '+',
      title: 'Create new Diagram',
      action: this.compose('triggerAction', 'create-bpmn-diagram', { pane: pane }),
      closable: false,
      app: this,
      events: this.events,
      pane: pane
    })
  ];
};

App.prototype.toggleOtherPane = function() {
  var tabs, config;

  if (!this.otherPane) {
    tabs = this._initTabs('other');

    this.otherPane = {
      tabs: tabs,
      activeTab: tabs[0]
    };

    config = this.layout.panesLayout;

    this.emit('layout:update', {
      panesLayout: {
        width: config.width !== 0 ? config.width : document.querySelector('.main.pane').scrollWidth,
        type: config.type || 'min-width'
      }
    });

    return;
  }

  // collect other pane tabs
  tabs = this.otherPane.tabs;

  tabs.forEach((tab) => {
    // don't transfer empty tab
    if (tab.id === 'empty-tab-other') {
      return;
    }

    // pass other pane tabs to main pane
    this.mainPane.tabs.splice(this.mainPane.tabs.length - 1, 0, tab);

    this.events.emit('changed');
  });

  // delete other pane
  delete this.otherPane;

  // make sure that the other pane's empty tab is not selected
  if (this.mainPane.tabs.length > 1 && contains(this.mainPane.tabs, this.activeTab)) {
    this.selectTab(this.activeTab);
  } else {
    this.selectTab(this.mainPane.tabs[0]);
  }

  this.emit('changed');
};

App.prototype.openTabContextMenu = function(tab, evt) {
  // do not open a context-menu on the 'empty tab'
  if (tab.empty) {
    return;
  }

  debug('opening context-menu', tab);

  this.emit('context-menu:open', 'tab', { tabId: tab.id });
};

App.prototype.toggleOverlay = function(isOpened) {

  if (typeof isOpened === 'string') {
    this._activeOverlay = true;

    this._overlayContent = isOpened;
  } else {
    this._activeOverlay = isOpened;

    this._overlayContent = null;
  }

  this.events.emit('changed');
};


/**
 * Create new application component with wired globals.
 *
 * @param {Function} Component constructor
 * @param {Object} [options]
 *
 * @return {Object} component instance
 */
App.prototype.createComponent = function(Component, options) {

  var actualOptions = assign(options || {}, {
    events: this.events,
    layout: this.layout,
    logger: this.logger,
    dialog: this.dialog,
    config: this.config
  });

  return new Component(actualOptions);
};


/**
 * Opens bare files descriptors, that have not been yet validated or processed.
 *
 * @param  {Array<FileDescriptor>} files
 */
App.prototype.openFiles = function(files) {

  var dialog = this.dialog;

  series(files, (file, done) => {
    var type = parseFileType(file);

    if (!type) {
      dialog.unrecognizedFileError(file, function(err) {
        debug('open-diagram canceled: unrecognized file type', file);

        return done(err);
      });

    } else {
      if (namespace.hasOldNamespace(file.contents)) {

        dialog.convertNamespace(type, (err, answer) => {
          if (err) {
            debug('open-diagram error: %s', err);

            return done(err);
          }

          if (isCancel(answer)) {
            return done(null);
          }

          if (answer === 'yes') {
            file.contents = namespace.replace(file.contents, type);
          }

          done(null, assign({}, file, { fileType: type }));
        });
      } else {
        done(null, assign({}, file, { fileType: type }));
      }
    }
  }, (err, diagramFiles) => {
    if (err) {
      return debug('open-diagram canceled: %s', err);
    }

    diagramFiles = filter(diagramFiles, (file) => {
      return !!file;
    });

    this.openTabs(diagramFiles);
  });
};


/**
 * Open a new tab based on a file chosen by the user.
 */
App.prototype.openDiagram = function() {

  var dialog = this.dialog;

  dialog.open((err, files) => {
    if (err) {
      return dialog.openError(err, function() {
        debug('open-diagram canceled: %s', err);
      });
    }

    if (!files) {
      return debug('open-diagram canceled: no file');
    }

    this.openFiles(files);
  });
};


App.prototype.triggerAction = function(action, options) {

  debug('trigger-action', action, options);

  var activeTab = this.activeTab;

  if (action === 'select-tab') {
    if (options === 'next') {
      this.selectNext();

    }

    if (options === 'previous') {
      this.selectPrevious();
    }

    return;
  }

  if (action === 'create-bpmn-diagram') {
    return this.createDiagram('bpmn', options);
  }

  if (action === 'create-dmn-diagram') {
    return this.createDiagram('dmn', options);
  }

  if (action === 'create-dmn-table') {
    return this.createDiagram('dmn', assign({ isTable: true }, options || {}));
  }

  if (action === 'create-cmmn-diagram') {
    return this.createDiagram('cmmn', options);
  }

  if (action === 'toggle-other-pane') {
    return this.toggleOtherPane();
  }

  if (action === 'open-diagram') {
    return this.openDiagram();
  }

  if (action === 'save-all') {
    return this.saveAllTabs();
  }

  if (action === 'quit') {
    return this.quit();
  }

  if (action === 'close-all-tabs') {
    return this.closeAllTabs();
  }

  if (action === 'close-tab') {
    return this.closeTab(options.tabId);
  }

  if (action === 'close-other-tabs') {
    return this.closeOtherTabs(options.tabId);
  }

  if (action === 'reopen-last-tab') {
    return this.reopenLastTab();
  }

  if (action === 'show-shortcuts') {
    return this.toggleOverlay('shortcuts');
  }

  // Actions below require active tab
  if (!activeTab) {
    return;
  }

  if (action === 'close-active-tab') {
    if (activeTab.closable) {
      return this.closeTab(this.activeTab);
    }
  }

  // handle special actions
  if (action === 'save' && activeTab.save) {
    return this.saveTab(activeTab);
  }

  if (action === 'save-as' && activeTab.save) {
    return this.saveTab(activeTab, { saveAs: true });
  }

  if (action === 'export-tab' && activeTab.exportAs) {
    return this.exportTab(activeTab, options.type);
  }

  // forward other actions to active tab
  activeTab.triggerAction(action, options);
};


App.prototype.getActivePaneTabs = function() {
  return this.getPaneTabs(this.focusedPane);
};


App.prototype.getAllTabs = function() {

  if (!this.otherPane) {
    return this.mainPane.tabs;
  }

  return this.mainPane.tabs.concat(this.otherPane.tabs);
};


App.prototype.getPaneTabs = function(pane) {

  if (pane) {
    return this[pane + 'Pane'].tabs;
  } else {
    return this.mainPane.tabs;
  }
};


/**
 * Create diagram of the specific type.
 *
 * @param {String} type
 * @return {Tab} created diagram tab
 */
App.prototype.createDiagram = function(type, attrs) {
  var pane = (attrs && attrs.pane) || this.focusedPane;

  var tabProvider = this._findTabProvider(type);

  var file = tabProvider.createNewFile(attrs);

  return this.openTab(file, pane);
};


/**
 * Open tabs for the given files and make sure an appropriate
 * tab is selected and tabs are not opened twice.
 *
 * This method does not do any validation on the file internals
 * and assumes the creation of tabs for given files does not fail
 * (tabs should be robust and handle opening errors internally).
 *
 * @param {Array<FileDescriptor>} files
 * @return {Array<Tab>} return the opened tabs
 */
App.prototype.openTabs = function(files, pane) {

  pane = pane || this.focusedPane;

  if (!Array.isArray(files)) {
    throw new Error('expected Array<FileDescriptor> argument');
  }

  if (!files.length) {
    return;
  }

  var openedTabs = files.map((file) => {

    // make sure we do not double open tabs
    // for the same file
    return this.findTab(file) || this._createTab(file, pane);
  });

  // select the last opened tab
  this.selectTab(openedTabs[openedTabs.length - 1]);

  return openedTabs;
};


/**
 * Open a single tab.
 *
 * @param {FileDescriptor} file
 * @return {Tab} the opened tab
 */
App.prototype.openTab = function(file, pane) {
  return this.openTabs([ file ], pane)[0];
};


/**
 * Create a new tab from the given file and add it
 * to the application.
 *
 * @param {FileDescriptor} file
 */
App.prototype._createTab = function(file, pane) {
  var tabProvider = this._findTabProvider(file.fileType);

  return this._addTab(tabProvider.createTab(file), pane);
};


/**
 * Save all open tabs
 */
App.prototype.saveAllTabs = function() {

  debug('saving all open tabs');

  var activeTab = this.activeTab;

  var tabs = this.getAllTabs();

  series(tabs, (tab, done) => {
    if (!tab.save || !tab.dirty) {
      // skipping tabs that cannot save or are dirty
      return done(null);
    }

    this.saveTab(tab, function(err, savedFile) {

      if (err || !savedFile) {
        return done(err || userCanceled());
      }

      return done(null, savedFile);
    });
  }, (err) => {
    if (err) {
      return debug('save all canceled', err);
    }

    debug('save all finished');

    // restore active tab
    this.selectTab(activeTab);
  });
};


/**
 * Export the given tab with an image type.
 *
 * @param {Tab} tab
 * @param {String} [type]
 * @param {Function} [done]
 */
App.prototype.exportTab = function(tab, type, done) {
  if (!tab) {
    throw new Error('need tab to save');
  }

  if (!tab.save) {
    throw new Error('tab cannot #save');
  }

  done = done || function(err, savedFile) {
    if (err) {
      debug('export error: %s', err);
    } else if (!savedFile) {
      debug('export user canceled');
    } else {
      debug('exported %s \n%s', tab.id, savedFile.contents);
    }
  };

  tab.exportAs(type, (err, file) => {
    if (err) {
      return done(err);
    }

    this.saveFile(file, true, done);
  });
};


/**
 * Find the open tab for the given file, if any.
 *
 * @param {FileDescriptor} file
 * @return {Tab}
 */
App.prototype.findTab = function(file) {
  var tabs = this.getAllTabs();

  if (isUnsaved(file)) {
    return null;
  }

  return find(tabs, function(t) {
    var tabPath = (t.file ? t.file.path : null);
    return file.path === tabPath;
  });
};


/**
 * Find a tab provider for the given file type.
 *
 * @param {String} fileType
 *
 * @return {TabProvider}
 */
App.prototype._findTabProvider = function(fileType) {

  var tabProvider = find(this.tabProviders, function(provider) {
    return provider.canCreate(fileType);
  });

  if (!tabProvider) {
    throw noTabProvider(fileType);
  }

  return tabProvider;
};


/**
 * Save the given tab with optional new name and
 * path (passed via options).
 *
 * The saved file is passed as the second argument to the
 * provided callback, unless the user canceled the save operation.
 *
 * @param {Tab} tab
 * @param {Object} [options]
 * @param {Function} [done] invoked with (err, savedFile)
 */
App.prototype.saveTab = function(tab, options, done) {
  var dialog = this.dialog;

  if (!tab) {
    throw new Error('need tab to save');
  }

  if (typeof options === 'function') {
    done = options;
    options = undefined;
  }

  done = done || function(err) {
    if (err) {
      dialog.saveError(err, function() {
        debug('error: %s', err);
      });
    }
  };

  var updateTab = (err, savedFile) => {

    if (err) {
      debug('not gonna update tab: %s', err);
      return done(err);
    }

    if (!savedFile) {
      debug('save file canceled');
      return done();
    }

    debug('saved %s', tab.id);

    // finally saved...
    tab.setFile(savedFile);

    this.events.emit('workspace:changed');

    return done(null, savedFile);
  };

  debug('saving %s', tab.id);

  // keep track of current active tab
  var activeTab = this.activeTab;

  // making sure tab is selected before save
  this.selectTab(tab);

  tab.save((err, file) => {
    // restore last active tab
    this.selectTab(activeTab);

    if (err) {
      return done(err);
    }

    debug('exported %s \n%s', tab.id, file.contents);

    var saveAs = isUnsaved(file) || options && options.saveAs;

    this.saveFile(file, saveAs, updateTab);
  });
};


/**
 * Save the given file and invoke callback with (err, savedFile).
 *
 * @param {FileDescriptor} file
 * @param {Boolean} saveAs whether to ask the user for a file name
 * @param {Function} done
 */
App.prototype.saveFile = function(file, saveAs, done) {
  var self = this;

  var dialog = this.dialog,
      fileSystem = this.fileSystem;

  function handleFileError(err, savedFile) {
    if (err) {
      return dialog.savingDenied(function(err, choice) {
        if (err) {
          debug('save file canceled: %s', err);

          return done(err);
        }

        if (isCancel(choice)) {
          return;
        }

        self.saveFile(file, { saveAs: true }, done);
      });
    }

    done(null, savedFile);
  }

  if (!saveAs) {
    return fileSystem.writeFile(assign({}, file), handleFileError);
  }

  dialog.saveAs(file, (err, suggestedFile) => {

    if (err) {
      debug('save file error', err);
      return done(err);
    }

    if (!suggestedFile) {
      debug('save file canceled');
      return done();
    }

    debug('save file %s as %s', file.name, suggestedFile.path);

    fileSystem.writeFile(assign({}, file, suggestedFile), handleFileError);
  });
};


/**
 * Select the given tab. May also be used to deselect all tabs
 * (empty selection) when passing null.
 *
 * @param {Tab} tab
 */
App.prototype.selectTab = function(tab, evt) {
  debug('selecting tab');
  var tabs = this.getAllTabs();

  // **hacky stuff** only select tab if it's done with left click
  if (evt && evt.button !== 0) {
    return;
  }

  var exists = contains(tabs, tab);

  if (tab && !exists) {
    throw new Error('non existing tab');
  }

  this.activeTab = tab;

  if (this.otherPane && contains(this.otherPane.tabs, tab)) {
    this.focusedPane = 'other';

    this.otherPane.activeTab = tab;
  } else {
    this.focusedPane = 'main';

    this.mainPane.activeTab = tab;
  }

  if (tab) {
    tab.emit('focus');

    this.recheckTabContent(tab);
  }


  this.events.emit('workspace:changed');

  this.events.emit('changed');
};


/**
 * Select next or previous non-empty tab.
 * Defaults to previous tab.
 *
 * @param  {Boolean} isNext
 */
App.prototype._selectWithDirection = function(isNext) {
  var tabs = this.getAllTabs();

  var nonEmptyTabs = filter(tabs, function(t) {
    return !t.empty;
  });

  if (nonEmptyTabs.length < 2) {
    return;
  }

  var i = nonEmptyTabs.indexOf(this.activeTab);

  if (isNext) {
    i = (i + 1) % nonEmptyTabs.length;
  } else {
    i = (i - 1 + nonEmptyTabs.length) % nonEmptyTabs.length;
  }

  this.selectTab(nonEmptyTabs[i]);
};


/**
 * Select next non-empty tab
 */
App.prototype.selectNext = function() {
  this._selectWithDirection(true);
};


/**
 * Select previus non-empty tab
 */
App.prototype.selectPrevious = function() {
  this._selectWithDirection(false);
};


/**
 * Close the given tab. If the user aborts the operation
 * (i.e. cancels it via dialog choice) the callback will
 * be evaluated with (null, 'canceled').
 *
 * @param {Tab} tab
 * @param {Function} [done] passed with (err, status=(canceled, ...))
 */
App.prototype.closeTab = function(tab, done) {

  debug('close tab', tab);

  var tabs = this.getAllTabs(),
      dialog = this.dialog,
      exists,
      file;

  if (typeof tab === 'string') {
    tab = exists = find(tabs, { id: tab });
  } else {
    exists = contains(tabs, tab);
  }

  if (!exists) {
    throw new Error('non existing tab');
  }

  if (typeof done !== 'function') {
    done = function(err) {
      if (err) {
        debug('error: %s', err);
      }
    };
  }

  // close normally when file is already saved
  if (!tab.dirty) {
    return this._closeTab(tab, done);
  }

  file = tab.file;

  dialog.close(file, (err, result) => {
    debug('---->', err, result);

    if (isCancel(result)) {
      debug('close-tab canceled: %s', err);

      return done(userCanceled());
    }

    if (err) {
      debug('close-tab error: %s', err);
      return done(err);
    }

    // close without saving
    if (isDiscard(result)) {
      return this._closeTab(tab, done);
    }

    // save and then close the tab
    this.saveTab(tab, (err, savedFile) => {
      if (err) {
        debug('save-tab error: %s', err);

        return done(err);
      }

      return this._closeTab(tab, done);
    });
  });
};


/**
 * Close given tab and select other tab, if current one is active.
 *
 * @param  {Tab}   tab
 * @param  {Function} done
 */
App.prototype._closeTab = function(tab, done) {
  var tabs = this.getActivePaneTabs(),
      events = this.events;

  done = done || function() {};

  tab.emit('destroy');

  events.emit('tab:close', tab);

  var idx = tabs.indexOf(tab);

  // remove tab from selection
  tabs.splice(idx, 1);

  // if tab was active, select previous (if exists) or next tab
  if (tab === this.activeTab) {
    this.selectTab(tabs[idx - 1] || tabs[idx]);
  }

  if (!isUnsaved(tab.file)) {
    this.fileHistory.push(tab.file);
  }

  events.emit('workspace:changed');

  events.emit('changed');

  return done();
};


/**
 * Add a tab to the app at an appropriate position.
 *
 * @param {Tab} tab
 * @return {Tab} the added tab
 */
App.prototype._addTab = function(tab, pane) {

  var events = this.events,
      tabs = this.getPaneTabs(pane);

  // always add tab right before the EMPTY_TAB
  // TODO(vlad): make adding before empty tab more explicit
  tabs.splice(tabs.length - 1, 0, tab);

  events.emit('workspace:changed');
  events.emit('changed');

  return tab;
};


/**
 * Persist the current workspace state
 *
 * @param {Function} done
 */
App.prototype.persistWorkspace = function(done) {

  var config = {
    tabs: [],
    activeTab: -1
  };

  var tabs = this.getAllTabs();

  // store tabs
  tabs.forEach((tab, idx) => {

    var file = tab.file;

    // do not persist unsaved files
    if (isUnsaved(file)) {
      return;
    }

    config.tabs.push(assign({}, file));

    // store saved active tab index
    if (tab === this.activeTab) {
      config.activeTab = config.tabs.length - 1;
    }
  });

  // store layout
  config.layout = this.layout;

  // let others store stuff, too
  this.events.emit('workspace:persist', config);

  // actually save
  this.workspace.save(config, (err, config) => {
    this.events.emit('workspace:persisted', err, config);

    done(err, config);
  });
};


/**
 * Restore previously saved workspace, if any exists.
 *
 * @param {Function} done
 */
App.prototype.restoreWorkspace = function(done) {

  var defaultWorkspace = {
    tabs: [],
    layout: {
      propertiesPanel: {
        open: false,
        width: 250
      },
      log: {
        open: false,
        height: 150
      }
    }
  };


  this.workspace.load(defaultWorkspace, (err, workspaceConfig) => {
    var tabs;

    if (err) {
      debug('workspace load error', err);

      return done(err);
    }

    // restore tabs
    if (workspaceConfig.tabs && workspaceConfig.tabs.length) {
      this.openTabs(workspaceConfig.tabs);
    }

    tabs = this.getAllTabs();

    if (workspaceConfig.activeTab && workspaceConfig.activeTab !== -1) {
      this.activeTab = tabs[workspaceConfig.activeTab];
    }

    this.events.emit('layout:update', workspaceConfig.layout);

    this.events.emit('changed');

    this.events.emit('workspace:restored');

    // we are done
    done(null, workspaceConfig);
  });

};

/**
 * Enables/disables any (button) menu entries
 *
 * @param  {String} id
 * @param  {Boolean} isDisabled
 */
App.prototype.updateMenuEntry = function(group, id, isDisabled) {
  var button = find(this.menuEntries[group].buttons, { id: id });

  button.disabled = isDisabled;

  this.events.emit('changed');
};


/**
 * Start application.
 */
App.prototype.run = function() {
  // initialization sequence
  //
  // (0) select empty tab
  // (1) load configuration
  // (2) restore workspace
  // (3) indicate ready

  var tabs = this.getAllTabs();

  this.selectTab(tabs[0]);

  this.restoreWorkspace((err) => {
    if (err) {
      debug('workspace restore error', err);
    } else {
      debug('workspace restored');
    }

    this.events.emit('ready');
  });

  this.events.emit('changed');
};


/**
 * Shifts a dragged tab to a new position (index based)
 *
 * @param  {Tab} tab
 * @param  {Number} newIdx
 */
App.prototype.shiftTab = function(tab, pane, newIdx) {
  var mainPaneTabs = this.getPaneTabs('main'),
      fromPane,
      otherPaneTabs,
      tabs, tabIdx;

  if (!tab) {
    return;
  }

  if (this.otherPane) {
    otherPaneTabs = this.getPaneTabs('other');
  }

  fromPane = contains(mainPaneTabs, tab) ? 'main' : 'other';

  if (fromPane === 'main') {
    tabs = mainPaneTabs;
  } else {
    tabs = otherPaneTabs;
  }

  tabIdx = tabs.indexOf(tab);

  tabs.splice(tabIdx, 1);

  if (pane === 'main') {
    mainPaneTabs.splice(newIdx, 0, tab);

    if (fromPane === 'other' && this.otherPane) {
      this.otherPane.activeTab = otherPaneTabs[ tabIdx - 1 >= 0 ? tabIdx - 1 : 0 ];
    }
  } else {
    otherPaneTabs.splice(newIdx, 0, tab);

    if (fromPane === 'main') {
      this.mainPane.activeTab = mainPaneTabs[ tabIdx - 1 >= 0 ? tabIdx - 1 : 0 ];
    }
  }

  this.selectTab(tab);

  this.events.emit('workspace:changed');

  this.events.emit('changed');
};


/**
 * Close all given tabs in a sequence.
 * Aborts if user cancels any of the dialogs.
 *
 * @param  {Array<Tab>} tabs
 * @param  {Function} cb
 */
App.prototype._closeTabs = function(tabs, cb) {
  cb = cb || function(err) {
    if (err) {
      debug('error: %s', err);
    }
  };

  series(tabs, (tab, done) => {
    this.selectTab(tab);

    // TODO: make sure newly selected tab is rendered
    this.closeTab(tab, done);
  }, cb);
};


/**
 * Closes all tabs that have external files associated with them.
 */
App.prototype.closeAllTabs = function() {
  var tabs = this.getAllTabs().filter(function(tab) {
    return !!tab.file;
  });

  this._closeTabs(tabs);
};


/**
 * Closes all tabs besides the current active one.
 */
App.prototype.closeOtherTabs = function(tab) {
  var tabs = this.getAllTabs();

  if (tab && typeof tab === 'string') {
    tab = find(tabs, { id: tab });
  } else {
    tab = contains(tabs, tab) ? tab : null;
  }

  var openedTab = tab || this.activeTab;

  tabs = tabs.filter(function(tab) {
    return tab.closable && openedTab !== tab;
  });

  this._closeTabs(tabs);
};


App.prototype.reopenLastTab = function() {
  var file = this.fileHistory.pop();

  if (file) {
    this.openFiles([ file ]);
  }
};


/**
 * Initiates application quit.
 */
App.prototype.quit = function() {
  debug('initiating application quit');
  var tabs = this.getAllTabs();

  var dirtyTabs = tabs.filter(function(tab) {
    return tab.dirty;
  });

  this._closeTabs(dirtyTabs, (err) => {
    if (err) {
      debug('quit aborted');

      return this.events.emit('quit-aborted');
    }
    debug('shutting down application');

    // we have to use the event based workspace persisting
    // or there will be race conditions on quit
    this.events.emit('workspace:changed', () => {
      this.events.emit('quitting');
    });
  });
};

var rdebug = require('debug')('app - external change');

/**
 * Checks tab content for external changes
 * @param  {Tab} tab
 */
App.prototype.recheckTabContent = function(tab) {

  if (isUnsaved(tab.file)) {
    return rdebug('skipping (unsaved)');
  }

  rdebug('checking');

  if (typeof tab.file.lastModified === 'undefined') {
    return rdebug('skipping (missing tab.file.lastChanged)');
  }

  var setNewFile = (file) => {
    tab.setFile(assign({}, tab.file, file));

    this.events.emit('workspace:changed');
  };

  this.fileSystem.readFileStats(tab.file, (err, statsFile) => {
    if (err) {
      return rdebug('file check error', err);
    }

    rdebug('last modified { tab: %s, stats: %s }',
      tab.file.lastModified || 0,
      statsFile.lastModified);

    if (!(statsFile.lastModified > tab.file.lastModified)) {
      return rdebug('unchanged');
    }

    rdebug('external change');

    // notifying user about external changes
    this.dialog.contentChanged((answer) => {

      if (isOk(answer)) {
        rdebug('reloading');

        this.fileSystem.readFile(tab.file, function(err, updatedFile) {
          if (err) {
            return rdebug('reloading failed', err);
          }

          setNewFile(updatedFile);
        });

      } else if (isCancel(answer)) {
        rdebug('NOT reloading');

        setNewFile(statsFile);
      }

    });

  });
};


function contains(collection, element) {
  return collection.some(function(e) {
    return e === element;
  });
}

function isDiscard(userChoice) {
  return userChoice === 'discard';
}

function isCancel(userChoice) {
  return userChoice === 'cancel';
}

function isOk(userChoice) {
  return userChoice === 'ok';
}

function userCanceled() {
  return new Error('user canceled');
}

function noTabProvider(fileType) {
  throw new Error('missing provider for file <' + fileType + '>');
}
