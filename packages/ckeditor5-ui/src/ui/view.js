/**
 * @license Copyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

/**
 * Basic View class.
 *
 * @class View
 * @extends Model
 * @mixins DOMEmitterMixin
 */

CKEDITOR.define( [
	'namedcollection',
	'model',
	'ui/template',
	'ckeditorerror',
	'ui/domemittermixin',
	'utils'
], function( NamedCollection, Model, Template, CKEditorError, DOMEmitterMixin, utils ) {
	class View extends Model {
		/**
		 * Creates an instance of the {@link View} class.
		 *
		 * @param {Model} model (View)Model of this View.
		 * @constructor
		 */
		constructor( model ) {
			super();

			/**
			 * Model of this view.
			 */
			this.model = new Model( model );

			/**
			 * Regions which belong to this view.
			 */
			this.regions = new NamedCollection();

			/**
			 * @property {HTMLElement} _el
			 */

			/**
			 * @property {Template} _template
			 */
		}

		/**
		 * Element of this view. The element is rendered on first reference.
		 *
		 * @property el
		 */
		get el() {
			return this._el || this.render();
		}

		/**
		 * Binds a `property` of View's model so the DOM of the View is updated when the `property`
		 * changes. It returns a function which, once called in the context of a DOM element,
		 * attaches a listener to the model which, in turn, brings changes to DOM.
		 *
		 * @param {String} property Property name in the model to be observed.
		 * @param {Function} [callback] Callback function executed on property change in model.
		 * If not specified, a default DOM `domUpdater` supplied by the template is used.
		 */
		bind( property, callback ) {
			/**
			 * Attaches a listener to View's model, which updates DOM when the model's property
			 * changes. DOM is either updated by the `domUpdater` function supplied by the template
			 * (like attribute changer or `innerHTML` setter) or custom `callback` passed to {@link #bind}.
			 *
			 * This function is called by {@link Template#render}.
			 *
			 * @param {HTMLElement} el DOM element to be updated when `property` in model changes.
			 * @param {Function} domUpdater A function provided by the template which updates corresponding
			 * DOM.
			 */
			return ( el, domUpdater ) => {
				// TODO: Use ES6 default arguments syntax.
				callback = callback || domUpdater;

				// Execute callback when the property changes.
				this.listenTo( this.model, 'change:' + property, onModelChange );

				// Set the initial state of the view.
				onModelChange( null, this.model[ property ] );

				function onModelChange( evt, value ) {
					var processedValue = callback( el, value );

					if ( typeof processedValue != 'undefined' ) {
						domUpdater( el, processedValue );
					}
				}
			};
		}

		/**
		 * Renders View's {@link el} using {@link Template} instance.
		 *
		 * @returns {HTMLElement} A root element of the View ({@link el}).
		 */
		render() {
			if ( !this.template ) {
				/**
				 * This View implements no template to render.
				 *
				 * @error ui-view-notemplate
				 * @param {View} view
				 */
				throw new CKEditorError(
					'ui-view-notemplate: This View implements no template to render.',
					{ view: this }
				);
			}

			// Prepare pre–defined listeners.
			this.prepareListeners();

			this._template = new Template( this.template );

			return ( this._el = this._template.render() );
		}

		/**
		 * Destroys the View.
		 */
		destroy() {
			// Drop the reference to the model.
			this.model = null;

			// Remove View's element from DOM.
			if ( this.template ) {
				this.el.remove();
			}

			// Remove and destroy regions.
			this.regions.forEach( r => this.regions.remove( r ).destroy() );

			// Remove all listeners related to this view.
			this.stopListening();
		}

		/**
		 * Iterates over all "on" properties in {@link template} and replaces
		 * listener definitions with functions which, once executed in a context of
		 * a DOM element, will attach native DOM listeners to elements.
		 *
		 * The execution is performed by {@link Template} class.
		 */
		prepareListeners() {
			var that = this;

			if ( this.template ) {
				prepareElementListeners( this.template );
			}

			/**
			 * For a given event name or callback, returns a function which,
			 * once executed in a context of an element, attaches native DOM listener
			 * to the element. The listener executes given callback or fires View's event
			 * of given name.
			 *
			 * @param {String|Function} evtNameOrCallback Event name to be fired on View or callback to execute.
			 * @returns {Function} A function to be executed in the context of an element.
			 */
			function getDOMListenerAttacher( evtNameOrCallback ) {
				/**
				 * Attaches a native DOM listener to given element. The listener executes the
				 * callback or fires View's event.
				 *
				 * Note: If the selector is supplied, it narrows the scope to relevant targets only.
				 * So instead of
				 *
				 *     children: [
				 *         { tag: 'span', on: { click: 'foo' } }
				 *         { tag: 'span', on: { click: 'foo' } }
				 *     ]
				 *
				 * a single, more efficient listener can be attached that uses **event delegation**:
				 *
				 *     children: [
				 *     	   { tag: 'span' }
				 *     	   { tag: 'span' }
				 *     ],
				 *     on: {
				 *     	   'click@span': 'foo',
				 *     }
				 *
				 * @param {HTMLElement} el Element, to which the native DOM Event listener is attached.
				 * @param {String} domEventName The name of native DOM Event.
				 * @param {String} [selector] If provided, the selector narrows the scope to relevant targets only.
				 */
				return ( el, domEvtName, selector ) => {
					// Use View's listenTo, so the listener is detached, when the View dies.
					that.listenTo( el, domEvtName, ( evt, domEvt ) => {
						if ( !selector || domEvt.target.matches( selector ) ) {
							if ( typeof evtNameOrCallback == 'function' ) {
								evtNameOrCallback( domEvt );
							} else {
								that.fire( evtNameOrCallback, domEvt );
							}
						}
					} );
				};
			}

			/**
			 * Iterates over "on" property in {@link template} definition to recursively
			 * replace each listener declaration with a function which, once executed in a context
			 * of an element, attaches native DOM listener to the element.
			 *
			 * @param {Object} def Template definition.
			 */
			function prepareElementListeners( def ) {
				let on = def.on;

				if ( on ) {
					let domEvtName, evtNameOrCallback;

					for ( domEvtName in on ) {
						evtNameOrCallback = on[ domEvtName ];

						// Listeners allow definition with an array:
						//
						//    on: {
						//        'DOMEventName@selector': [ 'event1', callback ],
						//        'DOMEventName': [ callback, 'event2', 'event3' ]
						//        ...
						//    }
						if ( Array.isArray( evtNameOrCallback ) ) {
							on[ domEvtName ] = on[ domEvtName ].map( getDOMListenerAttacher );
						}
						// Listeners allow definition with a string containing event name:
						//
						//    on: {
						//       'DOMEventName@selector': 'event1',
						//       'DOMEventName': 'event2'
						//       ...
						//    }
						else {
							on[ domEvtName ] = getDOMListenerAttacher( evtNameOrCallback );
						}
					}
				}

				// Repeat recursively for the children.
				if ( def.children ) {
					def.children.map( prepareElementListeners );
				}
			}
		}
	}

	utils.extend( View.prototype, DOMEmitterMixin );

	return View;
} );
