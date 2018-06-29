define([
  'core/js/adapt',
  'core/js/views/componentView'
], function(Adapt, ComponentView) {
  'use strict';

  var NarrativeView = ComponentView.extend({

    _isInitial: true,

    events: {
      'click .js-narrative-strapline-title': 'openPopup',
      'click .js-narrative-controls': 'onNavigationClicked',
      'click .js-narrative-indicators .js-narrative-progress': 'onProgressClicked'
    },

    preRender: function() {
      this.listenTo(Adapt, {
        'device:changed': this.reRender,
        'device:resize': this.resizeControl,
        'notify:closed': this.closeNotify
      });
      this.setDeviceSize();

      this.listenTo(this.model.get('_children'), {
        'change:_isActive': this.onItemsActiveChange,
        'change:_isVisited': this.onItemsVisitedChange
      });

      // Checks to see if the narrative should be reset on revisit
      this.checkIfResetOnRevisit();
      this.calculateWidths();
    },

    onItemsActiveChange: function(item, _isActive) {
      if (_isActive === true) {
        this.setStage(item);
      }
    },

    onItemsVisitedChange: function(item, isVisited) {
      if (!isVisited) return;
      this.$('[data-index="' + item.get('_index') + '"]').addClass('is-visited');
    },

    setDeviceSize: function() {
      this.model.set('_isDesktop', Adapt.device.screenSize === 'large');
    },

    postRender: function() {
      this.renderState();
      this.$('.m-narrative__slider').imageready(this.setReadyStatus.bind(this));
      this.setupNarrative();

      if (Adapt.config.get('_disableAnimation')) {
        this.$el.addClass('disable-animation');
      }
    },

    // Used to check if the narrative should reset on revisit
    checkIfResetOnRevisit: function() {
      var isResetOnRevisit = this.model.get('_isResetOnRevisit');
      // If reset is enabled set defaults
      if (isResetOnRevisit) {
        this.model.reset(isResetOnRevisit);
      }
    },

    setupNarrative: function() {
      this.setDeviceSize();
      var items = this.model.get('_children');
      if (!items || !items.length) return;

      var activeItem = this.model.getActiveItem();
      if (!activeItem) {
        activeItem = this.model.getItem(0);
        activeItem.toggleActive(true);
      } else {
        // manually trigger change as it is not fired on reentry
        items.trigger('change:_isActive', activeItem, true);
      }

      this.calculateWidths();

      if (Adapt.device.screenSize !== 'large' && !this.model.get('_wasHotgraphic')) {
        this.replaceInstructions();
      }
      this.setupEventListeners();
      this._isInitial = false;
    },

    calculateWidths: function() {
      var itemCount = this.model.get('_children').length;
      this.model.set({
        '_totalWidth': 100 * itemCount,
        '_itemWidth': 100 / itemCount
      });
    },

    resizeControl: function() {
      var wasDesktop = this.model.get('_isDesktop');
      this.setDeviceSize();
      if (wasDesktop != this.model.get('_isDesktop')) this.replaceInstructions();
      this.evaluateNavigation();
      var activeItem = this.model.getActiveItem();
      if (activeItem) this.setStage(activeItem);
    },

    reRender: function() {
      if (this.model.get('_wasHotgraphic') && Adapt.device.screenSize === 'large') {
        this.replaceWithHotgraphic();
      } else {
        this.resizeControl();
      }
    },

    closeNotify: function() {
      this.evaluateCompletion();
    },

    replaceInstructions: function() {
      if (Adapt.device.screenSize === 'large') {
        this.$('.m-narrative__instruction-inner').html(this.model.get('instruction')).a11y_text();
      } else if (this.model.get('mobileInstruction') && !this.model.get('_wasHotgraphic')) {
        this.$('.m-narrative__instruction-inner').html(this.model.get('mobileInstruction')).a11y_text();
      }
    },

    replaceWithHotgraphic: function() {
      if (!Adapt.componentStore.hotgraphic) throw "Hotgraphic not included in build";
      var HotgraphicView = Adapt.componentStore.hotgraphic.view;

      var model = this.prepareHotgraphicModel();
      var newHotgraphic = new HotgraphicView({ model: model });
      var $container = $(".component__container", $("." + this.model.get("_parentId")));

      $container.append(newHotgraphic.$el);
      this.remove();
      $.a11y_update();
      _.defer(function() {
        Adapt.trigger('device:resize');
      });
    },

    prepareHotgraphicModel: function() {
      var model = this.model;
      model.resetActiveItems();
      model.set({
        '_isPopupOpen': false,
        '_component': 'hotgraphic',
        'body': model.get('originalBody'),
        'instruction': model.get('originalInstruction')
      });

      return model;
    },

    moveSliderToIndex: function(itemIndex, shouldAnimate) {
      var offset = this.model.get('_itemWidth') * itemIndex;
      if (Adapt.config.get('_defaultDirection') === 'ltr') {
        offset *= -1;
      }
      var cssValue = 'translateX('+offset+'%)';
      var $sliderElm = this.$('.m-narrative__slider');
      var $straplineHeaderElm = this.$('.m-narrative__strapline-header-inner');

      $sliderElm.css('transform', cssValue);
      $straplineHeaderElm.css('transform', cssValue);

      if (Adapt.config.get('_disableAnimation')) {
        this.onTransitionEnd();
      } else {
        $sliderElm.one('transitionend', this.onTransitionEnd.bind(this));
      }
    },

    onTransitionEnd: function() {
      if (this._isInitial) return;

      var index = this.model.getActiveItem().get('_index');
      if (this.model.get('_isDesktop')) {
        this.$('.m-narrative__content-item[data-index="'+index+'"]').a11y_focus();
      } else {
        this.$('.m-narrative__strapline-title').a11y_focus();
      }
    },

    setStage: function(item) {
      var index = item.get('_index');
      if (this.model.get('_isDesktop')) {
        // Set the visited attribute for large screen devices
        item.toggleVisited(true);
      }

      var $slideGraphics = this.$('.m-narrative__slider-graphic');
      this.$('.m-narrative__progress:visible').removeClass('is-selected').filter('[data-index="'+index+'"]').addClass('is-selected');
      $slideGraphics.children('.controls').a11y_cntrl_enabled(false);
      $slideGraphics.filter('[data-index="'+index+'"]').children('.controls').a11y_cntrl_enabled(true);
      this.$('.m-narrative__content-item').addClass('u-visibility-hidden u-display-none').a11y_on(false).filter('[data-index="'+index+'"]').removeClass('u-visibility-hidden u-display-none').a11y_on(true);
      this.$('.m-narrative__strapline-title').a11y_cntrl_enabled(false).filter('[data-index="'+index+'"]').a11y_cntrl_enabled(true);

      this.evaluateNavigation();
      this.evaluateCompletion();
      this.moveSliderToIndex(index, !this._isInitial);
    },

    evaluateNavigation: function() {
      var active = this.model.getActiveItem();
      if (!active) return;

      var currentStage = active.get('_index');
      var itemCount = this.model.get('_children').length;

      var isAtStart = currentStage === 0;
      var isAtEnd = currentStage === itemCount - 1;

      this.$('.m-narrative__control-left').toggleClass('u-visibility-hidden', isAtStart);
      this.$('.m-narrative__control-right').toggleClass('u-visibility-hidden', isAtEnd);
    },

    evaluateCompletion: function() {
      if (this.model.areAllItemsCompleted()) {
        this.trigger('allItems');
      }
    },

    openPopup: function(event) {
      event && event.preventDefault();

      var currentItem = this.model.getActiveItem();

      // Set the visited attribute for small and medium screen devices
      currentItem.toggleVisited(true);

      Adapt.trigger('notify:popup', {
        title: currentItem.get('title'),
        body: currentItem.get('body')
      });
    },

    onNavigationClicked: function(event) {
      var stage = this.model.getActiveItem().get('_index');
      var numberOfItems = this.model.get('_children').length;

      if ($(event.currentTarget).hasClass('m-narrative__control-right')) {
        this.model.setActiveItem(++stage);
      } else if ($(event.currentTarget).hasClass('m-narrative__control-left')) {
        this.model.setActiveItem(--stage);
      }
    },

    onProgressClicked: function(event) {
      event && event.preventDefault();
      var clickedIndex = $(event.target).data('index');
      this.model.setActiveItem(clickedIndex);
    },

    inview: function(event, visible, visiblePartX, visiblePartY) {
      if (!visible) return;

      if (visiblePartY === 'top') {
        this._isVisibleTop = true;
      } else if (visiblePartY === 'bottom') {
        this._isVisibleBottom = true;
      } else {
        this._isVisibleTop = true;
        this._isVisibleBottom = true;
      }

      var wasAllInview = (this._isVisibleTop && this._isVisibleBottom);
      if (!wasAllInview) return;

      this.$('.component__inner').off('inview');
      this.setCompletionStatus();
    },

    setupEventListeners: function() {
      if (this.model.get('_setCompletionOn') === 'inview') {
        this.$('.component__widget').on('inview', this.inview.bind(this));
      }
    },

    remove: function() {
      if (this.model.get('_setCompletionOn') === 'inview') {
        this.$('.component__widget').off('inview');
      }
      ComponentView.prototype.remove.apply(this, arguments);
    }

  });

  return NarrativeView;

});
