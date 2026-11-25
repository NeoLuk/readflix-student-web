// 目錄、章節清單，以及目前讀到哪裡。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// The nav toc for a picture book is often only the title. The page-list
// holds the real contents (cover, inside pages, back cover) and each href
// is a spine item, so opening one does not download the other pages.
function contentsFileName(href) {
  if (!href) return '';
  return String(href).split('#')[0].split('/').pop();
}

// The Flutter menu sits behind this page's iframe, so the list is drawn here.
function toggleContentsMenu(title) {
  setContentsMenu(!contentsMenuOpen, title);
}

function setContentsMenu(open, title) {
  var overlay = document.getElementById('contents-overlay');
  if (!overlay) return;
  contentsMenuOpen = !!open;
  if (title) {
    var heading = document.getElementById('contents-title');
    if (heading) heading.textContent = String(title);
    var close = document.getElementById('contents-close');
    if (close) close.setAttribute('aria-label', String(title));
  }
  if (contentsMenuOpen) renderContentsMenu();
  overlay.classList.toggle('is-open', contentsMenuOpen);
  overlay.setAttribute('aria-hidden', contentsMenuOpen ? 'false' : 'true');
}

function renderContentsMenu() {
  var list = document.getElementById('contents-list');
  if (!list) return;
  list.textContent = '';
  var items = [];
  try {
    items = getChapters() || [];
  } catch (e) {
    items = chapters || [];
  }
  var current = contentsFileName(contentsCurrentHref);
  items.forEach(function (chapter) {
    if (!chapter || !chapter.href) return;
    var item = document.createElement('li');
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = chapter.title || chapter.href;
    if (current && contentsFileName(chapter.href) === current) {
      button.className = 'is-current';
    }
    button.addEventListener('click', function () {
      contentsCurrentHref = chapter.href;
      setContentsMenu(false);
      toCfi(chapter.href);
    });
    item.appendChild(button);
    list.appendChild(item);
  });
}

function isPageEdgeTarget(event) {
  var node = event && event.target;
  return !!(node && node.closest && node.closest('.page-edge'));
}

function raisePageEdges() {
  var viewer = document.getElementById('viewer');
  var prev = document.getElementById('page-edge-prev');
  var nextEdge = document.getElementById('page-edge-next');
  if (!viewer || !prev || !nextEdge) return;
  viewer.appendChild(prev);
  viewer.appendChild(nextEdge);
}

function bindPageEdges() {
  var prev = document.getElementById('page-edge-prev');
  var nextEdge = document.getElementById('page-edge-next');
  if (prev) {
    prev.addEventListener('click', function (event) {
      event.preventDefault();
      if (typeof previous === 'function') previous();
    });
  }
  if (nextEdge) {
    nextEdge.addEventListener('click', function (event) {
      event.preventDefault();
      if (typeof next === 'function') next();
    });
  }
  raisePageEdges();
}

function bindContentsMenu() {
  var scrim = document.getElementById('contents-scrim');
  var close = document.getElementById('contents-close');
  if (scrim) scrim.addEventListener('click', function () { setContentsMenu(false); });
  if (close) close.addEventListener('click', function () { setContentsMenu(false); });
}

bindContentsMenu();
bindPageEdges();

function getChapters() {
  var pages = book && book.pageList && book.pageList.pageList;
  if (pages && pages.length > chapters.length) {
    var items = [];
    for (var i = 0; i < pages.length; i++) {
      var entry = pages[i];
      if (!entry || !entry.href) continue;
      var title = entry.label ? String(entry.label).replace(/\s+/g, ' ').trim() : '';
      if (!title) title = String(i + 1);
      items.push({
        title: title,
        href: entry.href,
        id: 'page-' + i,
        subitems: []
      });
    }
    if (items.length) return items;
  }
  return chapters;
}

async function getBookInfo() {
  const metadata = book.package.metadata;
  metadata['coverImage'] = book.cover;
  return metadata;
}

// Returns the current location; awaited by the Dart bridge via callAsync.
function getCurrentLocation() {
  return locationPayload(rendition.location);
}

// Progress (0-1) for a CFI. rendition's own percentage is only set once
// locations are generated and goes stale after that, so compute it directly.
function progressFromCfi(cfi, fallback) {
  try {
    if (cfi && book.locations && book.locations.length()) {
      return book.locations.percentageFromCfi(cfi);
    }
  } catch (e) {
    console.error('Error computing progress from CFI:', e);
  }
  return fallback || 0;
}

// Printed page label for a CFI from the book's page list, or null when the
// book has none.
function printedPageFromCfi(cfi) {
  try {
    if (book.pageList && book.pageList.pages && book.pageList.pages.length) {
      var page = book.pageList.pageFromCfi(cfi);
      return page === -1 || page === undefined ? null : String(page);
    }
  } catch (e) {
    console.error('Error reading page list:', e);
  }
  return null;
}

// Builds the EpubLocation payload for a rendition location. XPaths are
// included when they resolve.
function locationPayload(location) {
  var displayedPage = location.start.displayed || {};
  var base = {
    startCfi: location.start.cfi,
    endCfi: location.end.cfi,
    startXpath: null,
    endXpath: null,
    progress: parseFloat(progressFromCfi(location.start.cfi, location.start.percentage)),
    // Screen pages within the current chapter (paginated flow only).
    chapterPage: isScrolledFlow() ? null : displayedPage.page || null,
    chapterTotalPages: isScrolledFlow() ? null : displayedPage.total || null,
    printedPage: printedPageFromCfi(location.start.cfi),
    href: location.start.href || null
  };
  return Promise.all([
    cfiToXPath(location.start.cfi),
    cfiToXPath(location.end.cfi)
  ]).then(function (xpaths) {
    base.startXpath = xpaths[0];
    base.endXpath = xpaths[1];
    return base;
  }).catch(function (e) {
    // If XPath conversion fails, still send CFI
    return base;
  });
}

// Sends a location to Flutter's onRelocated.
function sendRelocated(location) {
  if (location && location.start && location.start.href) {
    contentsCurrentHref = location.start.href;
    if (contentsMenuOpen) renderContentsMenu();
  }
  locationPayload(location).then(function (payload) {
    window.flutter_inappwebview.callHandler('relocated', payload);
  });
}

// Resolves `href` relative to the file at `basePath`. Both are relative to
// the package (OPF) folder, which is how epub.js looks spine items up.
// Absolute URLs and fragment-only hrefs are returned unchanged.
function resolveRelativeHref(basePath, href) {
  if (!href || !basePath || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.charAt(0) === '/') {
    return href;
  }
  var hashIndex = href.indexOf('#');
  var path = hashIndex >= 0 ? href.substring(0, hashIndex) : href;
  var hash = hashIndex >= 0 ? href.substring(hashIndex) : '';
  if (!path) return href;

  var parts = basePath.split('/');
  parts.pop(); // drop the file name, keep its folder
  path.split('/').forEach(function (segment) {
    if (segment === '..' && parts.length && parts[parts.length - 1] !== '..') {
      parts.pop();
    } else if (segment !== '.' && segment !== '') {
      parts.push(segment);
    }
  });
  return parts.join('/') + hash;
}

// TOC hrefs are relative to the nav/NCX document, but epub.js looks spine
// items up by paths relative to the package (OPF) folder. Resolve them so
// books whose nav lives in a subfolder (hrefs like "../Text/ch1.xhtml") work.
function resolveTocHref(href) {
  var navPath = book.packaging && (book.packaging.navPath || book.packaging.ncxPath);
  return resolveRelativeHref(navPath, href);
}

