// 搜尋、畫線、螢光筆，以及把目錄樹攤平。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

///parsing chapters and subitems recursively
var parseChapters = function (toc) {
  var chapters = []
  toc.forEach(function (chapter) {
    chapters.push({
      title: chapter.label,
      href: resolveTocHref(chapter.href),
      id: chapter.id,
      subitems: parseChapters(chapter.subitems)
    })
  })
  return chapters;
}

// Searches the book and resolves with the results ({cfi, excerpt, xpath});
// awaited via callAsync.
function searchInBook(query) {
  return search(query);
}


// adds highlight with given color
function addHighlight(cfiRange, color, opacity) {
  rendition.annotations.highlight(cfiRange, {}, (e) => {
    // Highlight clicked handler (can be extended if needed)
  }, "hl", { "fill": color, "fill-opacity": '0.3', "mix-blend-mode": "multiply" });
}

function addUnderLine(cfiString) {
  rendition.annotations.underline(cfiString)
}

function removeHighlight(cfiString) {
  rendition.annotations.remove(cfiString, "highlight");
}

function removeUnderLine(cfiString) {
  rendition.annotations.remove(cfiString, "underline");
}

function clearSelection() {
  try {
    if (typeof rendition !== 'undefined' && rendition) {
      // Clear selection in all content frames (iframes)
      rendition.getContents().forEach(function (contents) {
        try {
          if (contents.window.getSelection) {
            contents.window.getSelection().removeAllRanges();
          }
        } catch (e) {
          // Ignore errors if iframe is not accessible
        }
      });

      // Also clear selection in parent window as fallback
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }

      // Notify Flutter that selection was cleared - only if we've actually sent a selection
      if (hasSentSelection && (isSelecting || lastCfiRange) && window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        isSelecting = false;
        lastCfiRange = null;
        hasSentSelection = false;
        if (selectionTimeout) {
          clearTimeout(selectionTimeout);
          selectionTimeout = null;
        }
        window.flutter_inappwebview.callHandler('selectionCleared');
      }
    } else {
      // Fallback if rendition is not available
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
    }
  } catch (e) {
    console.error('Error clearing selection:', e);
  }
}

// Explicitly attach to window for global access
window.clearSelection = clearSelection;

function toProgress(progress) {
  var cfi = book.locations.cfiFromPercentage(progress);
  rendition.display(cfi);
}


// Chapters searched at once: enough to overlap loading with searching,
// few enough that only a handful of chapters are in memory at a time.
var SEARCH_CONCURRENCY = 4;

// Searches the book a few chapters at a time. Each hit's XPath is computed
// while its chapter is still loaded, so a chapter is loaded once per search
// rather than once per hit (a common word can have thousands of hits).
// A chapter that fails to load is skipped instead of failing the search.
// Results keep book order.
function search(q) {
  var items = book.spine.spineItems.slice();
  var perItem = new Array(items.length);
  var nextIndex = 0;

  function searchNext() {
    if (nextIndex >= items.length) return Promise.resolve();
    var index = nextIndex++;
    var item = items[index];
    return item.load(book.load.bind(book))
      .then(function () {
        return Promise.all(item.find(q).map(function (hit) {
          return cfiToXPath(hit.cfi).then(function (xpath) {
            return { cfi: hit.cfi, excerpt: hit.excerpt, xpath: xpath };
          }, function () {
            return { cfi: hit.cfi, excerpt: hit.excerpt, xpath: null };
          });
        }));
      })
      .then(function (hits) {
        perItem[index] = hits;
      }, function (e) {
        console.error('Search skipped ' + item.href + ':', e);
      })
      .then(function () {
        item.unload();
        return searchNext();
      });
  }

  var workers = [];
  for (var i = 0; i < SEARCH_CONCURRENCY; i++) workers.push(searchNext());
  return Promise.all(workers).then(function () {
    return [].concat.apply([], perItem.filter(Boolean));
  });
}

