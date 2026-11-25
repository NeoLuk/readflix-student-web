// 單頁／雙頁。雙頁時單數頁在右。也管字級和直向橫向捲動。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// 點開雙頁時正在看的那一頁。收回單頁要留它，不要留配對時加進來的另一頁。
var spreadAnchor = null;
var spreadAligning = false;

function setSpread(spread) {
  if (!rendition) return;
  var twoPages = spread && spread !== 'none';
  twoPageSpread = !!twoPages;
  var name = twoPages ? 'always' : 'none';
  // 0 會讓窄螢幕也排兩頁。rendition.spread 把 0 當成沒傳。
  var minSpreadWidth = twoPages ? 0 : 800;
  rendition.settings.spread = name;
  rendition.settings.minSpreadWidth = minSpreadWidth;
  if (rendition._layout) {
    rendition._layout.spread(name, minSpreadWidth);
  }
  var manager = rendition.manager;
  if (!manager) return;
  if (twoPages && manager.views && manager.views.length === 1) {
    spreadAnchor = manager.views.first();
  }
  // 先清掉靠右的空白，再把頁面拉回全寬，否則單頁會被推出畫面。
  if (!twoPages && manager.views) manager.views.forEach(clearSpreadOffset);
  // 不要 display()。那會先清掉所有頁再載入，畫面就一閃一閃。
  manager.updateLayout();
  if (twoPages) alignTwoPageSpread();
  else restoreSinglePage(manager.views);
  var frames = document.querySelectorAll('#viewer .epub-view iframe');
  for (var i = 0; i < frames.length; i++) {
    try {
      pinPageTop(frames[i].contentDocument);
    } catch (e) {}
  }
}

// 沒有 page-spread 時，第 1、3、5 頁在右。spine index 從 0 起。
function spreadSide(section) {
  var props = section && section.properties;
  if (props && typeof props.indexOf === 'function') {
    if (props.indexOf('page-spread-right') !== -1) return 'right';
    if (props.indexOf('page-spread-left') !== -1) return 'left';
  }
  var index = section && typeof section.index === 'number' ? section.index : 0;
  return index % 2 === 0 ? 'right' : 'left';
}

function clearSpreadOffset(view) {
  if (view && view.element) view.element.style.marginLeft = '';
}

function pinViewRight(view) {
  if (!view || !view.element) return;
  var width = typeof view.width === 'function' ? view.width() : 0;
  if (!width && view.layout) width = view.layout.columnWidth || view.layout.width || 0;
  if (!width) return;
  var offset = width + 'px';
  if (view.element.style.marginLeft !== offset) view.element.style.marginLeft = offset;
}

function finishSpreadPair(views) {
  views.show();
  layoutPages();
  cacheNearbyPages();
}

function restoreSinglePage(views) {
  if (!views) return;
  var anchorInList = false;
  if (spreadAnchor) {
    views.forEach(function (view) {
      if (view === spreadAnchor) anchorInList = true;
    });
  }
  if (anchorInList) {
    var extras = [];
    views.forEach(function (view) {
      if (view !== spreadAnchor) extras.push(view);
    });
    for (var i = 0; i < extras.length; i++) views.remove(extras[i]);
  } else {
    while (views.length > 1) views.remove(views.last());
  }
  clearSpreadOffset(views.first());
  spreadAnchor = null;
  cacheNearbyPages();
}

// 雙頁時單數頁在右。左邊是上一頁；第 1 頁沒有上一頁，就留白靠右。
function alignTwoPageSpread() {
  if (spreadAligning || !twoPageSpread || !rendition || !rendition.manager) return;
  var manager = rendition.manager;
  var views = manager.views;
  if (!views || !manager.layout || !views.length) return;
  if (manager.layout.divisor <= 1 || manager.layout.name !== 'pre-paginated') {
    cacheNearbyPages();
    return;
  }
  var current = views.first();
  if (!current || !current.section) return;
  var section = current.section;
  if (spreadSide(section) !== 'right') {
    clearSpreadOffset(current);
    if (views.length >= 2 || !manager.handleNextPrePaginated) return;
    var adding = manager.handleNextPrePaginated(false, section, manager.append);
    if (adding && adding.then) {
      spreadAligning = true;
      adding.then(function () {
        spreadAligning = false;
        if (!twoPageSpread) return;
        finishSpreadPair(views);
      }, function () {
        spreadAligning = false;
      });
    } else {
      cacheNearbyPages();
    }
    return;
  }
  var prev = typeof section.prev === 'function' ? section.prev() : null;
  if (!prev) {
    var next = typeof section.next === 'function' ? section.next() : null;
    var second = views.length > 1 ? views.get(1) : null;
    var removedNext = false;
    if (second && next && second.section && second.section.index === next.index) {
      while (views.length > 1) views.remove(views.last());
      removedNext = true;
    }
    var kept = views.first();
    var before = kept && kept.element ? kept.element.style.marginLeft : '';
    pinViewRight(kept);
    var after = kept && kept.element ? kept.element.style.marginLeft : '';
    if (removedNext || before !== after) {
      layoutPages();
      cacheNearbyPages();
    }
    return;
  }
  spreadAligning = true;
  while (views.length > 1) views.remove(views.last());
  clearSpreadOffset(views.first());
  var addingPrev = manager.prepend ? manager.prepend(prev) : null;
  if (addingPrev && addingPrev.then) {
    addingPrev.then(function () {
      spreadAligning = false;
      if (!twoPageSpread) return;
      finishSpreadPair(views);
    }, function () {
      spreadAligning = false;
    });
    return;
  }
  spreadAligning = false;
  cacheNearbyPages();
}

function setFlow(flow) {
  rendition.flow(flow);
}

function setManager(manager) {
  rendition.manager(manager);
}

function setFontSize(fontSize) {
  rendition.themes.fontSize(`${fontSize}px`);
  rendition.reportLocation();
}

