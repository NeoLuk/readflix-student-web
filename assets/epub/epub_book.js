// 開書、關掉上一本、產生閱讀位置。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// Destroys the previous book so loading another one in the same view does not
// leak its rendition, iframes and unzipped archive.
function teardownBook() {
  if (!rendition && !book.isOpen) return;
  // The rendition is destroyed on its own first: epub.js's view manager can
  // throw while destroying a view that has not finished attaching, and that
  // must not stop the book (archive, spine, resources) from being released.
  if (rendition) {
    try {
      rendition.destroy();
    } catch (e) {
      // Released below regardless.
    }
    book.rendition = undefined;
  }
  try {
    book.destroy();
  } catch (e) {
    console.error('Error destroying previous book:', e);
  }
  // Whatever the destroy calls left behind, the old book's views must not
  // stay on screen under the new one.
  var viewer = document.getElementById('viewer');
  if (viewer) viewer.innerHTML = '';
  book = ePub();
  rendition = null;
  displayed = null;
  chapters = [];
  bookOpenAs = null;
  warmedPageUrls = {};
  warmedByHref = {};
  spreadAnchor = null;
  spreadAligning = false;
}

var LOCATIONS_PAUSE_MS = 10;
var LOCATIONS_PREFETCH = 4;

// Wraps the chapter request used by location generation so the next few
// chapters are already being fetched while the current one is parsed.
// epub.js loads them strictly one after another, and on Android every
// served request goes through the platform channel, so without this the
// per-request latency adds up over hundreds of chapters.
function prefetchingRequest(load) {
  var urls = [];
  book.spine.each(function (section) {
    if (section.linear) urls.push(section.url);
  });
  var pending = {};
  return function (url) {
    var index = urls.indexOf(url);
    for (var k = index + 1; index >= 0 && k <= index + LOCATIONS_PREFETCH && k < urls.length; k++) {
      if (!pending[urls[k]]) {
        pending[urls[k]] = load(urls[k]);
        // Failures surface when the chapter is actually requested.
        pending[urls[k]].catch(function () {});
      }
    }
    var request = pending[url] || load(url);
    delete pending[url];
    return request;
  };
}

// Loads serialized locations when given, skipping generation (which parses
// every chapter). Otherwise generates them and, if asked, sends them to Dart
// to be cached. An unusable cache falls back to generating.
function loadOrGenerateLocations(cached, report) {
  if (cached) {
    try {
      var parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        book.locations.load(parsed);
        return Promise.resolve();
      }
    } catch (e) {
      console.error('Ignoring unreadable cached locations:', e);
    }
  }
  // epub.js waits `pause` ms (default 100) after every chapter to keep the
  // page responsive, which alone makes a 300-chapter book take 30 s. Parsing
  // one chapter is short, so a 10 ms yield keeps rendering smooth.
  book.locations.pause = LOCATIONS_PAUSE_MS;
  book.locations.request = prefetchingRequest(book.locations.request);
  return book.locations.generate(1600).then(function () {
    if (report) {
      window.flutter_inappwebview.callHandler('locationsGenerated', book.locations.save());
    }
  });
}

function reportLoadError(error) {
  console.error('Error opening book:', error);
  // epub.js rejects with an Error, an XHR `{status, message}` object, or a
  // ProgressEvent when the request itself failed.
  var message = (error && error.message) ||
    (error && typeof error.status === 'number' ? 'HTTP ' + error.status : null) ||
    (error && error.type ? 'request ' + error.type : null) ||
    String(error);
  window.flutter_inappwebview.callHandler('loadError', message);
}

// Loads and renders a book. `opts` is a settings object (see the Dart
// EpubViewer.loadBook for the exact keys) — replaces the old 16 positional args.
function loadBook(data, opts) {
  opts = opts || {};
  // Base URL of the book on the local server (see EpubBookServer). When set,
  // `data` is null and epub.js opens the book as an unpacked directory.
  var bookUrl = opts.url || null;
  var openAs = opts.openAs || null;
  var cfi = opts.cfi || "";
  var initialXPath = opts.initialXPath || null;
  var manager = opts.manager;
  var flow = opts.flow;
  var spread = opts.spread;
  var snap = opts.snap;
  var allowScriptedContent = opts.allowScriptedContent;
  var direction = opts.direction;
  var useCustomSwipe = opts.useCustomSwipe;
  var backgroundColor = opts.backgroundColor;
  var foregroundColor = opts.foregroundColor;
  var fontSize = opts.fontSize;
  var clearSelectionOnNav = opts.clearSelectionOnPageChange;
  var selectAnnotationRangeParam = opts.selectAnnotationRange;
  var customCss = opts.customCss;
  // Platform capability: whether to run the iOS/iPad selection-polling
  // fallbacks. Off on web/desktop where `selectionchange` fires reliably.
  var usePolling = opts.usePolling !== undefined ? opts.usePolling : true;
  interceptFootnotes = !!opts.interceptFootnotes;
  // Serialized locations from a previous run (see EpubViewer.initialLocations).
  var cachedLocations = opts.cachedLocations || null;
  var reportLocations = !!opts.reportLocations;
  var loadToken = ++currentLoadToken;

  teardownBook();

  // Reset flags for new book
  initialXPathProcessed = false;
  xpathDisplayInProgress = false;
  initialPositionLoading = false;
  // Store the clearSelectionOnPageChange setting
  clearSelectionOnPageChange = clearSelectionOnNav !== undefined ? clearSelectionOnNav : true;
  // Store the selectAnnotationRange setting
  selectAnnotationRange = selectAnnotationRangeParam !== undefined ? selectAnnotationRangeParam : false;
  var viewer = document.getElementById('viewer');
  if (viewer) viewer.style.height = '100%';
  var opening;
  if (bookUrl) {
    // Served by URL: epub.js fetches only what it displays, and images and
    // fonts load as ordinary URLs (no blob-URL replacement pass).
    // `openAs: "directory"` is a remote unpacked folder. Leave zip-server
    // URLs to determineType, which already treats a trailing slash as one.
    opening = openAs ? book.open(bookUrl, openAs) : book.open(bookUrl);
  } else {
    // `data` is a base64 string on mobile (compact transfer over the JS
    // bridge) or a typed array / byte array on web. Normalize to a Uint8Array.
    var uint8Array;
    if (typeof data === 'string') {
      var binary = atob(data);
      uint8Array = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) uint8Array[i] = binary.charCodeAt(i);
    } else {
      uint8Array = new Uint8Array(data);
    }
    opening = book.open(uint8Array);
  }
  opening.catch(function (e) {
    if (loadToken === currentLoadToken) reportLoadError(e);
  });
  rendition = book.renderTo("viewer", {
    manager: manager,
    flow: flow,
    spread: spread,
    width: "100vw",
    height: "100vh",
    snap: snap && !useCustomSwipe,
    allowScriptedContent: allowScriptedContent,
    defaultDirection: direction
  });

  // Apply initial theme
  updateTheme(backgroundColor, foregroundColor, customCss);

  // Initial display - skip if we have XPath (we'll display after conversion)
  // If we have XPath, we'll display after converting it, so skip initial display
  if (initialXPath) {
    // Just display the default location, we'll navigate to XPath after conversion
    displayed = rendition.display()
    // XPath conversion will happen later in book.ready, callback will be fired there
  } else if (cfi) {
    // CFI display happens immediately, so fire callback now
    initialPositionLoading = true;
    try {
      window.flutter_inappwebview.callHandler('initialPositionLoading', { type: 'cfi' });
    } catch (e) {
      console.error('Error calling initialPositionLoading callback:', e);
    }
    displayed = rendition.display(cfi)
  } else {
    displayed = rendition.display()
  }

  // Setup blocking immediately after rendition is created
  // Use setTimeout to ensure rendition object is fully initialized
  setTimeout(function () {
    setupRenditionBlocking();
  }, 100);

  rendition.on("displayed", function (renderer) {
    window.flutter_inappwebview.callHandler('displayed');
    // If we were loading initial position, notify that it's complete
    if (initialPositionLoading) {
      initialPositionLoading = false;
      try {
        window.flutter_inappwebview.callHandler('initialPositionLoaded');
      } catch (e) {
        console.error('Error calling initialPositionLoaded callback:', e);
      }
    }
    // Setup blocking again to ensure it's active (in case it wasn't set up earlier)
    setupRenditionBlocking();
  });

  // Reset selection state tracking (use global variables)
  selectionTimeout = null;
  isSelecting = false;
  lastCfiRange = null;
  hasSentSelection = false;

  // Helper function to check and process selection
  function checkAndProcessSelection(contents) {
    try {
      // Try contents window first
      var selection = contents.window.getSelection();
      var range = null;
      var selectedText = '';

      if (selection && selection.rangeCount > 0) {
        try {
          range = selection.getRangeAt(0);
          selectedText = selection.toString();
        } catch (e) {
          // Ignore errors
        }
      }

      // If no selection in contents, try parent window (iPad sometimes puts it there)
      if ((!selectedText || !range || range.collapsed) && window.getSelection) {
        try {
          var parentSelection = window.getSelection();
          if (parentSelection && parentSelection.rangeCount > 0) {
            var parentRange = parentSelection.getRangeAt(0);
            var parentText = parentSelection.toString();
            // Check if parent selection is actually in the epub content
            if (parentText && !parentRange.collapsed) {
              // Try to find which iframe this selection is in
              var iframe = contents.document.defaultView.frameElement;
              if (iframe && parentRange.commonAncestorContainer) {
                // Check if the selection is within our iframe
                try {
                  if (iframe.contentDocument &&
                    (iframe.contentDocument === parentRange.commonAncestorContainer.ownerDocument ||
                      iframe.contentDocument.contains(parentRange.commonAncestorContainer))) {
                    selection = parentSelection;
                    range = parentRange;
                    selectedText = parentText;
                  }
                } catch (e) {
                  // Cross-origin or other error, try anyway
                  selection = parentSelection;
                  range = parentRange;
                  selectedText = parentText;
                }
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }
      }

      if (!selection || !range || selection.rangeCount === 0) {
        return false;
      }

      if (!selectedText || range.collapsed) {
        return false;
      }

      // If we already have this selection, don't process again
      if (isSelecting && lastCfiRange) {
        return true;
      }

      // Try to get CFI from range using epub.js API
      try {
        if (typeof contents.cfiFromRange === 'function') {
          var cfiRange = contents.cfiFromRange(range);
          if (cfiRange) {
            lastCfiRange = cfiRange;
            isSelecting = true;
            // Clear any existing timeout
            if (selectionTimeout) {
              clearTimeout(selectionTimeout);
            }
            // Debounce to allow selection to stabilize
            selectionTimeout = setTimeout(function () {
              // Verify selection still exists before sending
              var stillHasSelection = false;
              try {
                var currentSelection = contents.window.getSelection();
                if (currentSelection && currentSelection.rangeCount > 0) {
                  var currentRange = currentSelection.getRangeAt(0);
                  var currentText = currentSelection.toString();
                  if (currentText && currentRange && !currentRange.collapsed) {
                    stillHasSelection = true;
                  }
                }
              } catch (e) {
                // Ignore errors
              }

              if (stillHasSelection && lastCfiRange === cfiRange) {
                sendSelectionData(cfiRange, contents);
              } else {
                // Selection was cleared before timeout fired, clear flags
                if (lastCfiRange === cfiRange) {
                  isSelecting = false;
                  lastCfiRange = null;
                  hasSentSelection = false;
                }
              }
            }, 200);
            return true;
          }
        }
      } catch (e) {
        // Ignore errors
      }
    } catch (e) {
      // Ignore errors
    }
    return false;
  }

  // Continuous polling for iPad (as last resort when events don't fire)
  var pollIntervals = []; // Store intervals for each content frame
  var lastPolledSelections = new Map(); // Track last selection per contents

  function startPolling(contents) {
    // Check if we're already polling this contents
    var contentsId = contents.document ? contents.document.URL : 'unknown';
    if (lastPolledSelections.has(contentsId)) {
      return;
    }

    lastPolledSelections.set(contentsId, null);

    var pollCount = 0;
    var noSelectionCount = 0;
    var interval = setInterval(function () {
      try {
        pollCount++;

        // Stop polling if no selection found for 5 seconds (50 polls * 100ms)
        // This optimizes performance - only poll when there might be a selection
        if (pollCount > 50 && noSelectionCount > 40) {
          clearInterval(interval);
          lastPolledSelections.delete(contentsId);
          return;
        }

        // Check if window/selection API is available
        if (!contents.window || !contents.window.getSelection) {
          return;
        }

        var selection = contents.window.getSelection();
        if (!selection) {
          noSelectionCount++;
          return;
        }

        // Check selection properties even if toString() is empty
        var rangeCount = selection.rangeCount || 0;
        var selectedText = selection.toString() || '';
        var hasRanges = rangeCount > 0;

        // Even if toString() is empty, check if there are ranges (iPad quirk)
        var currentSelection = selectedText || (hasRanges ? 'HAS_RANGE_BUT_NO_TEXT' : null);
        var lastSelection = lastPolledSelections.get(contentsId);

        // Only process if selection changed
        if (currentSelection !== lastSelection) {
          lastPolledSelections.set(contentsId, currentSelection);
          noSelectionCount = 0; // Reset counter when selection found

          if (!selectedText && !hasRanges) {
            // Clear flags if they're set (even if we haven't sent a selection yet)
            if (isSelecting || lastCfiRange) {
              // Only fire selectionCleared if we've actually sent a selection
              if (hasSentSelection) {
                window.flutter_inappwebview.callHandler('selectionCleared');
              }
              // Always clear the flags when there's no selection
              isSelecting = false;
              lastCfiRange = null;
              hasSentSelection = false;
              if (selectionTimeout) {
                clearTimeout(selectionTimeout);
                selectionTimeout = null;
              }
            }
          } else {
            // Selection exists - try to process it
            if (!isSelecting) {
              checkAndProcessSelection(contents);
            }
          }
        } else if (!currentSelection) {
          noSelectionCount++;
        }
      } catch (e) {
        // Ignore errors
      }
    }, 200); // Check every 200ms

    pollIntervals.push({ contentsId: contentsId, interval: interval });
  }

  function stopPolling() {
    pollIntervals.forEach(function (item) {
      clearInterval(item.interval);
    });
    pollIntervals = [];
    lastPolledSelections.clear();
  }

  // Handle selection clearing and changes
  rendition.hooks.content.register(function (contents) {
    // Listen on document
    contents.window.document.addEventListener('selectionchange', function () {
      var selection = contents.window.getSelection();
      var selectedText = selection.toString();

      // Check if there's actually a range, not just text (more reliable)
      var hasRange = selection && selection.rangeCount > 0;
      var hasNonCollapsedRange = false;
      if (hasRange) {
        try {
          var range = selection.getRangeAt(0);
          hasNonCollapsedRange = range && !range.collapsed;
        } catch (e) {
          // Ignore errors
        }
      }

      // Only clear selection if there's truly no range AND no text
      // This prevents clearing when toString() is temporarily empty but range exists
      if (!hasNonCollapsedRange && !selectedText) {
        // Double-check across all content frames before clearing
        var stillHasSelection = false;
        try {
          var allContents = rendition.getContents();
          for (var i = 0; i < allContents.length; i++) {
            try {
              var cont = allContents[i];
              if (cont.window && cont.window.getSelection) {
                var contSel = cont.window.getSelection();
                if (contSel && contSel.rangeCount > 0) {
                  var contRange = contSel.getRangeAt(0);
                  var contText = contSel.toString();
                  if (contText || (contRange && !contRange.collapsed)) {
                    stillHasSelection = true;
                    break;
                  }
                }
              }
            } catch (e) {
              // Ignore errors
            }
          }
          // Also check parent window
          if (!stillHasSelection && window.getSelection) {
            var parentSel = window.getSelection();
            if (parentSel && parentSel.rangeCount > 0) {
              var parentRange = parentSel.getRangeAt(0);
              var parentText = parentSel.toString();
              if (parentText || (parentRange && !parentRange.collapsed)) {
                stillHasSelection = true;
              }
            }
          }
        } catch (e) {
          // Ignore errors
        }

        if (!stillHasSelection) {
          // Clear flags if they're set (even if we haven't sent a selection yet)
          // This handles the case where checkAndProcessSelection set flags but selection was cleared before timeout
          if (isSelecting || lastCfiRange) {
            // Only fire selectionCleared if we've actually sent a selection
            if (hasSentSelection) {
              window.flutter_inappwebview.callHandler('selectionCleared');
            }
            // Always clear the flags when there's no selection
            isSelecting = false;
            lastCfiRange = null;
            hasSentSelection = false;
            if (selectionTimeout) {
              clearTimeout(selectionTimeout);
              selectionTimeout = null;
            }
          }
        }
      } else if (isSelecting) {
        // Selection is being modified (dragging handles)
        // Notify Flutter to hide the widget
        window.flutter_inappwebview.callHandler('selectionChanging');

        // Find the contents object that actually contains the current selection
        // The passed contents might be from a different page after navigation
        var actualContents = contents;
        try {
          var allContents = rendition.getContents();
          for (var i = 0; i < allContents.length; i++) {
            var cont = allContents[i];
            try {
              if (cont.window && cont.window.getSelection) {
                var sel = cont.window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  var range = sel.getRangeAt(0);
                  if (range && !range.collapsed) {
                    // This contents has an active selection, use it
                    actualContents = cont;
                    break;
                  }
                }
              }
            } catch (e) {
              // Ignore errors, continue checking other contents
            }
          }
        } catch (e) {
          // If we can't find the right contents, use the passed one
          actualContents = contents;
        }

        // Get the current CFI from the current selection range (not the stale lastCfiRange)
        // This ensures we use the correct CFI for the current page after navigation
        try {
          var currentSelection = actualContents.window.getSelection();
          if (currentSelection && currentSelection.rangeCount > 0) {
            var currentRange = currentSelection.getRangeAt(0);
            if (currentRange && !currentRange.collapsed) {
              // Get the current CFI from the current selection
              if (typeof actualContents.cfiFromRange === 'function') {
                var currentCfi = actualContents.cfiFromRange(currentRange);
                if (currentCfi) {
                  // Update lastCfiRange with the current CFI
                  lastCfiRange = currentCfi;
                }
              }
            }
          }
        } catch (e) {
          // If we can't get the current CFI, we'll use lastCfiRange as fallback
          // but this might cause issues if it's from a different page
        }

        // Clear existing timeout
        if (selectionTimeout) {
          clearTimeout(selectionTimeout);
        }

        // Set timeout to detect when dragging stops
        selectionTimeout = setTimeout(function () {
          // Selection has stabilized, send the final selection
          // Find the correct contents again in case it changed
          var finalContents = actualContents;
          try {
            var allContents = rendition.getContents();
            for (var i = 0; i < allContents.length; i++) {
              var cont = allContents[i];
              try {
                if (cont.window && cont.window.getSelection) {
                  var sel = cont.window.getSelection();
                  if (sel && sel.rangeCount > 0) {
                    var range = sel.getRangeAt(0);
                    if (range && !range.collapsed) {
                      finalContents = cont;
                      break;
                    }
                  }
                }
              } catch (e) {
                // Ignore errors
              }
            }
          } catch (e) {
            // Use actualContents as fallback
            finalContents = actualContents;
          }

          // Get the current CFI again in case it changed during dragging
          var finalCfi = lastCfiRange;
          try {
            var finalSelection = finalContents.window.getSelection();
            if (finalSelection && finalSelection.rangeCount > 0) {
              var finalRange = finalSelection.getRangeAt(0);
              if (finalRange && !finalRange.collapsed) {
                if (typeof finalContents.cfiFromRange === 'function') {
                  var updatedCfi = finalContents.cfiFromRange(finalRange);
                  if (updatedCfi) {
                    finalCfi = updatedCfi;
                    lastCfiRange = updatedCfi;
                  }
                }
              }
            }
          } catch (e) {
            // Use lastCfiRange as fallback
          }

          if (finalCfi) {
            sendSelectionData(finalCfi, finalContents);
          }
          // Set isSelecting = false, but keep lastCfiRange so hasActiveSelection() still returns true
          // This allows navigation to remain blocked while selection is active
          isSelecting = false;
        }, 300); // 300ms debounce
      } else {
        // Fallback for iPad/iOS: Detect initial selection when epub.js "selected" event doesn't fire
        checkAndProcessSelection(contents);
      }
    });

    // Also listen on window (some browsers fire it there)
    if (contents.window.addEventListener) {
      contents.window.addEventListener('selectionchange', function () {
        var selection = contents.window.getSelection();
        var selectedText = selection.toString();
        if (selectedText && !isSelecting) {
          checkAndProcessSelection(contents);
        }
      });
    }

    // Selection POLLING is an iOS/iPad-only fallback for when the native
    // `selectionchange`/`selected` events don't fire. On web and desktop those
    // events are reliable, so polling is disabled (usePolling === false) to
    // avoid perpetual 200ms/2000ms background timers. The event listeners above
    // remain active on every platform.
    if (usePolling) {
    // Start polling for this content frame (optimized - stops if no selection found)
    try {
      startPolling(contents);
    } catch (e) {
      // Ignore errors
    }

    // Also try to get all contents and poll them (important for spread layout with 2 pages)
    try {
      var allContents = rendition.getContents();
      allContents.forEach(function (cont, index) {
        var frameId = cont.document ? cont.document.URL : ('frame' + index);
        if (cont.window && !lastPolledSelections.has(frameId)) {
          startPolling(cont);
        }
      });

      // Set up a periodic check to ensure all frames are being polled
      // (in case frames are added/removed dynamically)
      setInterval(function () {
        try {
          var currentContents = rendition.getContents();
          currentContents.forEach(function (cont, index) {
            var frameId = cont.document ? cont.document.URL : ('frame' + index);
            if (cont.window && !lastPolledSelections.has(frameId)) {
              startPolling(cont);
            }
          });
        } catch (e) {
          // Ignore errors in periodic check
        }
      }, 2000); // Check every 2 seconds for new frames
    } catch (e) {
      // Ignore errors
    }

    // Also poll parent window selection (iPad often puts selection there)
    if (!lastPolledSelections.has('parent')) {
      lastPolledSelections.set('parent', null);
      var parentNoSelectionCount = 0;
      var parentInterval = setInterval(function () {
        try {
          if (!window.getSelection) return;
          var parentSelection = window.getSelection();
          var parentText = parentSelection ? parentSelection.toString() : '';
          var currentParentSelection = parentText || null;
          var lastParentSelection = lastPolledSelections.get('parent');

          if (currentParentSelection !== lastParentSelection) {
            lastPolledSelections.set('parent', currentParentSelection);
            parentNoSelectionCount = 0;

            if (parentText && parentSelection.rangeCount > 0) {
              // Try to process with each content frame (important for spread with 2 pages)
              try {
                var allContents = rendition.getContents();
                allContents.forEach(function (cont, index) {
                  if (!isSelecting) {
                    checkAndProcessSelection(cont);
                  }
                });
              } catch (e) {
                // Ignore errors
              }
            } else {
              parentNoSelectionCount++;
            }
          } else if (!currentParentSelection) {
            parentNoSelectionCount++;
          }

          // Stop polling if no selection found for 5 seconds
          if (parentNoSelectionCount > 25) {
            clearInterval(parentInterval);
            lastPolledSelections.delete('parent');
          }
        } catch (e) {
          // Ignore errors
        }
      }, 200);
      pollIntervals.push({ contentsId: 'parent', interval: parentInterval });
    }
    } // end if (usePolling)
  });

  rendition.hooks.content.register(setupFootnoteInterception);

  book.loaded.navigation.then(function (toc) {
    if (loadToken !== currentLoadToken) return;
    chapters = parseChapters(toc)
    window.flutter_inappwebview.callHandler('chapters');
  })

  rendition.on("rendered", function () {
    raisePageEdges();
    // 轉向會清掉頁面再載入。載入完成先再量一次，否則第一下手指還是舊高度。
    scheduleSpreadLayout();
    window.flutter_inappwebview.callHandler('rendered');
  })
  rendition.on("resized", scheduleSpreadLayout);
  rendition.on("orientationchange", scheduleSpreadLayout);

  // Function to calculate and send selection data
  // Make it globally accessible for native callbacks (needed for iPad support)
  function sendSelectionData(cfiRange, contents) {
    // Find the contents object that actually contains the current selection
    // This is important after navigation - the passed contents might be from a different page
    var actualContents = contents;
    var selection = null;
    var selRange = null;
    var selectedText = '';

    try {
      var allContents = rendition.getContents();
      for (var i = 0; i < allContents.length; i++) {
        var cont = allContents[i];
        try {
          if (cont.window && cont.window.getSelection) {
            var sel = cont.window.getSelection();
            if (sel && sel.rangeCount > 0) {
              var range = sel.getRangeAt(0);
              if (range && !range.collapsed) {
                // This contents has an active selection, use it
                actualContents = cont;
                selection = sel;
                selRange = range;
                // Get text directly from the selection range to avoid calling book.getRange()
                // which can cause navigation if the CFI is from a different page
                selectedText = sel.toString() || range.toString();
                break;
              }
            }
          }
        } catch (e) {
          // Ignore errors, continue checking other contents
        }
      }

      // If we didn't find a selection in any contents, try the passed contents
      if (!selection && contents && contents.window && contents.window.getSelection) {
        selection = contents.window.getSelection();
        if (selection && selection.rangeCount > 0) {
          selRange = selection.getRangeAt(0);
          if (selRange && !selRange.collapsed) {
            selectedText = selection.toString() || selRange.toString();
            actualContents = contents;
          }
        }
      }
    } catch (e) {
      // If we can't find the right contents, use the passed one
      actualContents = contents;
      try {
        if (contents && contents.window && contents.window.getSelection) {
          selection = contents.window.getSelection();
          if (selection && selection.rangeCount > 0) {
            selRange = selection.getRangeAt(0);
            if (selRange && !selRange.collapsed) {
              selectedText = selection.toString() || selRange.toString();
            }
          }
        }
      } catch (e2) {
        // Ignore
      }
    }

    // Convert CFI to XPath (this doesn't cause navigation)
    cfiRangeToXPath(cfiRange.toString()).then(function (selectionXpath) {
      try {
        // Get selection coordinates from the actual contents that has the selection
        var rect = null;

        if (selection && selRange) {
          // Get the range and its client rect (relative to iframe viewport)
          var clientRect = selRange.getBoundingClientRect();

          // Get the WebView dimensions (parent window)
          var webViewWidth = window.innerWidth;
          var webViewHeight = window.innerHeight;

          // Get the iframe element in the parent document
          var iframe = actualContents.document.defaultView.frameElement;
          var iframeRect = iframe.getBoundingClientRect();

          // Calculate absolute position in WebView (iframe offset + selection position)
          var absoluteLeft = iframeRect.left + clientRect.left;
          var absoluteTop = iframeRect.top + clientRect.top;

          // Normalize to 0-1 range relative to WebView dimensions
          rect = {
            left: absoluteLeft / webViewWidth,
            top: absoluteTop / webViewHeight,
            width: clientRect.width / webViewWidth,
            height: clientRect.height / webViewHeight,
            contentHeight: webViewHeight
          };
        }

        var args = [cfiRange.toString(), selectedText, rect, selectionXpath];
        window.flutter_inappwebview.callHandler('selection', ...args);
        hasSentSelection = true; // Mark that we've sent a selection
      } catch (e) {
        // Still send the selection without coordinates if there's an error
        var args = [cfiRange.toString(), selectedText, null, selectionXpath];
        window.flutter_inappwebview.callHandler('selection', ...args);
        hasSentSelection = true; // Mark that we've sent a selection
      }
    }).catch(function (e) {
      // If XPath conversion fails, still send CFI
      try {
        var rect = null;
        if (selection && selRange) {
          var clientRect = selRange.getBoundingClientRect();
          var webViewWidth = window.innerWidth;
          var webViewHeight = window.innerHeight;
          var iframe = actualContents.document.defaultView.frameElement;
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
        var args = [cfiRange.toString(), selectedText, rect, null];
        window.flutter_inappwebview.callHandler('selection', ...args);
        hasSentSelection = true; // Mark that we've sent a selection
      } catch (e2) {
        var args = [cfiRange.toString(), selectedText, null, null];
        window.flutter_inappwebview.callHandler('selection', ...args);
        hasSentSelection = true; // Mark that we've sent a selection
      }
    });
  }

  // Make sendSelectionData globally accessible for iPad native callbacks
  window.sendSelectionData = sendSelectionData;

  ///text selection callback
  rendition.on("selected", function (cfiRange, contents) {
    lastCfiRange = cfiRange;

    if (!isSelecting) {
      // Initial selection - send immediately
      isSelecting = true;
      sendSelectionData(cfiRange, contents);
    }
    // If already selecting, the selectionchange handler will debounce it
  });

  bookOpenAs = openAs;

  //book location changes callback
  rendition.on("relocated", function (location) {
    // BLOCK navigation if there's an active selection
    // This is a final safeguard - if something bypassed our other blocks, prevent the navigation
    // BUT: Don't block if the user is actively dragging selection handles (isSelecting is true)
    // because that would cause the page to snap back when dragging handles after navigation
    if (hasActiveSelection() && !isSelecting) {
      // Try to revert to previous location
      // Store the previous location before blocking
      if (rendition.location && rendition.location.start) {
        try {
          // Get the current location before this navigation
          var currentCfi = rendition.location.start.cfi;
          // If we have a stored previous location, go back to it
          // BUT: Only revert if the current location is different from lastValidLocation
          // and we're not in the middle of a selection operation
          // AND: Don't revert if lastValidLocation is null or undefined (initial state)
          if (window.lastValidLocation &&
            window.lastValidLocation !== currentCfi &&
            !isSelecting &&
            window.lastValidLocation !== null &&
            window.lastValidLocation !== undefined) {
            setTimeout(function () {
              // Double-check that selection is still active and we're not selecting
              if (!hasActiveSelection() || isSelecting) {
                return; // Don't revert if selection was cleared or user is actively selecting
              }
              if (originalDisplay && !hasActiveSelection()) {
                originalDisplay(window.lastValidLocation);
              } else if (rendition.display && !hasActiveSelection()) {
                rendition.display(window.lastValidLocation);
              }
            }, 10);
          }
        } catch (e) {
          console.error('Error reverting location:', e);
        }
      }
      // Don't process the relocation - return early (don't update lastValidLocation)
      return;
    }

    // Only store valid location for potential revert if navigation succeeded
    // (i.e., we didn't block it above)
    if (location && location.start && location.start.cfi) {
      window.lastValidLocation = location.start.cfi;
    }

    // Clear selection when navigating to a new page (if enabled)
    if (clearSelectionOnPageChange && hasSentSelection && (isSelecting || lastCfiRange)) {
      isSelecting = false;
      lastCfiRange = null;
      hasSentSelection = false;
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
        selectionTimeout = null;
      }

      // Clear the actual browser selection across all iframe contents
      rendition.getContents().forEach(function (contents) {
        try {
          if (contents.window.getSelection) {
            contents.window.getSelection().removeAllRanges();
          }
        } catch (e) {
          // Ignore errors if iframe is not accessible
        }
      });

      // Notify Flutter that selection was cleared
      window.flutter_inappwebview.callHandler('selectionCleared');
    }

    sendRelocated(location);
    cacheNearbyPages();
    settlePageDrag();
    // 轉向或跳目錄會重開目前這一頁，並把下一頁排在右邊。再排一次，單數頁才留在右。
    alignTwoPageSpread();
  });

  rendition.on('displayError', function (e) {
    window.flutter_inappwebview.callHandler('displayError');
  })

  rendition.on('markClicked', function (cfiRange) {
    // Notify Dart so onAnnotationClicked fires. Include the annotation's rect
    // (best-effort) using the same viewer-relative geometry as getRectFromCfi.
    getRectFromCfi(cfiRange).then(function (rect) {
      window.flutter_inappwebview.callHandler('markClicked', cfiRange, rect);
    }).catch(function () {
      window.flutter_inappwebview.callHandler('markClicked', cfiRange, null);
    });

    // Only programmatically select if enabled
    if (selectAnnotationRange) {
      // Programmatically select the annotation range to trigger the selection event
      // The selection event will provide the correct rect automatically
      try {
        var allContents = rendition.getContents();
        var contents = null;
        var range = null;

        // Try to get the range from each contents frame
        for (var i = 0; i < allContents.length; i++) {
          try {
            var testContents = allContents[i];
            if (typeof testContents.range === 'function') {
              var testRange = testContents.range(cfiRange);
              if (testRange && testRange.startContainer && testRange.endContainer) {
                if (testContents.document.contains(testRange.startContainer) ||
                  testContents.document.contains(testRange.endContainer)) {
                  contents = testContents;
                  range = testRange;
                  break;
                }
              }
            }
          } catch (e) {
            // Continue to next contents
          }
        }

        // If we didn't find it in contents, fall back to book.getRange()
        if (!range || !contents) {
          book.getRange(cfiRange).then(function (bookRange) {
            var allContents2 = rendition.getContents();
            var contents2 = null;

            if (bookRange && bookRange.startContainer) {
              var rangeDoc = bookRange.startContainer.ownerDocument;
              for (var j = 0; j < allContents2.length; j++) {
                try {
                  if (allContents2[j].document === rangeDoc) {
                    contents2 = allContents2[j];
                    break;
                  }
                } catch (e) {
                  // Continue
                }
              }
            }

            if (!contents2 && allContents2.length > 0) {
              contents2 = allContents2[0];
            }

            if (contents2 && bookRange) {
              selectAnnotationRangeHelper(contents2, bookRange);
            }
          }).catch(function (e) {
            console.error('Error getting range for annotation:', e);
          });
          return;
        }

        // We found the range, select it
        selectAnnotationRangeHelper(contents, range);

      } catch (e) {
        console.error('Error in markClicked handler:', e);
      }
    }

    // Helper function to programmatically select the range
    // This will trigger the selection event with the correct rect
    function selectAnnotationRangeHelper(contents, range) {
      try {
        var selection = contents.window.getSelection();
        if (selection && range) {
          // Clear existing selection
          selection.removeAllRanges();
          // Select the annotation range - this will trigger the selection event
          selection.addRange(range);
        }
      } catch (e) {
        console.error('Error selecting annotation range:', e);
      }
    }
  })

  // Generate locations only once the first page is on screen. Generation
  // loads and parses every chapter, and running it alongside the first render
  // delays the reader appearing on large books (#100, #39, #72).
  // A directory open must not do that: the server sends one file per request,
  // and only the current page plus its two neighbors are fetched.
  Promise.all([book.ready, Promise.resolve(displayed).catch(function () {})]).then(function () {
    if (loadToken !== currentLoadToken) return;
    var locationsReady = openAs === 'directory'
      ? Promise.resolve()
      : loadOrGenerateLocations(cachedLocations, reportLocations);
    locationsReady.then(() => {
      if (loadToken !== currentLoadToken) return;
      // The first relocated event usually fires before locations exist, so it
      // reports progress 0. Re-send the current location now that progress
      // can be computed.
      if (rendition.location && rendition.location.start) {
        sendRelocated(rendition.location);
        cacheNearbyPages();
      }
      // Handle initial position after locations are generated
      // XPath takes precedence over CFI
      if (initialXPath && !initialXPathProcessed) {
        initialXPathProcessed = true; // Mark as processed to prevent multiple calls
        initialPositionLoading = true; // Mark that we're loading initial position
        // Notify parent app that initial position loading has started
        try {
          window.flutter_inappwebview.callHandler('initialPositionLoading', { type: 'xpath' });
        } catch (e) {
          console.error('Error calling initialPositionLoading callback:', e);
        }
        xpathToCfi(initialXPath).then(function (convertedCfi) {
          if (convertedCfi && !xpathDisplayInProgress) {
            xpathDisplayInProgress = true; // Mark as in progress
            // Wait for the initial display to complete, then navigate to the XPath location
            // Use the displayed promise if available, or wait a bit
            var displayPromise = displayed;
            if (displayPromise && typeof displayPromise.then === 'function') {
              displayPromise.then(function () {
                setTimeout(function () {
                  if (xpathDisplayInProgress) { // Double-check flag
                    try {
                      rendition.display(convertedCfi);
                      xpathDisplayInProgress = false; // Mark as complete
                    } catch (e) {
                      console.error('Error displaying converted CFI:', e);
                      xpathDisplayInProgress = false; // Reset on error
                    }
                  }
                }, 50);
              }).catch(function (e) {
                console.error('Error waiting for initial display:', e);
                // Try anyway after a delay
                setTimeout(function () {
                  if (xpathDisplayInProgress) { // Double-check flag
                    try {
                      rendition.display(convertedCfi);
                      xpathDisplayInProgress = false; // Mark as complete
                    } catch (e2) {
                      console.error('Error displaying converted CFI after delay:', e2);
                      xpathDisplayInProgress = false; // Reset on error
                    }
                  }
                }, 200);
              });
            } else {
              // No promise, just wait a bit
              setTimeout(function () {
                if (xpathDisplayInProgress) { // Double-check flag
                  try {
                    rendition.display(convertedCfi);
                    xpathDisplayInProgress = false; // Mark as complete
                  } catch (e) {
                    console.error('Error displaying converted CFI:', e);
                    xpathDisplayInProgress = false; // Reset on error
                  }
                }
              }, 200);
            }
          } else {
            console.warn('Failed to convert XPath to CFI, falling back to CFI or default');
            if (cfi) {
              rendition.display(cfi);
              // initialPositionLoading flag will be cleared when "displayed" event fires
            } else {
              // No CFI fallback, clear the loading flag immediately
              initialPositionLoading = false;
              window.flutter_inappwebview.callHandler('initialPositionLoaded');
            }
          }
          window.flutter_inappwebview.callHandler('locationLoaded');
        }).catch(function (e) {
          console.error('Error converting XPath to CFI in ready:', e);
          if (cfi) {
            rendition.display(cfi);
            // initialPositionLoading flag will be cleared when "displayed" event fires
          } else {
            // No CFI fallback, clear the loading flag immediately
            initialPositionLoading = false;
            window.flutter_inappwebview.callHandler('initialPositionLoaded');
          }
          window.flutter_inappwebview.callHandler('locationLoaded');
        });
      } else if (cfi) {
        // CFI callback was already fired when we did the initial display above
        // Just ensure locationLoaded is called
        window.flutter_inappwebview.callHandler('locationLoaded');
      } else {
        window.flutter_inappwebview.callHandler('locationLoaded');
      }
    })
  })

  installPageGestures(document, false);
  bindViewportLayout();
  rendition.hooks.content.register((contents) => {
    var doc = contents.document;
    if (!doc) return;
    // Android already turns pages from its own touch swipe. Still block the
    // context menu there, and still swipe with a mouse.
    installPageGestures(doc, false);
    pinPageTop(doc);

    // Track touch positions to detect horizontal swipes
    var touchStartX = null;
    var touchStartY = null;
    var currentTouchX = null;
    var currentTouchY = null;
    var hasMoved = false; // Track if touch has moved significantly (swipe vs tap)
    var touchStartTime = null; // Track when touch started

    // Helper function to calculate normalized touch coordinates (0-1 range)
    // Uses the same logic as selection coordinate calculation
    function getNormalizedTouchCoordinates(touchEvent) {
      try {
        if (!touchEvent.touches || touchEvent.touches.length === 0) {
          return null;
        }

        var touch = touchEvent.touches[0];
        // Touch coordinates are relative to the iframe viewport (same as selection clientRect)
        var clientX = touch.clientX;
        var clientY = touch.clientY;

        // Get the WebView dimensions (parent window)
        var webViewWidth = window.innerWidth;
        var webViewHeight = window.innerHeight;

        // Get the iframe element in the parent document
        var iframe = contents.document.defaultView.frameElement;
        if (!iframe) {
          // Fallback: use clientX/Y directly if no iframe
          return {
            x: clientX / webViewWidth,
            y: clientY / webViewHeight
          };
        }

        var iframeRect = iframe.getBoundingClientRect();

        // Calculate absolute position in WebView (iframe offset + touch position)
        // Same logic as selection: absoluteLeft = iframeRect.left + clientRect.left
        var absoluteX = iframeRect.left + clientX;
        var absoluteY = iframeRect.top + clientY;

        // Normalize to 0-1 range relative to WebView dimensions
        return {
          x: absoluteX / webViewWidth,
          y: absoluteY / webViewHeight
        };
      } catch (e) {
        console.error('Error calculating touch coordinates:', e);
        return null;
      }
    }

    // Helper function to get normalized coordinates from changedTouches (for touchend)
    // Uses the same logic as selection coordinate calculation
    function getNormalizedTouchCoordinatesFromChanged(touchEvent) {
      try {
        if (!touchEvent.changedTouches || touchEvent.changedTouches.length === 0) {
          return null;
        }

        var touch = touchEvent.changedTouches[0];
        // Touch coordinates are relative to the iframe viewport (same as selection clientRect)
        var clientX = touch.clientX;
        var clientY = touch.clientY;

        // Get the WebView dimensions (parent window)
        var webViewWidth = window.innerWidth;
        var webViewHeight = window.innerHeight;

        // Get the iframe element in the parent document
        var iframe = contents.document.defaultView.frameElement;
        if (!iframe) {
          // Fallback: use clientX/Y directly if no iframe
          return {
            x: clientX / webViewWidth,
            y: clientY / webViewHeight
          };
        }

        var iframeRect = iframe.getBoundingClientRect();

        // Calculate absolute position in WebView (iframe offset + touch position)
        // Same logic as selection: absoluteLeft = iframeRect.left + clientRect.left
        var absoluteX = iframeRect.left + clientX;
        var absoluteY = iframeRect.top + clientY;

        // Normalize to 0-1 range relative to WebView dimensions
        return {
          x: absoluteX / webViewWidth,
          y: absoluteY / webViewHeight
        };
      } catch (e) {
        console.error('Error calculating touch coordinates:', e);
        return null;
      }
    }

    // Helper function to safely call flutter_inappwebview handler
    // On iOS, window.flutter_inappwebview might not be available in iframe context
    // Try parent window as fallback
    function callFlutterHandler(handlerName, ...args) {
      try {
        if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
          window.flutter_inappwebview.callHandler(handlerName, ...args);
          return true;
        }
      } catch (err) {
        // Try parent window as fallback (for iOS iframe context)
        try {
          if (window.parent && window.parent !== window && window.parent.flutter_inappwebview && window.parent.flutter_inappwebview.callHandler) {
            window.parent.flutter_inappwebview.callHandler(handlerName, ...args);
            return true;
          }
        } catch (parentErr) {
          // Ignore parent window errors
        }
      }
      return false;
    }

    // Helper function to get normalized coordinates from parent window perspective (for iOS fallback)
    // When called from parent window event, touch.clientX/Y are already relative to parent window
    function getNormalizedTouchCoordinatesFromParent(touchEvent) {
      try {
        var touch = null;
        if (touchEvent.touches && touchEvent.touches.length > 0) {
          touch = touchEvent.touches[0];
        } else if (touchEvent.changedTouches && touchEvent.changedTouches.length > 0) {
          touch = touchEvent.changedTouches[0];
        }
        if (!touch) return null;

        // Get parent window dimensions
        var parentWindow = window.parent && window.parent !== window ? window.parent : window;
        var webViewWidth = parentWindow.innerWidth;
        var webViewHeight = parentWindow.innerHeight;

        // When called from parent window event listener, touch.clientX/Y are already in parent window coordinates
        // So we can normalize directly
        return {
          x: touch.clientX / webViewWidth,
          y: touch.clientY / webViewHeight
        };
      } catch (e) {
        console.error('Error calculating touch coordinates from parent: ', e);
        return null;
      }
    }

    // Block horizontal swipe gestures when there's a selection
    // This must be done at the document level in capture phase to intercept early
    // Use { passive: false } to allow preventDefault() to work
    var touchStartHandler = function (e) {
      // Fire onTouchDown callback with normalized coordinates FIRST (before any preventDefault)
      var touchCoords = null;
      try {
        var coords = getNormalizedTouchCoordinates(e);
        if (coords) {
          touchCoords = coords;
          // Store tap coordinates for later checking in selectionchange
          lastTapCoords = coords;
          callFlutterHandler('onTouchDown', coords.x, coords.y);
        }
      } catch (err) {
        // Ignore errors in callback
      }

      if (hasActiveSelection()) {
        // Store initial touch position and time to detect if this is a tap or swipe
        if (e.touches && e.touches.length > 0) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          currentTouchX = touchStartX;
          currentTouchY = touchStartY;
          touchStartTime = Date.now();
          hasMoved = false; // Reset movement flag
        }
        // Don't preventDefault yet - wait to see if it's a tap or swipe
      } else {
        // Track for normal swipe detection
        if (e.touches && e.touches.length > 0) {
          touchStartX = e.touches[0].clientX;
          touchStartY = e.touches[0].clientY;
          currentTouchX = touchStartX;
          currentTouchY = touchStartY;
          touchStartTime = Date.now();
          hasMoved = false;
        }
      }
    };

    // Attach to iframe document
    doc.addEventListener('touchstart', touchStartHandler, { capture: true, passive: false });

    // Also attach to parent window as fallback for iOS
    // On iOS, touch events in iframes may not fire, so we also listen on the parent window
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        // Get iframe element from parent document
        var iframe = contents.document.defaultView.frameElement;
        if (iframe) {
          window.parent.document.addEventListener('touchstart', function (e) {
            // Only handle if touch is within iframe bounds
            try {
              var iframeRect = iframe.getBoundingClientRect();
              var touch = e.touches && e.touches.length > 0 ? e.touches[0] : null;
              if (touch) {
                var touchX = touch.clientX;
                var touchY = touch.clientY;
                // Check if touch is within iframe bounds
                if (touchX >= iframeRect.left && touchX <= iframeRect.right &&
                  touchY >= iframeRect.top && touchY <= iframeRect.bottom) {
                  // Calculate normalized coordinates (touch is already in parent window coordinates)
                  var coords = getNormalizedTouchCoordinatesFromParent(e);
                  if (coords) {
                    lastTapCoords = coords;
                    callFlutterHandler('onTouchDown', coords.x, coords.y);
                  }
                }
              }
            } catch (err) {
              // Ignore errors in event handler
            }
          }, { capture: true, passive: false });
        }
      }
    } catch (err) {
      // Ignore errors when accessing parent window (cross-origin restrictions)
    }

    doc.addEventListener('touchmove', function (e) {
      if (hasActiveSelection()) {
        // Update position
        if (e.touches && e.touches.length > 0 && touchStartX !== null) {
          currentTouchX = e.touches[0].clientX;
          currentTouchY = e.touches[0].clientY;

          var deltaX = Math.abs(currentTouchX - touchStartX);
          var deltaY = Math.abs(currentTouchY - touchStartY);

          // If there's significant movement (more than 10px), it's a swipe - block it
          if (deltaX > 10 || deltaY > 10) {
            hasMoved = true;
            // Block horizontal swipes completely
            if (deltaX > 30 && deltaX > deltaY * 1.5) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return false;
            }
            // Also block if it's a significant horizontal movement (even if not strictly horizontal)
            if (deltaX > 50) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              return false;
            }
          }
        }
      } else {
        // Update current position for normal swipe detection
        if (e.touches && e.touches.length > 0) {
          currentTouchX = e.touches[0].clientX;
          currentTouchY = e.touches[0].clientY;
        }
      }
    }, { capture: true, passive: false }); // Use options object with passive: false

    var touchEndHandler = function (e) {
      // Fire onTouchUp callback with normalized coordinates
      var tapCoords = null;
      try {
        var coords = getNormalizedTouchCoordinatesFromChanged(e);
        if (coords) {
          tapCoords = coords;
          callFlutterHandler('onTouchUp', coords.x, coords.y);
        }
      } catch (err) {
        // Ignore errors in callback
      }

      if (hasActiveSelection()) {
        // Check if this was a tap (no significant movement) or a swipe
        if (touchStartX !== null && currentTouchX !== null && touchStartTime !== null) {
          var deltaX = Math.abs(currentTouchX - touchStartX);
          var deltaY = Math.abs(currentTouchY - touchStartY);
          var touchDuration = Date.now() - touchStartTime;

          // If there was minimal movement (< 10px) and short duration (< 300ms), it's a tap
          if (!hasMoved && deltaX < 10 && deltaY < 10 && touchDuration < 300) {
            // Simple tap - allow normal behavior
          } else if (deltaX > 30 && deltaX > deltaY * 1.5) {
            // It was a horizontal swipe - block it
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
          } else if (deltaX > 50) {
            // Significant horizontal movement - block it
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
          }
        }
      }
      // Reset tracking
      touchStartX = null;
      touchStartY = null;
      currentTouchX = null;
      currentTouchY = null;
      hasMoved = false;
      touchStartTime = null;
      // Keep lastTapCoords for longer to allow click handler and selectionchange to check it
      // Clear after a longer delay to handle quick taps
      setTimeout(function () {
        lastTapCoords = null;
      }, 500);
    };

    // Attach to iframe document
    doc.addEventListener('touchend', touchEndHandler, { capture: true, passive: false });

    // Also attach to parent window as fallback for iOS
    // On iOS, touch events in iframes may not fire, so we also listen on the parent window
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        // Get iframe element from parent document (same as touchstart)
        var iframe = contents.document.defaultView.frameElement;
        if (iframe) {
          window.parent.document.addEventListener('touchend', function (e) {
            // Only handle if touch is within iframe bounds
            try {
              var iframeRect = iframe.getBoundingClientRect();
              var touch = e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null;
              if (touch) {
                var touchX = touch.clientX;
                var touchY = touch.clientY;
                // Check if touch is within iframe bounds
                if (touchX >= iframeRect.left && touchX <= iframeRect.right &&
                  touchY >= iframeRect.top && touchY <= iframeRect.bottom) {
                  // Calculate normalized coordinates (touch is already in parent window coordinates)
                  var coords = getNormalizedTouchCoordinatesFromParent(e);
                  if (coords) {
                    callFlutterHandler('onTouchUp', coords.x, coords.y);
                  }
                }
              }
            } catch (err) {
              // Ignore errors in event handler
            }
          }, { capture: true, passive: false });
        }
      }
    } catch (err) {
      // Ignore errors when accessing parent window (cross-origin restrictions)
    }

    // 翻頁由拖動預覽負責。呢度再叫 next() 會一掃就跳兩頁。

    // Block epub.js built-in click/tap navigation when there's a selection
    // epub.js typically handles clicks on the left/right sides of the page
    try {
      if (doc) {
        // Helper function to check if event is in navigation zone and should be blocked
        function shouldBlockNavigation(e) {
          if (!hasActiveSelection()) {
            return false;
          }

          // Don't block if clicking on links or interactive elements
          var target = e.target;
          if (target && target.tagName &&
            target.tagName.toLowerCase() !== 'a' &&
            target.tagName.toLowerCase() !== 'button' &&
            !target.closest('a') &&
            !target.closest('button')) {
            // Get click/touch position
            var clickX = null;
            if (e.clientX !== undefined) {
              clickX = e.clientX;
            } else if (e.touches && e.touches.length > 0) {
              clickX = e.touches[0].clientX;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
              clickX = e.changedTouches[0].clientX;
            }

            if (clickX !== null) {
              var pageWidth = doc.documentElement.clientWidth || window.innerWidth;
              var leftThird = pageWidth / 3;
              var rightThird = pageWidth * 2 / 3;

              // Block navigation clicks/taps in left/right thirds when selection is active
              if (clickX < leftThird || clickX > rightThird) {
                return true;
              }
            }
          }
          return false;
        }

        // Intercept click events to prevent navigation when selection is active
        doc.addEventListener('click', function (e) {
          // Block navigation clicks if needed
          if (shouldBlockNavigation(e)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }, { capture: true, passive: false }); // Use options object with passive: false

        // Also intercept touch events for mobile devices (backup)
        // But only block if it's in navigation zone AND not a simple tap
        doc.addEventListener('touchend', function (e) {
          // Check if this was a simple tap
          var wasSimpleTap = false;
          if (touchStartX !== null && currentTouchX !== null && touchStartTime !== null) {
            var deltaX = Math.abs(currentTouchX - touchStartX);
            var deltaY = Math.abs(currentTouchY - touchStartY);
            var touchDuration = Date.now() - touchStartTime;
            wasSimpleTap = (!hasMoved && deltaX < 10 && deltaY < 10 && touchDuration < 300);
          }

          // Only block navigation if it's NOT a simple tap
          if (!wasSimpleTap && shouldBlockNavigation(e)) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }
        }, { capture: true, passive: false }); // Use options object with passive: false
      }
    } catch (e) {
      // Ignore errors
    }
  });
  rendition.themes.fontSize(fontSize + "px");
  //set background and foreground color
  updateTheme(backgroundColor, foregroundColor);
}

