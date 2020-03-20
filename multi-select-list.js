import { PolymerElement } from '@polymer/polymer/polymer-element.js';
import { afterNextRender } from '@polymer/polymer/lib/utils/render-status.js';
import { microTask } from '@polymer/polymer/lib/utils/async.js';
import { Debouncer } from '@polymer/polymer/lib/utils/debounce.js';
import { FlattenedNodesObserver } from '@polymer/polymer/lib/utils/flattened-nodes-observer.js';
import { mixinBehaviors } from '@polymer/polymer/lib/legacy/class.js';

import 'd2l-polymer-behaviors/d2l-focusable-arrowkeys-behavior.js';
import 'd2l-resize-aware/resize-observer-polyfill.js';

import './localize-behavior.js';

const $_documentContainer = document.createElement('template');
$_documentContainer.innerHTML = `<dom-module id="d2l-labs-multi-select-list">
	<template strip-whitespace>
		<style>
			:host {
				display: flex;
				width: 100%;
				flex-direction: column;
			}
			:host([collapsed]) {
				flex-direction: row;
			}
			div[role="row"] {
				display: flex;
				flex-wrap: wrap;
			}

			div[collapse] {
				max-height: 1.94rem;
				overflow: hidden;
			}

			div[role="row"] > ::slotted(d2l-labs-multi-select-list-item) {
				padding: 0.15rem;
				display: block;
			}
			.aux-button {
				display: inline-block;
				padding: 0.15rem;
			}
			.hide-aux {
				display: none;
			}
		</style>
			<div role="row" collapse$=[[collapsed]]>
				<slot></slot>
			</div>
			<template is="dom-if" if="[[collapsable]]">
				<div class$="[[_displayAux(hiddenChildren)]]" >
					<d2l-labs-multi-select-list-item  text="[[_expandCollapseText(hiddenChildren, collapsed)]]" on-click="_expandCollapse"></d2l-labs-multi-select-list-item>
					<slot name="aux-button"></slot>
				</div>
			</template>
	</template>
</dom-module>`;

document.head.appendChild($_documentContainer.content);

/**
 * `<d2l-labs-multi-select-list>`
 * Polymer-based web component for D2L multi-select-list
 * @demo demo/index.hmtl
 */
class D2LMultiSelectList extends mixinBehaviors(
	[
		D2L.PolymerBehaviors.D2LMultiSelect.LocalizeBehavior,
		D2L.PolymerBehaviors.FocusableArrowKeysBehavior,
	],
	PolymerElement
) {
	static get is() { return 'd2l-labs-multi-select-list'; }
	static get properties() {
		return {
			/**
			* Keycodes for keyboard behavior
			*/
			_keyCodes: {
				type: Object,
				value: { BACKSPACE: 8, DELETE: 46, SPACE: 32 }
			},
			/**
			* Tracks the currently focused item for managing tabindex
			*/
			_currentlyFocusedElement: {
				type: Node,
				value: null
			},
			/**
			* Automatically remove list items when they fire a
			* d2l-labs-multi-select-list-item-deleted event
			*/
			autoremove: {
				type: Boolean,
				value: false
			},
			/**
			 * Toggles collpasing mode
			 */
			collapsable: {
				type: Boolean,
				value: false
			},
			/**
			 * internal reflected attribute that shows the current state
			 */
			collapsed: {
				type: Boolean,
				value: false,
				reflectToAttribute: true
			},
			/**
			 *
			 * number of children elements that are hidden from view
			 */
			hiddenChildren: {
				type: Number,
				value: 0
			}
		};
	}

	constructor() {
		super();
		this._onListItemDeleted = this._onListItemDeleted.bind(this);
		this.observer = new ResizeObserver(this._debounceChildren.bind(this));
		this.observer.observe(this);
		this._nodeObserver = new FlattenedNodesObserver(this, () => {
			this._debounceChildren();
		});
	}
	connectedCallback() {
		super.connectedCallback();
		// Set up for d2l-focusable-arrowkeys-behavior
		this.arrowKeyFocusablesContainer = this.shadowRoot;
		this.arrowKeyFocusablesDirection = 'updownleftright';
		this.arrowKeyFocusablesNoWrap = true;

		this.arrowKeyFocusablesProvider = function() {
			return Promise.resolve(this._getVisibileEffectiveChildren());
		};

		this.setAttribute('role', 'grid');
		afterNextRender(this, function() {
			const listItems = this.getEffectiveChildren();
			// Set tabindex to allow component to be focusable, and set role on list items
			if (listItems.length) {
				listItems[0].tabIndex = 0;
				this._currentlyFocusedElement = listItems[0];
				listItems.forEach(function(listItem) {
					listItem.setAttribute('role', 'gridcell');
				});
			}

			this.addEventListener('d2l-labs-multi-select-list-item-deleted', this._onListItemDeleted);
			this.addEventListener('focus', this._onListItemFocus, true);
			this.addEventListener('keydown', this._onKeyDown);
		}.bind(this));
		if (this.collapsable) {
			this._expandCollapse();
		}
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.removeEventListener('d2l-labs-multi-select-list-item-deleted', this._onListItemDeleted);
		this.removeEventListener('focus', this._onListItemFocus, true);
		this.removeEventListener('keydown', this._onKeyDown);
	}

	_onListItemFocus(event) {
		this._currentlyFocusedElement.tabIndex = -1;
		this._currentlyFocusedElement = event.target;
		this._currentlyFocusedElement.tabIndex = 0;
	}

	_onListItemDeleted(event) {
		if (event && event.detail && event.detail.handleFocus) {
			const rootTarget = event.composedPath()[0];
			const itemIndex = this._getVisibileEffectiveChildren().indexOf(rootTarget);
			itemIndex === this._getVisibileEffectiveChildren().length - 1
				? this.__focusPrevious(rootTarget)
				: this.__focusNext(rootTarget);
		}
		if (this.autoremove) {
			event.target.deleteItem();
		}
	}

	_onKeyDown(event) {
		const { BACKSPACE, DELETE, SPACE } = this._keyCodes;
		const { keyCode } = event;
		const rootTarget = event.composedPath()[0];
		const itemIndex = this._getVisibileEffectiveChildren().indexOf(rootTarget);
		if ((keyCode === BACKSPACE || keyCode === DELETE) && itemIndex !== -1) {
			event.preventDefault();
			event.stopPropagation();

			if (keyCode === BACKSPACE) {
				itemIndex === 0
					? this.__focusNext(rootTarget)
					: this.__focusPrevious(rootTarget);
			} else {
				itemIndex === this._getVisibileEffectiveChildren().length - 1
					? this.__focusPrevious(rootTarget)
					: this.__focusNext(rootTarget);
			}
			rootTarget._onDeleteItem();
		}
		if (keyCode === SPACE && itemIndex !== -1) {
			event.preventDefault();
			event.stopPropagation();
			this._expandCollapse();
		}
	}
	_getVisibileEffectiveChildren() {
		const children = this.getEffectiveChildren();
		const auxButton = this.collapsable ? [this.shadowRoot.querySelector('.aux-button d2l-labs-multi-select-list-item')] : [];
		const hiddenChildren = this.collapsed ? this.hiddenChildren : 0;
		const vChildren = children.slice(0, children.length - hiddenChildren).concat(auxButton);
		return vChildren;
	}
	_debounceChildren() {
		this._debounceJob = Debouncer.debounce(this._debounceJob,
			microTask, () => this._updateChildren());
	}
	_displayAux(children) {
		return children > 0 ? 'aux-button' : 'hide-aux';
	}
	_expandCollapse() {
		this.collapsed = !this.collapsed;
	}
	_expandCollapseText(hiddenChildren, collapsed) {
		return collapsed ? this.localize('hiddenChildren', 'num', hiddenChildren) : this.localize('hide');
	}
	_updateChildren() {
		if (!this.collapsable) {
			return;
		}
		let childrenWidthTotal = 0;
		const children = this.getEffectiveChildren();
		const widthOfListItems = this.shadowRoot.querySelector('div[role="row"]').getBoundingClientRect().width;
		let newHiddenChildren = 0;
		for (let i = 0; i < children.length; i++) {
			const listItem = children[i];
			childrenWidthTotal += listItem.getBoundingClientRect().width;
			if (childrenWidthTotal > widthOfListItems) {
				newHiddenChildren = children.length - i;
				break;
			}
		}
		this.hiddenChildren = newHiddenChildren;
	}
	addItem(item) {
		if (this._currentlyFocusedElement === null) {
			this._currentlyFocusedElement = item;
		}
		this.getEffectiveChildren()[0].tabIndex = 0;
		this.dispatchEvent(new CustomEvent(
			'd2l-labs-multi-select-list-item-added',
			{ bubbles: true, composed: true, detail: { value: item.text } }
		));
	}
}
customElements.define(D2LMultiSelectList.is, D2LMultiSelectList);
