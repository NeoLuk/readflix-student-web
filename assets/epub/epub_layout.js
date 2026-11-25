// 頁面 fit center，以及翻頁前先快取鄰近頁。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// 拖動時當前頁跟住手指，旁邊露出上一頁或下一頁。放手超過門檻先翻頁。
var pageDrag = null;

function pageDragWidth() {
  var viewer = document.getElementById('viewer');
  return viewer && viewer.clientWidth ? viewer.clientWidth : window.innerWidth;
}

// 資料夾書留在伺服器。單頁只留前後各一頁。雙頁一次轉兩頁，所以要先把
// 下一對和上一對的文件同圖放進快取，轉頁就不用等網路。
function warmPageFile(url) {
  if (!url || warmedPageUrls[url]) return null;
  var img = new Image();
  warmedPageUrls[url] = img;
  img.decoding = 'async';
  img.src = url;
  if (typeof img.decode === 'function') img.decode().catch(function () {});
  return img;
}

function releaseWarmedHref(href) {
  var urls = warmedByHref[href];
  if (!urls) return;
  for (var i = 0; i < urls.length; i++) {
    var img = warmedPageUrls[urls[i]];
    if (img) img.src = '';
    delete warmedPageUrls[urls[i]];
  }
  delete warmedByHref[href];
}

function pageFileUrl(section, relative) {
  try {
    return new URL(relative, section.url).toString();
  } catch (e) {
    return null;
  }
}

function warmSectionImages(section) {
  var doc = section && section.document;
  if (!doc || !doc.querySelectorAll || !section.href) return;
  var urls = warmedByHref[section.href] || [];
  var nodes = doc.querySelectorAll('img[src], image');
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var raw = node.getAttribute('src') ||
      node.getAttribute('href') ||
      node.getAttribute('xlink:href');
    if (!raw || raw.indexOf('data:') === 0) continue;
    var url = pageFileUrl(section, raw);
    if (!url || urls.indexOf(url) !== -1) continue;
    urls.push(url);
    warmPageFile(url);
  }
  warmedByHref[section.href] = urls;
}

function preloadSection(section) {
  if (!section || !book) return;
  var loaded = section.contents
    ? Promise.resolve(section.contents)
    : section.load(book.load.bind(book));
  loaded.then(function () {
    warmSectionImages(section);
  }).catch(function () {});
}

function walkSections(section, dir, count) {
  var found = [];
  var current = section;
  for (var i = 0; i < count && current; i++) {
    var step = dir === 'prev'
      ? (typeof current.prev === 'function' ? current.prev() : null)
      : (typeof current.next === 'function' ? current.next() : null);
    if (!step) break;
    found.push(step);
    current = step;
  }
  return found;
}

function cacheNearbyPages() {
  if (bookOpenAs !== 'directory' || !book || !book.spine || !book.spine.spineItems) return;
  var views = rendition && rendition.manager && rendition.manager.views;
  var first = views && views.length ? views.first() : null;
  var last = views && views.length ? views.last() : null;
  var firstSection = first && first.section;
  var lastSection = last && last.section;
  if (!firstSection && rendition && rendition.location && rendition.location.start) {
    firstSection = book.spine.get(rendition.location.start.href);
    lastSection = firstSection;
  }
  if (!firstSection) return;
  if (!lastSection) lastSection = firstSection;
  // 雙頁的 next() 由右頁再走兩頁；單頁只走一頁。
  var distance = twoPageSpread ? 2 : 1;
  var sections = [firstSection];
  if (lastSection !== firstSection) sections.push(lastSection);
  sections = sections.concat(walkSections(lastSection, 'next', distance));
  sections = sections.concat(walkSections(firstSection, 'prev', distance));
  var keep = {};
  for (var i = 0; i < sections.length; i++) {
    var section = sections[i];
    if (!section || !section.href || keep[section.href]) continue;
    keep[section.href] = true;
    preloadSection(section);
  }
  // 轉頁途中 views 是空的。這時不要拆掉正在載入的那一對。
  if (!views || !views.length) return;
  var items = book.spine.spineItems;
  for (var j = 0; j < items.length; j++) {
    var item = items[j];
    if (!item || !item.href || keep[item.href]) continue;
    if (item.contents && typeof item.unload === 'function') item.unload();
    releaseWarmedHref(item.href);
  }
}

function neighborSection(direction) {
  var views = rendition && rendition.manager && rendition.manager.views;
  var section = null;
  // 雙頁要預覽下一對的第一頁，不是而家右邊嗰頁。
  if (views && views.length) {
    var edge = direction < 0 ? views.last() : views.first();
    section = edge && edge.section;
  }
  if (!section) {
    var href = rendition && rendition.location && rendition.location.start && rendition.location.start.href;
    if (!book || !book.spine || !href) return null;
    section = book.spine.get(href);
  }
  if (!section) return null;
  if (direction < 0 && typeof section.next === 'function') return section.next();
  if (direction > 0 && typeof section.prev === 'function') return section.prev();
  return null;
}

// 預覽佔住而家呢頁嘅格，圖用 fit center 放喺格入面。
function topPageBox(viewer) {
  var frame = viewer.querySelector('.epub-view iframe');
  if (!frame) return null;
  var frameRect = frame.getBoundingClientRect();
  var viewerRect = viewer.getBoundingClientRect();
  return {
    left: frameRect.left - viewerRect.left,
    top: frameRect.top - viewerRect.top,
    width: frameRect.width,
    height: frameRect.height
  };
}

var twoPageSpread = false;

function pageAlignCss() {
  var frame = 'position:relative!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;';
  var image = '.page img{position:absolute!important;top:0!important;right:0!important;bottom:0!important;left:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;object-position:center center!important;}';
  // 圖盒貼住成頁。object-fit 把成幅圖縮入去，比例不變，多出的空白留喺中間。
  return 'html,body{' + frame + 'transform:none!important;}' + '.page{' + frame + '}' + image;
}

function pinPageTop(doc) {
  if (!doc) return;
  var style = doc.getElementById('readflix-page-align');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'readflix-page-align';
    (doc.head || doc.documentElement).appendChild(style);
  }
  style.textContent = pageAlignCss();
  var frames = document.querySelectorAll('#viewer iframe');
  for (var i = 0; i < frames.length; i++) {
    try {
      if (frames[i].contentDocument === doc) frames[i].scrolling = 'no';
    } catch (e) {}
  }
  layoutPages();
}

var spreadLayoutGeneration = 0;

// 轉向當下量到的高度是錯的，epub.js 還會在約 500ms 後清頁重載。
function scheduleSpreadLayout() {
  var generation = ++spreadLayoutGeneration;
  [0, 60, 320, 700].forEach(function (delay) {
    setTimeout(function () {
      if (generation !== spreadLayoutGeneration) return;
      layoutPages();
    }, delay);
  });
}

function bindViewportLayout() {
  if (window.__readflixViewportLayout) return;
  window.__readflixViewportLayout = true;
  window.addEventListener('resize', scheduleSpreadLayout);
  window.addEventListener('orientationchange', function () {
    if (pageDrag && !pageDrag.animating) {
      pageDrag = null;
      resetViewTransforms();
      removePagePreview();
    }
    scheduleSpreadLayout();
  });
}

function spreadFrames() {
  return document.querySelectorAll('#viewer .epub-view iframe');
}

function layoutPages() {
  var viewer = document.getElementById('viewer');
  var container = viewer && viewer.querySelector('.epub-container');
  if (!container) return;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  viewer.style.overflow = 'hidden';
  viewer.style.minHeight = '0';
  if (viewer.style.height !== '100%') viewer.style.height = '100%';
  var frames = spreadFrames();
  // 頁面貼住畫面，圖在格內 fit center。手指落在容器上，左右先至可以翻頁。
  var slot = viewer.clientHeight || window.innerHeight;
  container.style.height = slot + 'px';
  container.style.overflow = 'hidden';
  container.style.touchAction = 'none';
  container.style.alignItems = 'center';
  container.style.justifyContent = 'center';
  for (var j = 0; j < frames.length; j++) {
    var frame = frames[j];
    frame.style.pointerEvents = 'none';
    frame.scrolling = 'no';
    frame.style.height = slot + 'px';
    var view = frame.parentElement;
    if (!view) continue;
    view.style.height = slot + 'px';
    view.style.alignSelf = 'center';
    view.style.flex = '0 0 auto';
    var doc = null;
    try { doc = frame.contentDocument; } catch (e) {}
    var img = doc && doc.querySelector('img');
    if (img && !img.__readflixSpreadFit) {
      img.__readflixSpreadFit = true;
      img.addEventListener('load', layoutPages);
    }
  }
}

