// 取出頁面文字、選取範圍的座標，以及主題顏色。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// Extracts the text for a CFI range and resolves with {text, cfiRange, xpathRange}.
function _extractText(cfiRange) {
  return book.getRange(cfiRange).then(function (range) {
    var text = range.toString();
    return cfiRangeToXPath(cfiRange).then(function (xpathRange) {
      return { text: text, cfiRange: cfiRange, xpathRange: xpathRange };
    }).catch(function (e) {
      return { text: text, cfiRange: cfiRange, xpathRange: null };
    });
  });
}

//get current page text; awaited via callAsync
function getCurrentPageText() {
  var cfiRange = makeRangeCfi(rendition.location.start.cfi, rendition.location.end.cfi);
  return _extractText(cfiRange);
}

//get text from a range; awaited via callAsync
function getTextFromCfi(startCfi, endCfi) {
  return _extractText(makeRangeCfi(startCfi, endCfi));
}

// Returns the bounding rect (in viewer coordinates) for a CFI range, or null.
// Awaited via callAsync.
function getRectFromCfi(cfiRange) {
  return book.getRange(cfiRange).then(function (range) {
    if (!range) return null;
    var clientRect = range.getBoundingClientRect();
    // Locate the content frame that owns this range to add its iframe offset.
    var offset = { left: 0, top: 0 };
    try {
      var allContents = rendition.getContents();
      for (var i = 0; i < allContents.length; i++) {
        var cont = allContents[i];
        if (cont.document && range.startContainer &&
          cont.document.contains(range.startContainer)) {
          var iframe = cont.document.defaultView.frameElement;
          if (iframe) {
            var ir = iframe.getBoundingClientRect();
            offset = { left: ir.left, top: ir.top };
          }
          break;
        }
      }
    } catch (e) { /* use zero offset */ }
    return {
      left: offset.left + clientRect.left,
      top: offset.top + clientRect.top,
      right: offset.left + clientRect.right,
      bottom: offset.top + clientRect.bottom
    };
  }).catch(function (e) {
    return null;
  });
}

///update theme
function updateTheme(backgroundColor, foregroundColor, customCss) {
  var rules = {};
  var themeObj = {};

  // Build theme object with available colors
  // Only include properties that are provided and not empty
  if (backgroundColor && backgroundColor !== "" && backgroundColor !== "null") {
    themeObj["background"] = backgroundColor;
  }
  if (foregroundColor && foregroundColor !== "" && foregroundColor !== "null") {
    themeObj["color"] = foregroundColor;
  }

  if (Object.keys(themeObj).length > 0) {
    rules["body"] = themeObj;
  }

  // Merge custom CSS
  if (customCss && customCss !== "null" && typeof customCss === 'object') {
    Object.assign(rules, customCss);
  }

  // Update theme if there are rules
  if (Object.keys(rules).length > 0) {
    rendition.themes.register("user-theme", rules);
    rendition.themes.select("user-theme");
  }
}


