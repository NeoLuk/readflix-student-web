// 閱讀器共用的全域狀態。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

var book = ePub();
var rendition;
var displayed;
var chapters = []
var contentsMenuOpen = false
var contentsCurrentHref = ''
var clearSelectionOnPageChange = true; // Global flag for selection clearing behavior
var selectAnnotationRange = false; // Global flag for programmatically selecting annotation ranges
var initialXPathProcessed = false; // Flag to prevent processing initialXPath multiple times
var xpathDisplayInProgress = false; // Flag to prevent multiple XPath displays
var initialPositionLoading = false; // Flag to track if initial position is being loaded
// Global selection state tracking (needed for blocking navigation when selection is active)
var isSelecting = false;
var lastCfiRange = null;
var selectionTimeout = null;
var hasSentSelection = false; // Track if we've actually sent a selection event to Flutter
var lastTapCoords = null; // Store the last tap coordinates for onTouchDown/onTouchUp callbacks
var interceptFootnotes = false; // Send footnote taps to Flutter instead of navigating
var currentLoadToken = 0; // Incremented per loadBook; stale async callbacks bail out
var bookOpenAs = null;
var warmedPageUrls = {};
var warmedByHref = {};

