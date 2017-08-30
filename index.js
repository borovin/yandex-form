(function () {
'use strict';

var range; // Create a range object for efficently rendering strings to elements.
var NS_XHTML = 'http://www.w3.org/1999/xhtml';

var doc = typeof document === 'undefined' ? undefined : document;

var testEl = doc ?
    doc.body || doc.createElement('div') :
    {};

// Fixes <https://github.com/patrick-steele-idem/morphdom/issues/32>
// (IE7+ support) <=IE7 does not support el.hasAttribute(name)
var actualHasAttributeNS;

if (testEl.hasAttributeNS) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttributeNS(namespaceURI, name);
    };
} else if (testEl.hasAttribute) {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.hasAttribute(name);
    };
} else {
    actualHasAttributeNS = function(el, namespaceURI, name) {
        return el.getAttributeNode(namespaceURI, name) != null;
    };
}

var hasAttributeNS = actualHasAttributeNS;


function toElement(str) {
    if (!range && doc.createRange) {
        range = doc.createRange();
        range.selectNode(doc.body);
    }

    var fragment;
    if (range && range.createContextualFragment) {
        fragment = range.createContextualFragment(str);
    } else {
        fragment = doc.createElement('body');
        fragment.innerHTML = str;
    }
    return fragment.childNodes[0];
}

/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */
function compareNodeNames(fromEl, toEl) {
    var fromNodeName = fromEl.nodeName;
    var toNodeName = toEl.nodeName;

    if (fromNodeName === toNodeName) {
        return true;
    }

    if (toEl.actualize &&
        fromNodeName.charCodeAt(0) < 91 && /* from tag name is upper case */
        toNodeName.charCodeAt(0) > 90 /* target tag name is lower case */) {
        // If the target element is a virtual DOM node then we may need to normalize the tag name
        // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
        // are converted to upper case
        return fromNodeName === toNodeName.toUpperCase();
    } else {
        return false;
    }
}

/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */
function createElementNS(name, namespaceURI) {
    return !namespaceURI || namespaceURI === NS_XHTML ?
        doc.createElement(name) :
        doc.createElementNS(namespaceURI, name);
}

/**
 * Copies the children of one DOM element to another DOM element
 */
function moveChildren(fromEl, toEl) {
    var curChild = fromEl.firstChild;
    while (curChild) {
        var nextChild = curChild.nextSibling;
        toEl.appendChild(curChild);
        curChild = nextChild;
    }
    return toEl;
}

function morphAttrs(fromNode, toNode) {
    var attrs = toNode.attributes;
    var i;
    var attr;
    var attrName;
    var attrNamespaceURI;
    var attrValue;
    var fromValue;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        attrName = attr.name;
        attrNamespaceURI = attr.namespaceURI;
        attrValue = attr.value;

        if (attrNamespaceURI) {
            attrName = attr.localName || attrName;
            fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
            }
        } else {
            fromValue = fromNode.getAttribute(attrName);

            if (fromValue !== attrValue) {
                fromNode.setAttribute(attrName, attrValue);
            }
        }
    }

    // Remove any extra attributes found on the original DOM element that
    // weren't found on the target element.
    attrs = fromNode.attributes;

    for (i = attrs.length - 1; i >= 0; --i) {
        attr = attrs[i];
        if (attr.specified !== false) {
            attrName = attr.name;
            attrNamespaceURI = attr.namespaceURI;

            if (attrNamespaceURI) {
                attrName = attr.localName || attrName;

                if (!hasAttributeNS(toNode, attrNamespaceURI, attrName)) {
                    fromNode.removeAttributeNS(attrNamespaceURI, attrName);
                }
            } else {
                if (!hasAttributeNS(toNode, null, attrName)) {
                    fromNode.removeAttribute(attrName);
                }
            }
        }
    }
}

function syncBooleanAttrProp(fromEl, toEl, name) {
    if (fromEl[name] !== toEl[name]) {
        fromEl[name] = toEl[name];
        if (fromEl[name]) {
            fromEl.setAttribute(name, '');
        } else {
            fromEl.removeAttribute(name, '');
        }
    }
}

var specialElHandlers = {
    /**
     * Needed for IE. Apparently IE doesn't think that "selected" is an
     * attribute when reading over the attributes using selectEl.attributes
     */
    OPTION: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'selected');
    },
    /**
     * The "value" attribute is special for the <input> element since it sets
     * the initial value. Changing the "value" attribute without changing the
     * "value" property will have no effect since it is only used to the set the
     * initial value.  Similar for the "checked" attribute, and "disabled".
     */
    INPUT: function(fromEl, toEl) {
        syncBooleanAttrProp(fromEl, toEl, 'checked');
        syncBooleanAttrProp(fromEl, toEl, 'disabled');

        if (fromEl.value !== toEl.value) {
            fromEl.value = toEl.value;
        }

        if (!hasAttributeNS(toEl, null, 'value')) {
            fromEl.removeAttribute('value');
        }
    },

    TEXTAREA: function(fromEl, toEl) {
        var newValue = toEl.value;
        if (fromEl.value !== newValue) {
            fromEl.value = newValue;
        }

        var firstChild = fromEl.firstChild;
        if (firstChild) {
            // Needed for IE. Apparently IE sets the placeholder as the
            // node value and vise versa. This ignores an empty update.
            var oldValue = firstChild.nodeValue;

            if (oldValue == newValue || (!newValue && oldValue == fromEl.placeholder)) {
                return;
            }

            firstChild.nodeValue = newValue;
        }
    },
    SELECT: function(fromEl, toEl) {
        if (!hasAttributeNS(toEl, null, 'multiple')) {
            var i = 0;
            var curChild = toEl.firstChild;
            while(curChild) {
                var nodeName = curChild.nodeName;
                if (nodeName && nodeName.toUpperCase() === 'OPTION') {
                    if (hasAttributeNS(curChild, null, 'selected')) {
                        break;
                    }
                    i++;
                }
                curChild = curChild.nextSibling;
            }

            fromEl.selectedIndex = i;
        }
    }
};

var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
    return node.id;
}

function morphdomFactory(morphAttrs) {

    return function morphdom(fromNode, toNode, options) {
        if (!options) {
            options = {};
        }

        if (typeof toNode === 'string') {
            if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
                var toNodeHtml = toNode;
                toNode = doc.createElement('html');
                toNode.innerHTML = toNodeHtml;
            } else {
                toNode = toElement(toNode);
            }
        }

        var getNodeKey = options.getNodeKey || defaultGetNodeKey;
        var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
        var onNodeAdded = options.onNodeAdded || noop;
        var onBeforeElUpdated = options.onBeforeElUpdated || noop;
        var onElUpdated = options.onElUpdated || noop;
        var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
        var onNodeDiscarded = options.onNodeDiscarded || noop;
        var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
        var childrenOnly = options.childrenOnly === true;

        // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.
        var fromNodesLookup = {};
        var keyedRemovalList;

        function addKeyedRemoval(key) {
            if (keyedRemovalList) {
                keyedRemovalList.push(key);
            } else {
                keyedRemovalList = [key];
            }
        }

        function walkDiscardedChildNodes(node, skipKeyedNodes) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {

                    var key = undefined;

                    if (skipKeyedNodes && (key = getNodeKey(curChild))) {
                        // If we are skipping keyed nodes then we add the key
                        // to a list so that it can be handled at the very end.
                        addKeyedRemoval(key);
                    } else {
                        // Only report the node as discarded if it is not keyed. We do this because
                        // at the end we loop through all keyed elements that were unmatched
                        // and then discard them in one final pass.
                        onNodeDiscarded(curChild);
                        if (curChild.firstChild) {
                            walkDiscardedChildNodes(curChild, skipKeyedNodes);
                        }
                    }

                    curChild = curChild.nextSibling;
                }
            }
        }

        /**
         * Removes a DOM node out of the original DOM
         *
         * @param  {Node} node The node to remove
         * @param  {Node} parentNode The nodes parent
         * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
         * @return {undefined}
         */
        function removeNode(node, parentNode, skipKeyedNodes) {
            if (onBeforeNodeDiscarded(node) === false) {
                return;
            }

            if (parentNode) {
                parentNode.removeChild(node);
            }

            onNodeDiscarded(node);
            walkDiscardedChildNodes(node, skipKeyedNodes);
        }

        // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
        // function indexTree(root) {
        //     var treeWalker = document.createTreeWalker(
        //         root,
        //         NodeFilter.SHOW_ELEMENT);
        //
        //     var el;
        //     while((el = treeWalker.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
        //
        // function indexTree(node) {
        //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
        //     var el;
        //     while((el = nodeIterator.nextNode())) {
        //         var key = getNodeKey(el);
        //         if (key) {
        //             fromNodesLookup[key] = el;
        //         }
        //     }
        // }

        function indexTree(node) {
            if (node.nodeType === ELEMENT_NODE) {
                var curChild = node.firstChild;
                while (curChild) {
                    var key = getNodeKey(curChild);
                    if (key) {
                        fromNodesLookup[key] = curChild;
                    }

                    // Walk recursively
                    indexTree(curChild);

                    curChild = curChild.nextSibling;
                }
            }
        }

        indexTree(fromNode);

        function handleNodeAdded(el) {
            onNodeAdded(el);

            var curChild = el.firstChild;
            while (curChild) {
                var nextSibling = curChild.nextSibling;

                var key = getNodeKey(curChild);
                if (key) {
                    var unmatchedFromEl = fromNodesLookup[key];
                    if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
                        curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
                        morphEl(unmatchedFromEl, curChild);
                    }
                }

                handleNodeAdded(curChild);
                curChild = nextSibling;
            }
        }

        function morphEl(fromEl, toEl, childrenOnly) {
            var toElKey = getNodeKey(toEl);
            var curFromNodeKey;

            if (toElKey) {
                // If an element with an ID is being morphed then it is will be in the final
                // DOM so clear it out of the saved elements collection
                delete fromNodesLookup[toElKey];
            }

            if (toNode.isSameNode && toNode.isSameNode(fromNode)) {
                return;
            }

            if (!childrenOnly) {
                if (onBeforeElUpdated(fromEl, toEl) === false) {
                    return;
                }

                morphAttrs(fromEl, toEl);
                onElUpdated(fromEl);

                if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
                    return;
                }
            }

            if (fromEl.nodeName !== 'TEXTAREA') {
                var curToNodeChild = toEl.firstChild;
                var curFromNodeChild = fromEl.firstChild;
                var curToNodeKey;

                var fromNextSibling;
                var toNextSibling;
                var matchingFromEl;

                outer: while (curToNodeChild) {
                    toNextSibling = curToNodeChild.nextSibling;
                    curToNodeKey = getNodeKey(curToNodeChild);

                    while (curFromNodeChild) {
                        fromNextSibling = curFromNodeChild.nextSibling;

                        if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        curFromNodeKey = getNodeKey(curFromNodeChild);

                        var curFromNodeType = curFromNodeChild.nodeType;

                        var isCompatible = undefined;

                        if (curFromNodeType === curToNodeChild.nodeType) {
                            if (curFromNodeType === ELEMENT_NODE) {
                                // Both nodes being compared are Element nodes

                                if (curToNodeKey) {
                                    // The target node has a key so we want to match it up with the correct element
                                    // in the original DOM tree
                                    if (curToNodeKey !== curFromNodeKey) {
                                        // The current element in the original DOM tree does not have a matching key so
                                        // let's check our lookup to see if there is a matching element in the original
                                        // DOM tree
                                        if ((matchingFromEl = fromNodesLookup[curToNodeKey])) {
                                            if (curFromNodeChild.nextSibling === matchingFromEl) {
                                                // Special case for single element removals. To avoid removing the original
                                                // DOM node out of the tree (since that can break CSS transitions, etc.),
                                                // we will instead discard the current node and wait until the next
                                                // iteration to properly match up the keyed target element with its matching
                                                // element in the original tree
                                                isCompatible = false;
                                            } else {
                                                // We found a matching keyed element somewhere in the original DOM tree.
                                                // Let's moving the original DOM node into the current position and morph
                                                // it.

                                                // NOTE: We use insertBefore instead of replaceChild because we want to go through
                                                // the `removeNode()` function for the node that is being discarded so that
                                                // all lifecycle hooks are correctly invoked
                                                fromEl.insertBefore(matchingFromEl, curFromNodeChild);

                                                fromNextSibling = curFromNodeChild.nextSibling;

                                                if (curFromNodeKey) {
                                                    // Since the node is keyed it might be matched up later so we defer
                                                    // the actual removal to later
                                                    addKeyedRemoval(curFromNodeKey);
                                                } else {
                                                    // NOTE: we skip nested keyed nodes from being removed since there is
                                                    //       still a chance they will be matched up later
                                                    removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                                                }

                                                curFromNodeChild = matchingFromEl;
                                            }
                                        } else {
                                            // The nodes are not compatible since the "to" node has a key and there
                                            // is no matching keyed node in the source tree
                                            isCompatible = false;
                                        }
                                    }
                                } else if (curFromNodeKey) {
                                    // The original has a key
                                    isCompatible = false;
                                }

                                isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
                                if (isCompatible) {
                                    // We found compatible DOM elements so transform
                                    // the current "from" node to match the current
                                    // target DOM node.
                                    morphEl(curFromNodeChild, curToNodeChild);
                                }

                            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
                                // Both nodes being compared are Text or Comment nodes
                                isCompatible = true;
                                // Simply update nodeValue on the original node to
                                // change the text value
                                if (curFromNodeChild.nodeValue !== curToNodeChild.nodeValue) {
                                    curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
                                }

                            }
                        }

                        if (isCompatible) {
                            // Advance both the "to" child and the "from" child since we found a match
                            curToNodeChild = toNextSibling;
                            curFromNodeChild = fromNextSibling;
                            continue outer;
                        }

                        // No compatible match so remove the old node from the DOM and continue trying to find a
                        // match in the original DOM. However, we only do this if the from node is not keyed
                        // since it is possible that a keyed node might match up with a node somewhere else in the
                        // target tree and we don't want to discard it just yet since it still might find a
                        // home in the final DOM tree. After everything is done we will remove any keyed nodes
                        // that didn't find a home
                        if (curFromNodeKey) {
                            // Since the node is keyed it might be matched up later so we defer
                            // the actual removal to later
                            addKeyedRemoval(curFromNodeKey);
                        } else {
                            // NOTE: we skip nested keyed nodes from being removed since there is
                            //       still a chance they will be matched up later
                            removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                        }

                        curFromNodeChild = fromNextSibling;
                    }

                    // If we got this far then we did not find a candidate match for
                    // our "to node" and we exhausted all of the children "from"
                    // nodes. Therefore, we will just append the current "to" node
                    // to the end
                    if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
                        fromEl.appendChild(matchingFromEl);
                        morphEl(matchingFromEl, curToNodeChild);
                    } else {
                        var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
                        if (onBeforeNodeAddedResult !== false) {
                            if (onBeforeNodeAddedResult) {
                                curToNodeChild = onBeforeNodeAddedResult;
                            }

                            if (curToNodeChild.actualize) {
                                curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
                            }
                            fromEl.appendChild(curToNodeChild);
                            handleNodeAdded(curToNodeChild);
                        }
                    }

                    curToNodeChild = toNextSibling;
                    curFromNodeChild = fromNextSibling;
                }

                // We have processed all of the "to nodes". If curFromNodeChild is
                // non-null then we still have some from nodes left over that need
                // to be removed
                while (curFromNodeChild) {
                    fromNextSibling = curFromNodeChild.nextSibling;
                    if ((curFromNodeKey = getNodeKey(curFromNodeChild))) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                    } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true /* skip keyed nodes */);
                    }
                    curFromNodeChild = fromNextSibling;
                }
            }

            var specialElHandler = specialElHandlers[fromEl.nodeName];
            if (specialElHandler) {
                specialElHandler(fromEl, toEl);
            }
        } // END: morphEl(...)

        var morphedNode = fromNode;
        var morphedNodeType = morphedNode.nodeType;
        var toNodeType = toNode.nodeType;

        if (!childrenOnly) {
            // Handle the case where we are given two DOM nodes that are not
            // compatible (e.g. <div> --> <span> or <div> --> TEXT)
            if (morphedNodeType === ELEMENT_NODE) {
                if (toNodeType === ELEMENT_NODE) {
                    if (!compareNodeNames(fromNode, toNode)) {
                        onNodeDiscarded(fromNode);
                        morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
                    }
                } else {
                    // Going from an element node to a text node
                    morphedNode = toNode;
                }
            } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) { // Text or comment node
                if (toNodeType === morphedNodeType) {
                    if (morphedNode.nodeValue !== toNode.nodeValue) {
                        morphedNode.nodeValue = toNode.nodeValue;
                    }

                    return morphedNode;
                } else {
                    // Text node to something else
                    morphedNode = toNode;
                }
            }
        }

        if (morphedNode === toNode) {
            // The "to node" was not compatible with the "from node" so we had to
            // toss out the "from node" and use the "to node"
            onNodeDiscarded(fromNode);
        } else {
            morphEl(morphedNode, toNode, childrenOnly);

            // We now need to loop over any keyed nodes that might need to be
            // removed. We only do the removal if we know that the keyed node
            // never found a match. When a keyed node is matched up we remove
            // it out of fromNodesLookup and we use fromNodesLookup to determine
            // if a keyed node has been matched up or not
            if (keyedRemovalList) {
                for (var i=0, len=keyedRemovalList.length; i<len; i++) {
                    var elToRemove = fromNodesLookup[keyedRemovalList[i]];
                    if (elToRemove) {
                        removeNode(elToRemove, elToRemove.parentNode, false);
                    }
                }
            }
        }

        if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
            if (morphedNode.actualize) {
                morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
            }
            // If we had to swap out the from node with a new node because the old
            // node was not compatible with the target node then we need to
            // replace the old DOM node in the original DOM tree. This is only
            // possible if the original DOM node was part of a DOM tree which
            // we know is the case if it has a parent node.
            fromNode.parentNode.replaceChild(morphedNode, fromNode);
        }

        return morphedNode;
    };
}

var morphdom = morphdomFactory(morphAttrs);

var morphdom_1$1 = morphdom;

const cache = [];

var appendStyles = (stylesTemplate, stylesId) => {
  if (!document) {
    return
  }

  const container = document.createElement('div');
  container.innerHTML = stylesTemplate;

  const styles = container.querySelector('style');
  const id = document.getElementById(styles.id) || stylesId;

  if (typeof stylesTemplate === 'string' && !cache.includes(id)) {
    document.head.appendChild(styles);
    cache.push(id);
  }
};

//this file was generated automatically. Do not edit it manually.
appendStyles(`<style>:root{--b-primary-color: #1E88E5;--b-accent-color: #00C853;--b-lightGrey-color: #757575;--b-focus-color: #F9A825;--b-danger-color: #F44336;--b-font-family: Roboto, Tahoma, sans-serif;--b-font-display-4: normal 300 114px var(--b-font-family);--b-font-display-3: normal 400 56px var(--b-font-family);--b-font-display-2: normal 400 45px var(--b-font-family);--b-font-display-1: normal 400 34px var(--b-font-family);--b-font-headline: normal 400 24px var(--b-font-family);--b-font-title: normal 500 20px var(--b-font-family);--b-font-subheading: normal 400 16px var(--b-font-family);--b-font-body-2: normal 500 14px var(--b-font-family);--b-font-body-1: normal 400 14px var(--b-font-family);--b-font-caption: normal 400 12px var(--b-font-family);--b-shadow-1: 0 1px 4px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.24);--b-shadow-2: 0 2px 6px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.23);--b-shadow-3: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23);--b-shadow-4: 0 14px 28px rgba(0,0,0,0.25), 0 10px 10px rgba(0,0,0,0.22);--b-shadow-5: 0 19px 38px rgba(0,0,0,0.30), 0 15px 12px rgba(0,0,0,0.22)}body{font-family:var(--b-font-family)}h1{font:var(--b-font-display-4)}h2{font:var(--b-font-display-3)}h3{font:var(--b-font-display-2)}h4{font:var(--b-font-display-1)}h5{font:var(--b-font-headline)}h6{font:var(--b-font-title)}a{color:var(--b-primary-color)}caption{font:var(--b-font-caption)}</style>`, '@basket/block/styles/index.css')

//this file was generated automatically. Do not edit it manually.
appendStyles(`<style>b-actionButton,b-button,b-dialog,b-form,b-icon,b-input-checkbox,b-input-radio,b-input-switch,b-input-text,b-progress-circular,b-progress-linear,b-table,b-tabs,b-textarea,b-toolbar{all:initial;display:block}</style>`, '@basket/block/styles/initial.css')

function onBeforeElChildrenUpdated (fromEl, toEl) {
  if (fromEl instanceof Block && (fromEl.tagName === toEl.tagName)) {
    fromEl.content = toEl.innerHTML;
    return false
  }

  if (fromEl.tagName === 'SLOT' && toEl.tagName === 'SLOT') {
    return false
  }
}

const morphOptions = {
  childrenOnly: true,
  onBeforeElChildrenUpdated
};

class Block extends window.HTMLElement {
  constructor (props = {}) {
    super();

    Object.assign(this, props);
  }

  static get reflectedProperties () {
    return {}
  }

  static get observedAttributes () {
    return Object.keys(this.reflectedProperties).map(propName => propName.toLowerCase())
  }

  render () {
    this._renderTimeout && clearTimeout(this._renderTimeout);

    if (this._connected) {
      this._renderTimeout = setTimeout(() => morphdom_1$1(this, `<div>${this.template}</div>`, morphOptions), 0);
    } else {
      morphdom_1$1(this, `<div>${this.template}</div>`, morphOptions);
      const slot = this.querySelector('slot');
      slot && (slot.innerHTML = this.content);
      this.renderedCallback();
    }
  }

  get template () {
    return `<div>Block</div>`
  }

  connectedCallback () {
    for (let propName in this.constructor.reflectedProperties) {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), propName) || {};
      const initialValue = this.constructor.reflectedProperties[propName];
      const currentAttribute = this.getAttribute(propName);

      Object.defineProperty(this, propName, {
        configurable: true,
        enumerable: false,
        set: descriptor.set || function (value) {
          if (value === false || value === null) {
            this.removeAttribute(propName);
          } else if (value === true) {
            this.setAttribute(propName, '');
          } else if (typeof value === 'string') {
            this.setAttribute(propName, value);
          } else {
            this.setAttribute(propName, JSON.stringify(value));
          }
        },
        get: descriptor.get || function () {
          const attrValue = this.getAttribute(propName);
          let attrJson;

          if (attrValue === '') {
            attrJson = true;
          } else if (attrValue === null) {
            attrJson = false;
          } else {
            try {
              attrJson = JSON.parse(attrValue);
            } catch (err) {
              attrJson = attrValue;
            }
          }

          return attrJson
        }
      });

      if (currentAttribute === null) {
        this[propName] = initialValue;
      } else if (typeof currentAttribute === 'string' && currentAttribute.length === 0) {
        this[propName] = true;
      } else {
        this[propName] = currentAttribute;
      }
    }

    setTimeout(() => {
      this.content = this.innerHTML;
      this.innerHTML = '';
      this.render();
      this._connected = true;
    }, 0);
  }

  renderedCallback () {

  }

  set content (newContent) {
    const oldContent = this._content;
    const slot = this.querySelector('slot');

    this._content = newContent;

    if (this._connected && slot && (oldContent !== newContent)) {
      morphdom_1$1(slot, `<div>${newContent}</div>`, morphOptions);
    }
  }

  get content () {
    return this._content
  }

  attributeChangedCallback (attrName, oldVal, newVal) {
    if (this._connected && (oldVal !== newVal)) {
      this.render();
    }
  }
}

var template = () => {
  return `
        <form>
            <slot></slot>
        </form>
    `
};

var strictUriEncode = function (str) {
	return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
		return '%' + c.charCodeAt(0).toString(16).toUpperCase();
	});
};

/*
object-assign
(c) Sindre Sorhus
@license MIT
*/

/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

var objectAssign = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

var token = '%[a-f0-9]{2}';
var singleMatcher = new RegExp(token, 'gi');
var multiMatcher = new RegExp('(' + token + ')+', 'gi');

function decodeComponents(components, split) {
	try {
		// Try to decode the entire string first
		return decodeURIComponent(components.join(''));
	} catch (err) {
		// Do nothing
	}

	if (components.length === 1) {
		return components;
	}

	split = split || 1;

	// Split the array in 2 parts
	var left = components.slice(0, split);
	var right = components.slice(split);

	return Array.prototype.concat.call([], decodeComponents(left), decodeComponents(right));
}

function decode(input) {
	try {
		return decodeURIComponent(input);
	} catch (err) {
		var tokens = input.match(singleMatcher);

		for (var i = 1; i < tokens.length; i++) {
			input = decodeComponents(tokens, i).join('');

			tokens = input.match(singleMatcher);
		}

		return input;
	}
}

function customDecodeURIComponent(input) {
	// Keep track of all the replacements and prefill the map with the `BOM`
	var replaceMap = {
		'%FE%FF': '\uFFFD\uFFFD',
		'%FF%FE': '\uFFFD\uFFFD'
	};

	var match = multiMatcher.exec(input);
	while (match) {
		try {
			// Decode as big chunks as possible
			replaceMap[match[0]] = decodeURIComponent(match[0]);
		} catch (err) {
			var result = decode(match[0]);

			if (result !== match[0]) {
				replaceMap[match[0]] = result;
			}
		}

		match = multiMatcher.exec(input);
	}

	// Add `%C2` at the end of the map to make sure it does not replace the combinator before everything else
	replaceMap['%C2'] = '\uFFFD';

	var entries = Object.keys(replaceMap);

	for (var i = 0; i < entries.length; i++) {
		// Replace all decoded components
		var key = entries[i];
		input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
	}

	return input;
}

var decodeUriComponent = function (encodedURI) {
	if (typeof encodedURI !== 'string') {
		throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`');
	}

	try {
		encodedURI = encodedURI.replace(/\+/g, ' ');

		// Try the built in decoder first
		return decodeURIComponent(encodedURI);
	} catch (err) {
		// Fallback to a more advanced decoder
		return customDecodeURIComponent(encodedURI);
	}
};

function encoderForArrayFormat(opts) {
	switch (opts.arrayFormat) {
		case 'index':
			return function (key, value, index) {
				return value === null ? [
					encode(key, opts),
					'[',
					index,
					']'
				].join('') : [
					encode(key, opts),
					'[',
					encode(index, opts),
					']=',
					encode(value, opts)
				].join('');
			};

		case 'bracket':
			return function (key, value) {
				return value === null ? encode(key, opts) : [
					encode(key, opts),
					'[]=',
					encode(value, opts)
				].join('');
			};

		default:
			return function (key, value) {
				return value === null ? encode(key, opts) : [
					encode(key, opts),
					'=',
					encode(value, opts)
				].join('');
			};
	}
}

function parserForArrayFormat(opts) {
	var result;

	switch (opts.arrayFormat) {
		case 'index':
			return function (key, value, accumulator) {
				result = /\[(\d*)\]$/.exec(key);

				key = key.replace(/\[\d*\]$/, '');

				if (!result) {
					accumulator[key] = value;
					return;
				}

				if (accumulator[key] === undefined) {
					accumulator[key] = {};
				}

				accumulator[key][result[1]] = value;
			};

		case 'bracket':
			return function (key, value, accumulator) {
				result = /(\[\])$/.exec(key);
				key = key.replace(/\[\]$/, '');

				if (!result) {
					accumulator[key] = value;
					return;
				} else if (accumulator[key] === undefined) {
					accumulator[key] = [value];
					return;
				}

				accumulator[key] = [].concat(accumulator[key], value);
			};

		default:
			return function (key, value, accumulator) {
				if (accumulator[key] === undefined) {
					accumulator[key] = value;
					return;
				}

				accumulator[key] = [].concat(accumulator[key], value);
			};
	}
}

function encode(value, opts) {
	if (opts.encode) {
		return opts.strict ? strictUriEncode(value) : encodeURIComponent(value);
	}

	return value;
}

function keysSorter(input) {
	if (Array.isArray(input)) {
		return input.sort();
	} else if (typeof input === 'object') {
		return keysSorter(Object.keys(input)).sort(function (a, b) {
			return Number(a) - Number(b);
		}).map(function (key) {
			return input[key];
		});
	}

	return input;
}

var extract = function (str) {
	return str.split('?')[1] || '';
};

var parse = function (str, opts) {
	opts = objectAssign({arrayFormat: 'none'}, opts);

	var formatter = parserForArrayFormat(opts);

	// Create an object with no prototype
	// https://github.com/sindresorhus/query-string/issues/47
	var ret = Object.create(null);

	if (typeof str !== 'string') {
		return ret;
	}

	str = str.trim().replace(/^(\?|#|&)/, '');

	if (!str) {
		return ret;
	}

	str.split('&').forEach(function (param) {
		var parts = param.replace(/\+/g, ' ').split('=');
		// Firefox (pre 40) decodes `%3D` to `=`
		// https://github.com/sindresorhus/query-string/pull/37
		var key = parts.shift();
		var val = parts.length > 0 ? parts.join('=') : undefined;

		// missing `=` should be `null`:
		// http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
		val = val === undefined ? null : decodeUriComponent(val);

		formatter(decodeUriComponent(key), val, ret);
	});

	return Object.keys(ret).sort().reduce(function (result, key) {
		var val = ret[key];
		if (Boolean(val) && typeof val === 'object' && !Array.isArray(val)) {
			// Sort object keys, not values
			result[key] = keysSorter(val);
		} else {
			result[key] = val;
		}

		return result;
	}, Object.create(null));
};

var stringify = function (obj, opts) {
	var defaults = {
		encode: true,
		strict: true,
		arrayFormat: 'none'
	};

	opts = objectAssign(defaults, opts);

	var formatter = encoderForArrayFormat(opts);

	return obj ? Object.keys(obj).sort().map(function (key) {
		var val = obj[key];

		if (val === undefined) {
			return '';
		}

		if (val === null) {
			return encode(key, opts);
		}

		if (Array.isArray(val)) {
			var result = [];

			val.slice().forEach(function (val2) {
				if (val2 === undefined) {
					return;
				}

				result.push(formatter(key, val2, result.length));
			});

			return result.join('&');
		}

		return encode(key, opts) + '=' + encode(val, opts);
	}).filter(function (x) {
		return x.length > 0;
	}).join('&') : '';
};

var queryString = {
	extract: extract,
	parse: parse,
	stringify: stringify
};

class Form extends Block {
  static get tagName () {
    return 'b-form'
  }

  static get reflectedProperties () {
    return {
      action: document.location.pathname
    }
  }

  get template () {
    return template(this)
  }

  connectedCallback () {
    super.connectedCallback();

    this.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
  }

  serialize () {
    const formElement = this;
    const data = {};

    formElement.querySelectorAll('input[name], textarea[name]').forEach(inputElement => {
      const inputName = inputElement.name;
      let inputValue = inputElement.value;

      switch (inputElement.type) {
        case 'radio': {
          const property = data[inputName];
          if (typeof property === 'undefined' || property === false) {
            data[inputName] = inputElement.checked ? inputValue : false;
          }
          break
        }
        case 'checkbox': {
          data[inputName] = inputElement.checked;
          break
        }
        default: {
          data[inputName] = inputValue;
        }
      }
    });

    return data
  }

  submit () {
    const data = this.serialize();
    const errors = this.validate(data);

    if (!errors) {
      return this.save(data)
    } else {
      this.errors = errors;
      return errors
    }
  }

  validate () {
  }

  save (data) {
    document.location.href = `${this.action}?${queryString.stringify(data)}`;
  }
}

window && window.customElements.define(Form.tagName, Form);

var stringifyAttributes = (attributesMap = {}) => {
  return Object.keys(attributesMap).map(key => {
    let value = attributesMap[key];
    let result = '';

    switch (typeof value) {
      case 'string':
        result = `${key}="${value}"`;
        break
      case 'boolean':
        result = value ? key : '';
        break
      default:
        result = `${key}="${JSON.stringify(value)}"`;
    }

    if (!value) {
      result = '';
    }

    return result
  }).join(' ')
};

var template$1 = block => {
  const label = block.label ? `<b-input-text--label>${block.label}</b-input-text--label>` : '';

  const inputAttributes = stringifyAttributes({
    value: block.value,
    type: block.type,
    placeholder: block.placeholder,
    name: block.name,
    autofocus: block.autofocus
  });

  return `
        <input ${inputAttributes} />
        
        <b-input-text--border></b-input-text--border>
        
        ${label}
    `
};

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var keycode = createCommonjsModule(function (module, exports) {
// Source: http://jsfiddle.net/vWx8V/
// http://stackoverflow.com/questions/5603195/full-list-of-javascript-keycodes

/**
 * Conenience method returns corresponding value for given keyName or keyCode.
 *
 * @param {Mixed} keyCode {Number} or keyName {String}
 * @return {Mixed}
 * @api public
 */

exports = module.exports = function(searchInput) {
  // Keyboard Events
  if (searchInput && 'object' === typeof searchInput) {
    var hasKeyCode = searchInput.which || searchInput.keyCode || searchInput.charCode;
    if (hasKeyCode) searchInput = hasKeyCode;
  }

  // Numbers
  if ('number' === typeof searchInput) return names[searchInput]

  // Everything else (cast to string)
  var search = String(searchInput);

  // check codes
  var foundNamedKey = codes[search.toLowerCase()];
  if (foundNamedKey) return foundNamedKey

  // check aliases
  var foundNamedKey = aliases[search.toLowerCase()];
  if (foundNamedKey) return foundNamedKey

  // weird character?
  if (search.length === 1) return search.charCodeAt(0)

  return undefined
};

/**
 * Get by name
 *
 *   exports.code['enter'] // => 13
 */

var codes = exports.code = exports.codes = {
  'backspace': 8,
  'tab': 9,
  'enter': 13,
  'shift': 16,
  'ctrl': 17,
  'alt': 18,
  'pause/break': 19,
  'caps lock': 20,
  'esc': 27,
  'space': 32,
  'page up': 33,
  'page down': 34,
  'end': 35,
  'home': 36,
  'left': 37,
  'up': 38,
  'right': 39,
  'down': 40,
  'insert': 45,
  'delete': 46,
  'command': 91,
  'left command': 91,
  'right command': 93,
  'numpad *': 106,
  'numpad +': 107,
  'numpad -': 109,
  'numpad .': 110,
  'numpad /': 111,
  'num lock': 144,
  'scroll lock': 145,
  'my computer': 182,
  'my calculator': 183,
  ';': 186,
  '=': 187,
  ',': 188,
  '-': 189,
  '.': 190,
  '/': 191,
  '`': 192,
  '[': 219,
  '\\': 220,
  ']': 221,
  "'": 222
};

// Helper aliases

var aliases = exports.aliases = {
  'windows': 91,
  '⇧': 16,
  '⌥': 18,
  '⌃': 17,
  '⌘': 91,
  'ctl': 17,
  'control': 17,
  'option': 18,
  'pause': 19,
  'break': 19,
  'caps': 20,
  'return': 13,
  'escape': 27,
  'spc': 32,
  'pgup': 33,
  'pgdn': 34,
  'ins': 45,
  'del': 46,
  'cmd': 91
};


/*!
 * Programatically add the following
 */

// lower case chars
for (i = 97; i < 123; i++) codes[String.fromCharCode(i)] = i - 32;

// numbers
for (var i = 48; i < 58; i++) codes[i - 48] = i;

// function keys
for (i = 1; i < 13; i++) codes['f'+i] = i + 111;

// numpad keys
for (i = 0; i < 10; i++) codes['numpad '+i] = i + 96;

/**
 * Get by code
 *
 *   exports.name[13] // => 'Enter'
 */

var names = exports.names = exports.title = {}; // title for backward compat

// Create reverse mapping
for (i in codes) names[codes[i]] = i;

// Add aliases
for (var alias in aliases) {
  codes[alias] = aliases[alias];
}
});

//this file was generated automatically. Do not edit it manually.
appendStyles(`<style>b-input-text,b-input-text>input{box-sizing:border-box;font-family:var(--b-font-family);position:relative}b-input-text{min-height:72px;padding-top:20px;padding-bottom:20px;text-align:left;vertical-align:middle;display:inline-block}b-input-text>input{width:100%;font-size:16px;outline:0;background:0 0;display:block;border:0;z-index:2;resize:none;padding:8px 0;transition:background-color .2s}b-input-text>input::placeholder{color:rgba(0,0,0,.38)}b-input-text--label{transform:translate3d(0,26px,0);font-size:16px;color:rgba(0,0,0,.38);transition:font-size .2s,transform .2s,color .2s;position:absolute;z-index:1;left:0;top:4px}b-input-text--border{height:2px;width:100%;display:block;box-sizing:border-box;border-bottom:1px solid rgba(0,0,0,.12);transition:border-color .2s}b-input-text>input:focus~b-input-text--label{font-size:12px;transform:translate3d(0,0,0);color:var(--b-primary-color)}b-input-text>input:focus~b-input-text--border{border-bottom:2px solid var(--b-primary-color)}b-input-text[value] b-input-text--label{font-size:12px;transform:translate3d(0,0,0);color:rgba(0,0,0,.54)}b-input-text[error]>input~b-input-text--label{font-size:12px;transform:translate3d(0,0,0);color:var(--b-danger-color)}b-input-text[error]>input~b-input-text--border{border-bottom:2px solid var(--b-danger-color)}b-input-text[error]::after{content:attr(error);font-size:12px;color:var(--b-danger-color)}</style>`, '@basket/block/b-input-text/styles.css')

class Input extends Block {
  static get tagName () {
    return 'b-input-text'
  }

  static get reflectedProperties () {
    return {
      label: false,
      value: false,
      type: 'text',
      placeholder: false,
      error: false,
      name: false
    }
  }

  get template () {
    return template$1(this)
  }

  get value () {
    return this.getAttribute('value') || false
  }

  set value (value) {
    if (!value) {
      this.removeAttribute('value');
    } else {
      this.setAttribute('value', value);
    }
  }

  connectedCallback () {
    super.connectedCallback();

    this.addEventListener('keyup', e => {
      if (keycode(e.keyCode) === 'enter') {
        return
      }

      const input = e.target;

      this.removeAttribute('error');

      if (input.value) {
        this.setAttribute('value', input.value);
      } else {
        this.removeAttribute('value');
      }
    });
  }
}

window && window.customElements.define(Input.tagName, Input);

var template$2 = block => {
  const tagName = block.href ? 'a' : 'button';

  const buttonAttributes = stringifyAttributes({
    href: block.href,
    type: block.href || block.type
  });

  return `
        <${tagName} ${buttonAttributes}>
            <slot></slot>
        </${tagName}>
    `
};

//this file was generated automatically. Do not edit it manually.
appendStyles(`<style>@keyframes progress-bar-stripes{0%{background-position:40px 0}to{background-position:0 0}}b-button,b-button a,b-button button{position:relative;vertical-align:middle}b-button{font-weight:500;line-height:35px;display:inline-block;height:36px;color:#fff}b-button::before{content:"";position:absolute;top:0;left:0;width:100%;height:100%;background-color:var(--b-primary-color);transition:opacity .2s,box-shadow .2s;border-radius:2px;box-shadow:var(--b-shadow-1)}b-button:hover::before{box-shadow:var(--b-shadow-2)}b-button a,b-button button{color:inherit;display:block;text-transform:uppercase;background:0 0;text-align:center;padding:0 16px;height:100%;cursor:pointer;font-size:14px;user-select:none;border:0;outline:0;font-family:var(--b-font-family);min-width:64px;box-sizing:content-box}b-button input{display:none}b-button[flat][color=accent]{color:var(--b-accent-color)}b-button[flat][color=warning]{color:var(--b-focus-color)}b-button[flat][color=danger]{color:var(--b-danger-color)}b-button[color=accent]::before{background-color:var(--b-accent-color)}b-button[color=warning]::before{background-color:var(--b-focus-color)}b-button[color=danger]::before{background-color:var(--b-danger-color)}b-button[color=white],b-button[flat]{color:var(--b-primary-color)}b-button[color=white]::before{background-color:#fff}b-button[flat]::before{opacity:0;box-shadow:none}b-button[flat]:hover::before{opacity:.12}b-button[disabled]{opacity:.4;pointer-events:none}</style>`, '@basket/block/b-button/styles.css')

class Button extends Block {
  static get tagName () {
    return 'b-button'
  }

  static get reflectedProperties () {
    return {
      color: 'primary',
      type: 'submit',
      disabled: false
    }
  }

  get template () {
    return template$2(this)
  }
}

window && window.customElements.define(Button.tagName, Button);

const validEmailDomains = [
  'ya.ru',
  'yandex.ru',
  'yandex.ua',
  'yandex.by',
  'yandex.kz',
  'yandex.com'
];

const validators = {};

validators.fio = function (value) {
  const parts = value.split(' ');

  if (parts.length !== 3) {
    return false
  }

  return true
};

validators.email = function (value) {
  const parts = value.split('@');

  if (parts.length !== 2) {
    return false
  }

  if (validEmailDomains.indexOf(parts[1]) === -1) {
    return false
  }

  return true
};

validators.phone = function (value) {
  const mask = /^[+]([7])[(]([0-9])([0-9])([0-9])[)]([0-9])([0-9])([0-9])-([0-9])([0-9])-([0-9])([0-9])$/;

  const matches = mask.exec(value);

  if (!matches) {
    return false
  }

  const sum = matches.slice(1).reduce((sum, value) => sum + Number(value), 0);

  return sum <= 30
};

class MyForm extends Form {
  constructor () {
    super(...arguments);

    window.MyForm = {};
    window.MyForm.validate = this.validate.bind(this);
    window.MyForm.submit = this.submit.bind(this);
    window.MyForm.getData = () => this.serialize();
    window.MyForm.setData = (data) => { this.data = data; };
  }

  static get tagName () {
    return 'my-form'
  }

  static get reflectedProperties () {
    return Object.assign({
      errorFields: [],
      data: {},
      result: {},
      progress: false
    }, super.reflectedProperties)
  }

  get template () {
    const {data, errorFields, result, progress} = this;

    return (`
      <form id='myForm'>
        <div>
            <b-input-text ${stringifyAttributes({
              name: 'fio',
              value: data.fio,
              label: 'ФИО',
              error: errorFields.includes('fio')
            })}></b-input-text>
        </div>
        <div>
            <b-input-text ${stringifyAttributes({
              name: 'email',
              value: data.email,
              label: 'Email',
              error: errorFields.includes('email')
            })}></b-input-text>
        </div>
        <div>
            <b-input-text ${stringifyAttributes({
              name: 'phone',
              value: data.phone,
              label: 'Phone',
              error: errorFields.includes('phone')
            })}></b-input-text>
        </div>
        <div>
            <b-button ${stringifyAttributes({disabled: progress})} id='submitButton'>Save</b-button>
            <div id='resultContainer' class='${result.status}'>
              ${result.status === 'success' ? 'Success' : ''}
              ${result.status === 'error' ? result.reason : ''}
              ${result.status === 'progress' ? `Repeat in ${result.timeout} ms` : ''}
            </div>
        </div>
      </form>
    `)
  }

  validate (data) {
    const formData = data || this.serialize();

    const result = {
      isValid: true,
      errorFields: []
    };

    for (let key in formData) {
      const value = formData[key];
      const isValid = validators[key](value);

      !isValid && result.errorFields.push(key);
    }

    if (result.errorFields.length) {
      result.isValid = false;
    }

    return result
  }

  submit () {
    this.errorFields = [];
    this.result = {};
    this.data = this.serialize();
    const validation = this.validate(this.data);

    if (validation.isValid) {
      this.save(this.data);
    } else {
      this.errorFields = validation.errorFields;
    }
  }

  save (data) {
    this.progress = true;
    const formData = data || this.serialize();

    window.fetch(this.action, {
      method: 'POST',
      body: JSON.stringify(formData)
    })
      .then(res => res.json())
      .then(json => {
        this.result = json;

        if (json.status === 'progress') {
          setTimeout(this.submit.bind(this), json.timeout);
        }

        this.progress = false;
      })
      .catch(err => {
        this.result = {
          status: 'error',
          reason: err
        };

        this.progress = true;
      });
  }
}

window.customElements.define(MyForm.tagName, MyForm);

}());
//# sourceMappingURL=index.js.map
