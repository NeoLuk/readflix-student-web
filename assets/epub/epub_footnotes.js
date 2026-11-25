// 點註腳時把內容送給 Flutter，不讓 epub.js 自己跳走。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

var EPUB_OPS_NS = 'http://www.idpf.org/2007/ops';

function epubTypeOf(element) {
  return (element.getAttributeNS && element.getAttributeNS(EPUB_OPS_NS, 'type')) ||
    element.getAttribute('epub:type') || '';
}

// A link is a footnote reference when the book marks it as one
// (epub:type="noteref" or role="doc-noteref"), or, for older books without
// those semantics, when it is a superscript link to a fragment.
function isFootnoteLink(link) {
  var href = link.getAttribute('href');
  if (!href || href.indexOf('#') === -1) return false;
  if (/\bnoteref\b/.test(epubTypeOf(link)) || link.getAttribute('role') === 'doc-noteref') {
    return true;
  }
  return !!(link.closest('sup') || link.querySelector('sup'));
}

// The element holding the note text. Link targets are often just an empty
// anchor inside the note, so fall back to the nearest note-like container.
function footnoteElement(target) {
  if ((target.textContent || '').trim().length > 3) return target;
  return target.closest('aside, li, dd, p, div, section') || target;
}

// Finds the footnote a link points to, in the same chapter or another file.
// Resolves with { href, text, html }, or text/html null when not found.
function findFootnote(sectionHref, link) {
  var href = resolveRelativeHref(sectionHref, link.getAttribute('href'));
  var hashIndex = href.indexOf('#');
  var path = href.substring(0, hashIndex) || sectionHref;
  var id = decodeURIComponent(href.substring(hashIndex + 1));
  var fullHref = path + '#' + id;

  function result(target) {
    if (!target) return { href: fullHref, text: null, html: null };
    var note = footnoteElement(target);
    return {
      href: fullHref,
      text: (note.textContent || '').replace(/\s+/g, ' ').trim(),
      html: note.innerHTML
    };
  }

  if (path === sectionHref) {
    return Promise.resolve(result(link.ownerDocument.getElementById(id)));
  }
  var section = book.spine.get(path);
  if (!section) return Promise.resolve(result(null));
  var wasLoaded = !!section.contents;
  return section.load(book.load.bind(book)).then(function () {
    var found = result(section.document && section.document.getElementById(id));
    if (!wasLoaded) section.unload();
    return found;
  });
}

// Sends footnote taps to Flutter (onFootnoteTapped) instead of letting
// epub.js navigate to the note (#84). Only active when the app sets the
// callback, so other apps keep the default link behavior.
function setupFootnoteInterception(contents) {
  if (!interceptFootnotes || !contents.document) return;
  var section = book.spine.get(contents.sectionIndex);
  var sectionHref = section ? section.href : '';

  // Capture phase, so this runs before epub.js's own link handlers.
  contents.document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || !isFootnoteLink(link)) return;
    e.preventDefault();
    e.stopPropagation();

    findFootnote(sectionHref, link).then(function (note) {
      if (note.text === null) {
        // Not found: navigate to the note, as epub.js would have done.
        rendition.display(note.href);
        return;
      }
      window.flutter_inappwebview.callHandler('footnoteTapped', {
        href: note.href,
        text: note.text,
        html: note.html,
        linkText: (link.textContent || '').trim()
      });
    }).catch(function (err) {
      console.error('Error reading footnote:', err);
    });
  }, true);
}

