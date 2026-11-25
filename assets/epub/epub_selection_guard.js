// 長按選字時補查選取，選取中禁止左右手勢。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// Block or unblock gestures using CSS touch-action when selection is active
function blockGesturesWhenSelected(block) {
  try {
    var styleId = 'epub-selection-block-style';
    var existingStyle = document.getElementById(styleId);

    if (block) {
      // 選取中唔好捲頁，亦唔好左右翻頁。
      if (!existingStyle) {
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          body, html, #viewer {
            touch-action: none !important;
            -ms-touch-action: none !important;
            -webkit-touch-callout: none !important;
            user-select: text !important;
          }
          body *, html *, #viewer * {
            touch-action: none !important;
            -ms-touch-action: none !important;
            user-select: text !important;
          }
          iframe {
            touch-action: none !important;
            -ms-touch-action: none !important;
            pointer-events: auto !important;
          }
          /* Block all horizontal gestures on iframes */
          iframe[src], iframe[srcdoc] {
            touch-action: none !important;
            -ms-touch-action: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Function to apply touch-action to iframes
      function applyTouchActionToIframes() {
        try {
          var allIframes = document.querySelectorAll('iframe');
          allIframes.forEach(function (iframe) {
            iframe.style.touchAction = 'none';
            iframe.style.setProperty('-ms-touch-action', 'none', 'important');
            iframe.style.setProperty('touch-action', 'none', 'important');
          });
        } catch (e) {
          console.error('Error setting iframe touch-action:', e);
        }

        // Also try to get iframes from epub.js rendition
        if (typeof rendition !== 'undefined' && rendition) {
          try {
            var allContents = rendition.getContents();
            allContents.forEach(function (contents) {
              try {
                // Get the iframe element from the parent document
                var iframe = contents.document.defaultView.frameElement;
                if (iframe && iframe.style) {
                  iframe.style.touchAction = 'none';
                  iframe.style.setProperty('-ms-touch-action', 'none', 'important');
                  iframe.style.setProperty('touch-action', 'none', 'important');
                }
              } catch (e) {
                // Ignore errors - iframe might be sandboxed
              }
            });
          } catch (e) {
            // Ignore errors
          }
        }
      }

      // Apply immediately
      applyTouchActionToIframes();

      // Watch for new iframes being added (epub.js creates them dynamically)
      if (!window.epubIframeObserver) {
        window.epubIframeObserver = new MutationObserver(function (mutations) {
          applyTouchActionToIframes();
        });
        window.epubIframeObserver.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });
      }
    } else {
      // Remove blocking when selection is cleared
      if (existingStyle) {
        existingStyle.remove();
      }

      // Stop observing if observer exists
      if (window.epubIframeObserver) {
        window.epubIframeObserver.disconnect();
        window.epubIframeObserver = null;
      }

      // Reset iframe styles
      try {
        var allIframes = document.querySelectorAll('iframe');
        allIframes.forEach(function (iframe) {
          iframe.style.touchAction = '';
          iframe.style.removeProperty('-ms-touch-action');
          iframe.style.removeProperty('touch-action');
        });
      } catch (e) {
        // Ignore errors
      }

      // Reset epub.js iframe styles
      if (typeof rendition !== 'undefined' && rendition) {
        try {
          var allContents = rendition.getContents();
          allContents.forEach(function (contents) {
            try {
              var iframe = contents.document.defaultView.frameElement;
              if (iframe && iframe.style) {
                iframe.style.touchAction = '';
                iframe.style.removeProperty('-ms-touch-action');
                iframe.style.removeProperty('touch-action');
              }
            } catch (e) {
              // Ignore errors
            }
          });
        } catch (e) {
          // Ignore errors
        }
      }
    }
  } catch (e) {
    console.error('Error blocking gestures:', e);
  }
}

// Check selection after long press (for iPad support)
function checkSelectionAfterLongPress() {
  try {
    // Check all content frames
    if (typeof rendition !== 'undefined' && rendition) {
      var allContents = rendition.getContents();
      allContents.forEach(function (contents, idx) {
        try {
          var selection = contents.window.getSelection();
          if (selection && selection.rangeCount > 0) {
            var range = selection.getRangeAt(0);
            var text = selection.toString();
            if (text && range && !range.collapsed) {
              // Try to get CFI
              if (typeof contents.cfiFromRange === 'function') {
                try {
                  var cfiRange = contents.cfiFromRange(range);
                  if (cfiRange) {
                    // Store this CFI to track changes
                    window.lastProcessedCfi = cfiRange.toString();

                    // Call sendSelectionData if it exists (it should be globally available)
                    if (typeof window.sendSelectionData === 'function') {
                      try {
                        window.sendSelectionData(cfiRange, contents);
                      } catch (e) {
                        // Fallback to direct handler call with manual rect calculation
                        try {
                          var rect = null;
                          if (range) {
                            var clientRect = range.getBoundingClientRect();
                            var webViewWidth = window.innerWidth;
                            var webViewHeight = window.innerHeight;
                            var iframe = contents.document.defaultView.frameElement;
                            if (iframe) {
                              var iframeRect = iframe.getBoundingClientRect();
                              var absoluteLeft = iframeRect.left + clientRect.left;
                              var absoluteTop = iframeRect.top + clientRect.top;
                              rect = {
                                left: absoluteLeft / webViewWidth,
                                top: absoluteTop / webViewHeight,
                                width: clientRect.width / webViewWidth,
                                height: clientRect.height / webViewHeight,
                                contentHeight: webViewHeight
                              };
                            }
                          }
                          window.flutter_inappwebview.callHandler('selection', cfiRange.toString(), text, rect, null);
                        } catch (e2) {
                          window.flutter_inappwebview.callHandler('selection', cfiRange.toString(), text, null, null);
                        }
                      }
                    } else {
                      // Try to get rect manually as fallback
                      try {
                        var rect = null;
                        if (range) {
                          var clientRect = range.getBoundingClientRect();
                          var webViewWidth = window.innerWidth;
                          var webViewHeight = window.innerHeight;
                          var iframe = contents.document.defaultView.frameElement;
                          if (iframe) {
                            var iframeRect = iframe.getBoundingClientRect();
                            var absoluteLeft = iframeRect.left + clientRect.left;
                            var absoluteTop = iframeRect.top + clientRect.top;
                            rect = {
                              left: absoluteLeft / webViewWidth,
                              top: absoluteTop / webViewHeight,
                              width: clientRect.width / webViewWidth,
                              height: clientRect.height / webViewHeight,
                              contentHeight: webViewHeight
                            };
                          }
                        }
                        window.flutter_inappwebview.callHandler('selection', cfiRange.toString(), text, rect, null);
                      } catch (e) {
                        window.flutter_inappwebview.callHandler('selection', cfiRange.toString(), text, null, null);
                      }
                    }
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }
      });

      // Also check parent window
      try {
        var parentSel = window.getSelection();
        if (parentSel && parentSel.rangeCount > 0) {
          var parentText = parentSel.toString();
          if (parentText) {
            // Try to match to a content frame
            allContents.forEach(function (contents, idx) {
              try {
                var range = parentSel.getRangeAt(0);
                if (range && !range.collapsed && typeof contents.cfiFromRange === 'function') {
                  var cfiRange = contents.cfiFromRange(range);
                  if (cfiRange) {
                    if (typeof window.sendSelectionData === 'function') {
                      window.sendSelectionData(cfiRange, contents);
                    } else {
                      window.flutter_inappwebview.callHandler('selection', cfiRange.toString(), parentText, null, null);
                    }
                  }
                }
              } catch (e) {
                // Try next frame
              }
            });
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

// Check selection periodically (for tracking selection changes when handles are dragged)
function checkSelectionPeriodically() {
  try {
    if (typeof rendition !== 'undefined' && rendition) {
      var allContents = rendition.getContents();
      var foundSelection = false;
      allContents.forEach(function (contents, idx) {
        try {
          var selection = contents.window.getSelection();
          if (selection && selection.rangeCount > 0) {
            var range = selection.getRangeAt(0);
            var text = selection.toString();
            if (text && range && !range.collapsed) {
              foundSelection = true;
              // Check if this is a new/different selection
              if (typeof contents.cfiFromRange === 'function') {
                try {
                  var cfiRange = contents.cfiFromRange(range);
                  if (cfiRange) {
                    var cfiString = cfiRange.toString();
                    // Only process if CFI changed (selection was modified)
                    if (cfiString !== window.lastProcessedCfi) {
                      window.lastProcessedCfi = cfiString;
                      if (typeof window.sendSelectionData === 'function') {
                        window.sendSelectionData(cfiRange, contents);
                      }
                    }
                  }
                } catch (e) {
                  // Ignore errors
                }
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }
      });

      // Also check parent window
      try {
        var parentSel = window.getSelection();
        if (parentSel && parentSel.rangeCount > 0) {
          var parentText = parentSel.toString();
          if (parentText) {
            foundSelection = true;
            var allContents = rendition.getContents();
            allContents.forEach(function (contents, idx) {
              try {
                var range = parentSel.getRangeAt(0);
                if (range && !range.collapsed && typeof contents.cfiFromRange === 'function') {
                  var cfiRange = contents.cfiFromRange(range);
                  if (cfiRange) {
                    var cfiString = cfiRange.toString();
                    if (cfiString !== window.lastProcessedCfi) {
                      window.lastProcessedCfi = cfiString;
                      if (typeof window.sendSelectionData === 'function') {
                        window.sendSelectionData(cfiRange, contents);
                      }
                    }
                  }
                }
              } catch (e) {
                // Try next frame
              }
            });
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

// Check if selection still exists and re-apply blocking if needed
function checkSelectionAndReapplyBlocking() {
  try {
    // Check if selection still exists
    var hasSelection = false;

    if (typeof rendition !== 'undefined' && rendition) {
      var allContents = rendition.getContents();
      for (var i = 0; i < allContents.length; i++) {
        try {
          var contents = allContents[i];
          if (contents.window && contents.window.getSelection) {
            var selection = contents.window.getSelection();
            if (selection && selection.rangeCount > 0) {
              var range = selection.getRangeAt(0);
              var text = selection.toString();
              if ((text && text.length > 0) || (range && !range.collapsed)) {
                hasSelection = true;
                break;
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }

    // Also check parent window
    if (!hasSelection && window.getSelection) {
      var parentSel = window.getSelection();
      if (parentSel && parentSel.rangeCount > 0) {
        var parentRange = parentSel.getRangeAt(0);
        var parentText = parentSel.toString();
        if ((parentText && parentText.length > 0) || (parentRange && !parentRange.collapsed)) {
          hasSelection = true;
        }
      }
    }

    // If selection exists, ensure blocking is still active
    if (hasSelection) {
      var styleId = 'epub-selection-block-style';
      var existingStyle = document.getElementById(styleId);

      if (!existingStyle) {
        // 擋手勢的樣式被清走就再裝上。選取中唔好捲頁，亦唔好左右翻頁。
        var style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          body, html, #viewer {
            touch-action: none !important;
            -ms-touch-action: none !important;
            -webkit-touch-callout: none !important;
            user-select: text !important;
          }
          body *, html *, #viewer * {
            touch-action: none !important;
            -ms-touch-action: none !important;
            user-select: text !important;
          }
          iframe {
            touch-action: none !important;
            -ms-touch-action: none !important;
            pointer-events: auto !important;
          }
          iframe[src], iframe[srcdoc] {
            touch-action: none !important;
            -ms-touch-action: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Re-apply to iframes
      try {
        var allIframes = document.querySelectorAll('iframe');
        allIframes.forEach(function (iframe) {
          iframe.style.touchAction = 'none';
          iframe.style.setProperty('-ms-touch-action', 'none', 'important');
          iframe.style.setProperty('touch-action', 'none', 'important');
        });
      } catch (e) {
        // Ignore errors
      }
    } else {
      // No selection, stop monitoring
      return 'no-selection';
    }
  } catch (e) {
    console.error('Error checking selection:', e);
  }
}

