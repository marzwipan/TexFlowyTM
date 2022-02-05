// ==UserScript==
// @name         TeXFlowy
// @namespace    https://github.com/marzwipan
// @version      0.1.2.2
// @description  Supports formula rendering in WorkFlowy with KaTeX
// @author       Marzwipan
// @match        https://workflowy.com/*
// @match        https://*.workflowy.com/*
// @run-at       document-idle
// @require      https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/contrib/auto-render.min.js
// @resource     KATEX_CSS https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/katex.min.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// Newest addition: Try to use blur and focus
// ==/UserScript==

// ESLint globals from WorkFlowy:
/*
global WF:false
*/

(function () {
	'use strict';

    const katex_css = GM_getResourceText("KATEX_CSS");

 /**
 * Transforms the katex required CSS for use from within Tampermonkey
 *
 * @param {string} css the katex CSS
 */
    function transformCss(css) {
        if (typeof css !== "string") {
            throw new TypeError("Argument css must be of type string");
        }

        return css
            .toString()
            .replace(/\.woff2\)/g, '.woff2")')
            .replace(/\.woff\)/g, '.woff")')
            .replace(/\.ttf\)/g, '.ttf")')
            .replace(
            /fonts\//g,
            '"https://cdn.jsdelivr.net/npm/katex@0.15.2/dist/fonts/'
        );
    }

    const katex_css_trafo = transformCss(katex_css);
    GM_addStyle(katex_css_trafo);

    // Set these to how you want inline and display math to be delimited.
    const defaultCopyDelimiters = {
        inline: ['$', '$'],
        // alternative: ['\(', '\)']
        display: ['$$', '$$'],
        // alternative: ['\[', '\]']
    };

    // Replace .katex elements with their TeX source (<annotation> element).
    // Modifies fragment in-place.
    function katexReplaceWithTex(fragment, copyDelimiters = defaultCopyDelimiters) {
        var formulatext
        // Remove .katex-html blocks that are preceded by .katex-mathml blocks
        // (which will get replaced below).
        const katexHtml = fragment.querySelectorAll('.katex-mathml + .katex-html');
        for (let i = 0; i < katexHtml.length; i++) {
            const element = katexHtml[i];
            if (element.remove) {
                element.remove(null);
            } else {
                element.parentNode.removeChild(element);
            }
        }
        // Replace .katex-display elements with their annotation (TeX source)
        // descendant, with display delimiters.
        const katexdisplays = fragment.querySelectorAll('.katex-display');
        for (let i = 0; i < katexdisplays.length; i++) {
            const element = katexdisplays[i];
            const texSource = element.querySelector('annotation');
            formulatext = texSource.innerHTML;
            formulatext = copyDelimiters.display[0] + formulatext + copyDelimiters.display[1];
            element.parentNode.outerHTML = formulatext;
        }

        // Replace remaining .katex elements with their annotation (TeX source)
        // descendant, with inline delimiters.
        const katexblock = fragment.querySelectorAll('.katex');
        for (let i = 0; i < katexblock.length; i++) {
            const element = katexblock[i];
            const texSource = element.querySelector('annotation');
            if (texSource) {
                formulatext = texSource.innerHTML;
                formulatext = copyDelimiters.inline[0] + formulatext + copyDelimiters.inline[1];
                element.parentNode.outerHTML = formulatext;
            }
        }

        return fragment;
    };

    var oldfocusedItemID, currentID;

/**
 * Renders all math blocks by calling Katex's {@function renderMathInElement}.
 *
 * @param {HTMLElement} renderEl
 */
    function renderMathViaKatex(renderEl) {
        renderMathInElement(renderEl, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "$", right: "$", display: false },
                { left: "\\(", right: "\\)", display: false },
                { left: "\\[", right: "\\]", display: true },
            ],
            throwOnError: false,
            strict: false
        });
    }

 /**
 * Renders all math in the `app` element by calling the required
 * functions sequentially.
 */
    function renderMath() {
        const currentItem = WF.currentItem();
        if (!currentItem) {
            console.log('ohoho');
            return;
        };
        const currentElem = currentItem.getElement();
        if (!currentElem) {
            return;
        };
        renderMathViaKatex(currentElem);
        const allcontent = currentElem.querySelectorAll('.content');
        for (const content of allcontent) {
            if (content.querySelector('.katex')) {
                content.onblur =  function (e) {
                    console.log('content blur');
                    renderMathViaKatex(content);
                };
                content.onfocus = function (e) {
                    console.log('content focus');
                    const texelement = katexReplaceWithTex(content);
                };
            };
        };
        const allnotes = currentElem.querySelectorAll('.notes');
        for (const note of allnotes) {
            if (note.querySelector('.katex')) {
                const notecontent = note.querySelector('.content');
                notecontent.style.display = 'block';
                notecontent.style.height = 'auto';
                notecontent.style.maxHeight = 'none';
                notecontent.style.overflow = 'visible';
            };
        };
        //   const all_latex_notes = appEl.querySelectorAll('.notes .content')
    }

   /**
   * @param {function} callbackFn Function to call when the document is loaded,
   *                              of type () -> void.
   * @returns {void}
   * Notes:
   * Caveats:
   * - If multiple functions are passed to this method, the callbacks
   *   will be run in an undefined order.
   */
    function callAfterDocumentLoaded(callbackFn) {
        let isLoaded = false;
        let rootItem = null;
        const timeoutMs = 350;

        if (typeof WF !== "undefined" && WF !== null) {
            if (WF.rootItem !== undefined && WF.rootItem !== null) {
                try {
                    rootItem = WF.rootItem();
                } catch (er) {
                    // This is expected while waiting for the document to load
                }
                if (rootItem !== null) {
                    isLoaded = true;
                }
            }
        }
        if (isLoaded) {
            console.log("Document now loaded. Calling function.");
            callbackFn();
        } else {
            console.log(`Document not yet loaded. Waiting for ${timeoutMs}ms.`);
            const repeat = () => callAfterDocumentLoaded(callbackFn);
            setTimeout(repeat, timeoutMs);
        }
    }


    /**
   * Global event listener.
   * @param {string} eventName The name of the event.
   * @returns {void}
   */
    function wfEventListener(eventObject) {
        if (eventObject.keyCode == 13 && eventObject.altKey) {
            setTimeout(() => {renderMath();},0);
            return;
        } else if (eventObject.keyCode == 8) {
            if (document.getSelection().anchorOffset == 0) {
                const previousitem = WF.focusedItem().getPreviousVisibleSibling();
                if (previousitem === null) {
                    console.log('AHA')
                } else {
                    const previouselement = previousitem.getElement();
                    if (previouselement !== null) {
                        if (!previouselement.querySelector('.katex-mathml')) {
                            // default action OK if no .katex-mathml elements
                            return;
                        }
                        const previouselementclean = katexReplaceWithTex(previouselement);
                    };
                };
            };
        };
        setTimeout(() => {
            const focusedItem = WF.focusedItem();
            if (focusedItem === null) {
                return;
            };
            if (eventObject.keyCode == 13) {
                oldfocusedItemID = WF.focusedItem().getPreviousVisibleSibling().getId();
            };
            currentID = focusedItem.getId();
            const focusedelement = focusedItem.getElement();
            if (currentID != oldfocusedItemID)
            {
                const oldfocusItem = WF.getItemById(oldfocusedItemID);
                if (oldfocusItem !== null) {
                    const oldfocuselement = oldfocusItem.getElement();
                    if (oldfocuselement !== null) {
                        console.log('Old: ');
                        console.log(oldfocusedItemID);
                        console.log('New: ');
                        console.log(currentID);
                        renderMathViaKatex(oldfocuselement);
                        const allcontent = oldfocuselement.querySelectorAll('.content');
                        for (const content of allcontent) {
                            if (content.querySelector('.katex')) {
                                content.onblur =  function (e) {
                                    console.log('content blur');
                                    renderMathViaKatex(content);
                                };
                                content.onfocus = function (e) {
                                    console.log('content focus');
                                    const texelement = katexReplaceWithTex(content);
                                };
                            };
                        };
                        const allnotes = oldfocuselement.querySelectorAll('.notes');
                        for (let i = 0; i< allnotes.length; i++) {
                            if (allnotes[i].querySelector('.katex')) {
                                console.log(allnotes[i]);
                                allnotes[i].querySelector('.content').style.display = 'block';
                                allnotes[i].querySelector('.content').style.height = 'auto';
                                allnotes[i].querySelector('.content').style.maxHeight = 'none';
                                allnotes[i].querySelector('.content').style.overflow = 'visible';
                            };
                        };
                    };
                };
            };
            oldfocusedItemID = currentID;
            if (!focusedelement.querySelector('.katex-mathml')) {
                // default action OK if no .katex-mathml elements
                return;
            }
            const texelement = katexReplaceWithTex(focusedelement);
        },0);
    }

    function watchpage() {
        // watch the page, so that the rendering is updated when new contents come in as the user edits or navigates. Make sure that the currently focusedItem is in plain tex, not rendered.
        const observer = new MutationObserver(function (mutationlist) {
            if (WF.focusedItem()) {
                currentID = WF.focusedItem().getId();
                if (currentID != oldfocusedItemID) {
                    const changeevent = new Event('change');
                    console.log('CHANGE event');
                    wfEventListener(changeevent);
                };
            };
        });
        observer.observe(document.body, { childList: true, subtree: true });
    };


    callAfterDocumentLoaded(renderMath);
    callAfterDocumentLoaded(() => {
        oldfocusedItemID = WF.currentItem().getId();
        currentID = oldfocusedItemID;
    });
      document.addEventListener("keydown",wfEventListener);
//    document.addEventListener("click",wfEventListener);
//    callAfterDocumentLoaded(watchpage);

})();
