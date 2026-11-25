// 拖動翻頁。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

function firstImageUrl(section) {
  var doc = section && section.document;
  if (!doc || !doc.querySelector) return null;
  var node = doc.querySelector('img[src], image');
  if (!node) return null;
  var raw = node.getAttribute('src') || node.getAttribute('href') || node.getAttribute('xlink:href');
  if (!raw || raw.indexOf('data:') === 0) return null;
  try {
    return new URL(raw, section.url).toString();
  } catch (e) {
    return null;
  }
}

function resetViewTransforms() {
  var views = document.querySelectorAll('#viewer .epub-view');
  for (var i = 0; i < views.length; i++) {
    views[i].style.transition = 'none';
    views[i].style.transform = '';
  }
}

function removePagePreview() {
  var preview = document.getElementById('page-drag-preview');
  if (preview && preview.parentNode) preview.parentNode.removeChild(preview);
}

function settlePageDrag() {
  if (pageDrag && pageDrag.animating) return;
  pageDrag = null;
  resetViewTransforms();
  removePagePreview();
}

function placePageDrag(dx, animate) {
  var drag = pageDrag;
  if (!drag) return;
  var transition = animate ? 'transform 180ms ease-out' : 'none';
  var views = document.querySelectorAll('#viewer .epub-view');
  for (var i = 0; i < views.length; i++) {
    views[i].style.transition = transition;
    views[i].style.transform = 'translate3d(' + dx + 'px,0,0)';
  }
  if (!drag.preview) return;
  var origin = drag.direction < 0 ? drag.width : -drag.width;
  drag.preview.style.transition = transition;
  drag.preview.style.transform = 'translate3d(' + (origin + dx) + 'px,0,0)';
}

function ensurePagePreview(direction) {
  var drag = pageDrag;
  if (!drag || drag.direction === direction && drag.preview) return;
  drag.direction = direction;
  var section = neighborSection(direction);
  drag.neighbor = section;
  removePagePreview();
  drag.preview = null;
  if (!section) return;
  var viewer = document.getElementById('viewer');
  if (!viewer) return;
  var preview = document.createElement('div');
  preview.id = 'page-drag-preview';
  preview.style.position = 'absolute';
  preview.style.top = '0';
  preview.style.left = '0';
  preview.style.width = '100%';
  preview.style.height = '100%';
  preview.style.pointerEvents = 'none';
  preview.style.overflow = 'hidden';
  preview.style.zIndex = '2';
  preview.style.setProperty('background-color', '#ffffff', 'important');
  viewer.appendChild(preview);
  drag.preview = preview;
  function paint() {
    var url = firstImageUrl(section);
    if (!url || !drag.preview) return;
    var box = topPageBox(viewer);
    var img = drag.preview.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      drag.preview.appendChild(img);
    }
    img.src = url;
    img.style.position = 'absolute';
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center center';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    if (!box) return;
    img.style.left = box.left + 'px';
    img.style.top = box.top + 'px';
    img.style.width = box.width + 'px';
    img.style.height = box.height + 'px';
  }
  if (section.document) paint();
  else if (typeof section.load === 'function' && book && book.load) {
    section.load(book.load.bind(book)).then(paint).catch(function () {});
  }
}

function releaseStuckSelection() {
  isSelecting = false;
  lastCfiRange = null;
  hasSentSelection = false;
  try {
    var selection = window.getSelection && window.getSelection();
    if (selection) selection.removeAllRanges();
  } catch (e) {}
  try {
    if (!rendition || !rendition.getContents) return;
    rendition.getContents().forEach(function (contents) {
      try {
        var inner = contents.window && contents.window.getSelection();
        if (inner) inner.removeAllRanges();
      } catch (err) {}
    });
  } catch (e) {}
}

function finishPageDrag(commit) {
  var drag = pageDrag;
  if (!drag || drag.animating) return;
  var turned = commit && drag.neighbor && drag.axis === 'x';
  drag.animating = true;
  var direction = drag.direction;
  var target = turned ? (direction < 0 ? -drag.width : drag.width) : 0;
  placePageDrag(target, true);
  setTimeout(function () {
    if (pageDrag !== drag) return;
    // settlePageDrag 見到 animating 會直接返回。收尾之前要先清走，
    // 否則短掃或者掃到盡頭之後，下一下手勢會被永久擋着。
    drag.animating = false;
    if (!turned || !rendition) {
      settlePageDrag();
      return;
    }
    if (drag.preview) {
      drag.preview.style.transition = 'none';
      drag.preview.style.transform = 'none';
    }
    resetViewTransforms();
    pageDrag = null;
    releaseStuckSelection();
    if (direction < 0) rendition.next();
    else rendition.prev();
    setTimeout(removePagePreview, 400);
  }, 180);
}

function beginPageDrag(id, x, y) {
  if (pageDrag && pageDrag.animating) {
    if (Date.now() - pageDrag.startedAt < 400) return;
    pageDrag.animating = false;
    settlePageDrag();
  }
  pageDrag = {
    pointerId: id,
    startX: x,
    startY: y,
    dx: 0,
    width: pageDragWidth(),
    direction: 0,
    neighbor: null,
    preview: null,
    animating: false,
    axis: '',
    startedAt: Date.now()
  };
}

// 橫向才算翻頁。回傳 true 代表瀏覽器不要再把這下當成捲動。
function movePageDrag(id, x, y) {
  var drag = pageDrag;
  if (!drag || drag.animating || id !== drag.pointerId) return false;
  var dx = x - drag.startX;
  var dy = y - drag.startY;
  if (!drag.axis) {
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    if (adx < 8 && ady < 8) {
      // 方向未定。橫向早一點攔截，iPhone 先唔會吞咗呢下掃頁。直向未夠橫就先放手。
      if (adx < 6 || adx <= ady) return false;
      return true;
    }
    drag.axis = adx >= ady ? 'x' : 'y';
  }
  if (drag.axis !== 'x') return false;
  releaseStuckSelection();
  var direction = dx < 0 ? -1 : 1;
  if (drag.direction !== direction) ensurePagePreview(direction);
  var limit = drag.neighbor ? drag.width : drag.width * 0.28;
  drag.dx = Math.max(-limit, Math.min(limit, dx));
  placePageDrag(drag.dx, false);
  return true;
}

function endPageDrag(id) {
  var drag = pageDrag;
  if (!drag || drag.animating || id !== drag.pointerId) return;
  if (drag.axis !== 'x') {
    pageDrag = null;
    return;
  }
  var commit = Math.abs(drag.dx) > Math.max(36, drag.width * 0.18);
  finishPageDrag(commit);
}

function installPageGestures(doc, ignoreTouch) {
  if (!doc) return;
  var root = doc.documentElement || doc.body;
  if (!root) return;
  // 換頁可能換咗文件根節點。舊標記會令新手勢裝唔上，掃頁就停咗。
  if (doc.__readflixGestures === root) return;
  doc.__readflixGestures = root;
  root.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  }, true);
  root.addEventListener('dragstart', function (e) {
    e.preventDefault();
  }, true);
  var style = doc.createElement('style');
  // 頁面唔捲。橫向要由 touchmove 的 preventDefault 接住，否則 iPhone 會取消這下掃頁。
  style.textContent = 'html,body{touch-action:none;}img{-webkit-user-drag:none;user-select:none;-webkit-touch-callout:none;}';
  (doc.head || root).appendChild(style);

  root.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    if (contentsMenuOpen || isPageEdgeTarget(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    beginPageDrag(e.pointerId, e.screenX, e.screenY);
  }, true);
  root.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    if (movePageDrag(e.pointerId, e.screenX, e.screenY)) e.preventDefault();
  }, { capture: true, passive: false });
  function endPointer(e) {
    if (e.pointerType === 'touch') return;
    endPageDrag(e.pointerId);
  }
  root.addEventListener('pointerup', endPointer, true);
  root.addEventListener('pointercancel', endPointer, true);
  // 手指移出書頁先放開會收唔到 pointerup，狀態會一路卡着。
  var win = doc.defaultView || window;
  win.addEventListener('pointerup', endPointer, true);
  win.addEventListener('pointercancel', endPointer, true);
  win.addEventListener('blur', function () {
    if (pageDrag && !pageDrag.animating) finishPageDrag(false);
  });

  if (ignoreTouch) return;
  root.addEventListener('touchstart', function (e) {
    if (contentsMenuOpen || isPageEdgeTarget(e) || e.touches.length !== 1) return;
    var t = e.touches[0];
    beginPageDrag(t.identifier, t.screenX, t.screenY);
  }, { capture: true, passive: true });
  root.addEventListener('touchmove', function (e) {
    if (!e.touches.length) return;
    var t = e.touches[0];
    if (movePageDrag(t.identifier, t.screenX, t.screenY)) e.preventDefault();
  }, { capture: true, passive: false });
  function endTouch(e) {
    var t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    endPageDrag(t.identifier);
  }
  root.addEventListener('touchend', endTouch, true);
  root.addEventListener('touchcancel', endTouch, true);
}

function detectSwipe(el, func) {
  swipe_det = new Object();
  swipe_det.sX = 0;
  swipe_det.sY = 0;
  swipe_det.eX = 0;
  swipe_det.eY = 0;
  swipe_det.blocked = false; // Track if swipe should be blocked
  swipe_det.hasMoved = false; // Track if touch has moved
  swipe_det.touchStartTime = null; // Track when touch started
  var min_x = 50;  //min x swipe for horizontal swipe
  var max_x = 40;  //max x difference for vertical swipe
  var min_y = 40;  //min y swipe for vertical swipe
  var max_y = 50;  //max y difference for horizontal swipe
  var direc = "";
  ele = el
  ele.addEventListener('touchstart', function (e) {
    // Check if selection exists at start of gesture
    if (hasActiveSelection()) {
      // Store position and time to detect if it's a tap or swipe
      swipe_det.blocked = false; // Don't block yet - wait to see if it's a tap
      swipe_det.hasMoved = false;
      swipe_det.touchStartTime = Date.now();
      if (e.touches && e.touches.length > 0) {
        var t = e.touches[0];
        swipe_det.sX = t.screenX;
        swipe_det.sY = t.screenY;
        swipe_det.eX = swipe_det.sX;
        swipe_det.eY = swipe_det.sY;
      }
      // Don't preventDefault yet - allow taps to deselect
    } else {
      swipe_det.blocked = false;
      swipe_det.hasMoved = false;
      swipe_det.touchStartTime = Date.now();
      var t = e.touches[0];
      swipe_det.sX = t.screenX;
      swipe_det.sY = t.screenY;
      swipe_det.eX = swipe_det.sX;
      swipe_det.eY = swipe_det.sY;
    }
  }, { capture: true, passive: false }); // Use options object with passive: false
  ele.addEventListener('touchmove', function (e) {
    // If selection exists, check if it's a swipe
    if (hasActiveSelection()) {
      var t = e.touches[0];
      swipe_det.eX = t.screenX;
      swipe_det.eY = t.screenY;

      var deltaX = Math.abs(swipe_det.eX - swipe_det.sX);
      var deltaY = Math.abs(swipe_det.eY - swipe_det.sY);

      // If there's significant movement, it's a swipe - block it
      if (deltaX > 10 || deltaY > 10) {
        swipe_det.hasMoved = true;
        // Block horizontal swipes
        if (deltaX > 30 && deltaX > deltaY * 1.5) {
          swipe_det.blocked = true;
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
        // Block significant horizontal movement
        if (deltaX > 50) {
          swipe_det.blocked = true;
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
    } else {
      // Only prevent default if we're actually tracking a swipe
      e.preventDefault();
      var t = e.touches[0];
      swipe_det.eX = t.screenX;
      swipe_det.eY = t.screenY;
    }
  }, { capture: true, passive: false }); // Use options object with passive: false
  ele.addEventListener('touchend', function (e) {
    // If selection exists, check if it was a tap or swipe
    if (hasActiveSelection()) {
      if (swipe_det.touchStartTime !== null) {
        var deltaX = Math.abs(swipe_det.eX - swipe_det.sX);
        var deltaY = Math.abs(swipe_det.eY - swipe_det.sY);
        var touchDuration = Date.now() - swipe_det.touchStartTime;

        // If minimal movement and short duration, it's a tap - allow it to deselect
        if (!swipe_det.hasMoved && deltaX < 10 && deltaY < 10 && touchDuration < 300) {
          // Don't preventDefault - allow tap to deselect
        } else if (deltaX > 30 && deltaX > deltaY * 1.5) {
          // It was a horizontal swipe - block it
          swipe_det.blocked = true;
          e.preventDefault();
          e.stopPropagation();
          return false;
        } else if (deltaX > 50) {
          // Significant horizontal movement - block it
          swipe_det.blocked = true;
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      }
      // If it was a tap, don't preventDefault
      swipe_det.blocked = false;
      return;
    }

    // Don't process swipe if it was blocked
    if (swipe_det.blocked) {
      swipe_det.blocked = false;
      swipe_det.hasMoved = false;
      swipe_det.touchStartTime = null;
      return;
    }

    //horizontal detection
    if ((((swipe_det.eX - min_x > swipe_det.sX) || (swipe_det.eX + min_x < swipe_det.sX)) && ((swipe_det.eY < swipe_det.sY + max_y) && (swipe_det.sY > swipe_det.eY - max_y)))) {
      if (swipe_det.eX > swipe_det.sX) direc = "r";
      else direc = "l";
    }
    //vertical detection
    if ((((swipe_det.eY - min_y > swipe_det.sY) || (swipe_det.eY + min_y < swipe_det.sY)) && ((swipe_det.eX < swipe_det.sX + max_x) && (swipe_det.sX > swipe_det.eX - max_x)))) {
      if (swipe_det.eY > swipe_det.sY) direc = "d";
      else direc = "u";
    }

    if (direc != "") {
      if (typeof func == 'function') func(el, direc);
    }
    direc = "";
    swipe_det.blocked = false;
    swipe_det.hasMoved = false;
    swipe_det.touchStartTime = null;
  }, { capture: true, passive: false }); // Use options object with passive: false
}

// 全部腳本都載完才通知 Dart。拆檔之後若在中途通知，loadBook 會叫到還沒裝上的函式。
window.addEventListener("flutterInAppWebViewPlatformReady", function (event) {
  window.flutter_inappwebview.callHandler('readyToLoad');
});

