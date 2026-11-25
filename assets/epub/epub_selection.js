// 選取文字時擋住翻頁，以及下一頁、上一頁、跳到指定位置。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// Helper function to check if there's an active text selection (global version)
function hasActiveSelection() {
  // Check our tracking variables first
  if (isSelecting || lastCfiRange) {
    return true;
  }

  // Also check actual DOM selection across all content frames
  try {
    if (typeof rendition !== 'undefined' && rendition) {
      var allContents = rendition.getContents();
      for (var i = 0; i < allContents.length; i++) {
        try {
          var contents = allContents[i];
          if (contents.window && contents.window.getSelection) {
            var selection = contents.window.getSelection();
            if (selection && selection.rangeCount > 0) {
              var range = selection.getRangeAt(0);
              var selectedText = selection.toString();
              if (selectedText && range && !range.collapsed) {
                return true;
              }
            }
          }
        } catch (e) {
          // Ignore errors for this content frame
        }
      }

      // Also check parent window selection
      if (window.getSelection) {
        var parentSelection = window.getSelection();
        if (parentSelection && parentSelection.rangeCount > 0) {
          var parentRange = parentSelection.getRangeAt(0);
          var parentText = parentSelection.toString();
          if (parentText && parentRange && !parentRange.collapsed) {
            return true;
          }
        }
      }
    }
  } catch (e) {
    // Ignore errors
  }

  return false;
}

// Store original rendition methods to override them
var originalNext = null;
var originalPrev = null;
var originalDisplay = null;

// Override rendition methods to block when selection exists
function setupRenditionBlocking() {
  if (typeof rendition !== 'undefined' && rendition && !originalNext) {
    // Store original methods
    originalNext = rendition.next.bind(rendition);
    originalPrev = rendition.prev.bind(rendition);
    originalDisplay = rendition.display.bind(rendition);

    // Override next()
    rendition.next = function () {
      if (hasActiveSelection()) {
        return Promise.resolve(rendition.location);
      }
      return originalNext();
    };

    // Override prev()
    rendition.prev = function () {
      if (hasActiveSelection()) {
        return Promise.resolve(rendition.location);
      }
      return originalPrev();
    };

    // Override display() - this is what actually changes the page
    rendition.display = function (cfi) {
      if (hasActiveSelection()) {
        return Promise.resolve(rendition.location);
      }
      return originalDisplay(cfi);
    };
  }
}

//move to next page
function next() {
  // Block navigation if there's an active selection
  if (hasActiveSelection()) {
    return;
  }
  if (rendition) {
    reportLocationIfMissed(rendition.next());
  }
}

//move to previous page
function previous() {
  // Block navigation if there's an active selection
  if (hasActiveSelection()) {
    return;
  }
  if (rendition) {
    reportLocationIfMissed(rendition.prev());
  }
}

// epub.js reports a new location from the container's `scroll` event. WebKit
// (iOS) does not always fire it for the programmatic scroll next()/prev()
// make, so the page turns but `relocated` never fires and the app keeps the
// old location. After the turn settles, report the location if the one
// epub.js holds is stale. Where the event did fire, nothing extra is sent.
function reportLocationIfMissed(navigation) {
  var r = rendition;
  var before = r.location && r.location.start && r.location.start.cfi;
  Promise.resolve(navigation).then(function () {
    setTimeout(function () {
      if (rendition !== r || !r.location || !r.location.start) return;
      if (r.location.start.cfi !== before) return; // already reported
      var current = r.currentLocation();
      if (current && current.start && current.start.cfi !== before) {
        r.reportLocation();
      }
    }, 150);
  }, function () {});
}

function isScrolledFlow() {
  var flow = rendition && rendition.settings && rendition.settings.flow;
  return flow === 'scrolled' || flow === 'scrolled-continuous' || flow === 'scrolled-doc';
}

//move to given cfi location or xpath
function toCfi(cfiOrXPath) {
  // Check if it looks like an XPath (starts with /)
  if (cfiOrXPath && cfiOrXPath.startsWith('/')) {
    xpathToCfi(cfiOrXPath).then(function (convertedCfi) {
      if (convertedCfi) {
        rendition.display(convertedCfi);
      } else {
        console.error('Failed to convert XPath to CFI:', cfiOrXPath);
      }
    }).catch(function (e) {
      console.error('Error converting XPath to CFI:', e);
    });
  } else {
    // Treat as CFI
    rendition.display(cfiOrXPath);
  }
}

