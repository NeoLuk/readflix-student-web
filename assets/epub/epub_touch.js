// 把畫面裡的觸控座標送給 Flutter。
// swipe.html 依序載入。這些是普通腳本，函式留在全域，Dart 用名字呼叫。

// Global touch event handlers for iOS compatibility
// On iOS, touch events in iframes may not fire, so we also listen on the main document
(function () {
  // Helper function to safely call flutter_inappwebview handler
  function callFlutterHandlerGlobal(handlerName, ...args) {
    try {
      if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
        window.flutter_inappwebview.callHandler(handlerName, ...args);
        return true;
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error calling flutter handler:', err);
      }
    }
    return false;
  }

  // Helper function to get normalized coordinates from main window
  function getNormalizedCoordinatesFromMainWindow(touchEvent, isTouchEnd) {
    try {
      var touch = null;
      if (isTouchEnd) {
        touch = touchEvent.changedTouches && touchEvent.changedTouches.length > 0 ? touchEvent.changedTouches[0] : null;
      } else {
        touch = touchEvent.touches && touchEvent.touches.length > 0 ? touchEvent.touches[0] : null;
      }
      if (!touch) return null;

      var webViewWidth = window.innerWidth;
      var webViewHeight = window.innerHeight;

      // Get viewer element to check if touch is within bounds
      var viewer = document.getElementById('viewer');
      if (!viewer) {
        // If no viewer element, normalize directly to WebView
        return {
          x: touch.clientX / webViewWidth,
          y: touch.clientY / webViewHeight
        };
      }

      var viewerRect = viewer.getBoundingClientRect();

      // Check if touch is within viewer bounds (with small tolerance for edge cases)
      var touchX = touch.clientX;
      var touchY = touch.clientY;
      var tolerance = 5; // 5px tolerance
      if (touchX < viewerRect.left - tolerance || touchX > viewerRect.right + tolerance ||
        touchY < viewerRect.top - tolerance || touchY > viewerRect.bottom + tolerance) {
        return null; // Touch is outside viewer
      }

      // Clamp coordinates to viewer bounds
      var clampedX = Math.max(viewerRect.left, Math.min(viewerRect.right, touchX));
      var clampedY = Math.max(viewerRect.top, Math.min(viewerRect.bottom, touchY));

      // Calculate position relative to viewer
      var relativeX = clampedX - viewerRect.left;
      var relativeY = clampedY - viewerRect.top;

      // Normalize to 0-1 range relative to viewer dimensions
      // This matches the coordinate system used by the iframe-based handlers
      var normalizedX = relativeX / viewerRect.width;
      var normalizedY = relativeY / viewerRect.height;

      // However, we need to account for the viewer's position in the WebView
      // If the viewer doesn't fill the entire WebView, we need to adjust
      // For now, let's assume the viewer fills most of the WebView and use viewer-relative coordinates
      // But actually, the iframe handlers normalize to WebView, so we should too
      // Let's calculate absolute position in WebView
      var absoluteX = clampedX / webViewWidth;
      var absoluteY = clampedY / webViewHeight;

      return {
        x: absoluteX,
        y: absoluteY
      };
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error calculating coordinates from main window:', e);
      }
      return null;
    }
  }

  // Track if we've already fired touch events to avoid duplicates
  var lastTouchDownTime = 0;
  var lastTouchUpTime = 0;
  var TOUCH_DEBOUNCE_MS = 50; // Prevent duplicate events within 50ms

  // Touch event handler function
  function handleTouchStart(e) {
    try {
      var coords = getNormalizedCoordinatesFromMainWindow(e, false);
      if (coords) {
        var now = Date.now();
        // Only fire if enough time has passed since last event (debounce)
        if (now - lastTouchDownTime > TOUCH_DEBOUNCE_MS) {
          lastTouchDownTime = now;
          callFlutterHandlerGlobal('onTouchDown', coords.x, coords.y);
        }
      }
    } catch (err) {
      // Debug log errors
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error in global touchstart handler:', err);
      }
    }
  }

  function handleTouchEnd(e) {
    try {
      var coords = getNormalizedCoordinatesFromMainWindow(e, true);
      if (coords) {
        var now = Date.now();
        // Only fire if enough time has passed since last event (debounce)
        if (now - lastTouchUpTime > TOUCH_DEBOUNCE_MS) {
          lastTouchUpTime = now;
          callFlutterHandlerGlobal('onTouchUp', coords.x, coords.y);
        }
      }
    } catch (err) {
      // Debug log errors
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error in global touchend handler:', err);
      }
    }
  }

  // Try multiple attachment points for maximum compatibility
  // 1. Document (capture phase)
  document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
  document.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });

  // 2. Document (bubble phase)
  document.addEventListener('touchstart', handleTouchStart, { capture: false, passive: true });
  document.addEventListener('touchend', handleTouchEnd, { capture: false, passive: true });

  // 3. Window
  window.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
  window.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });

  // 4. Body element (when available)
  if (document.body) {
    document.body.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.body.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
  } else {
    // Wait for body to be available
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body) {
        document.body.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
        document.body.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
      }
    });
  }

  // 5. Also try pointer events as fallback (iOS 13+)
  function handlePointerDown(e) {
    try {
      if (e.pointerType === 'touch' || e.pointerType === '') {
        var webViewWidth = window.innerWidth;
        var webViewHeight = window.innerHeight;
        var coords = {
          x: e.clientX / webViewWidth,
          y: e.clientY / webViewHeight
        };
        var now = Date.now();
        if (now - lastTouchDownTime > TOUCH_DEBOUNCE_MS) {
          lastTouchDownTime = now;
          callFlutterHandlerGlobal('onTouchDown', coords.x, coords.y);
        }
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error in pointerdown handler:', err);
      }
    }
  }

  function handlePointerUp(e) {
    try {
      if (e.pointerType === 'touch' || e.pointerType === '') {
        var webViewWidth = window.innerWidth;
        var webViewHeight = window.innerHeight;
        var coords = {
          x: e.clientX / webViewWidth,
          y: e.clientY / webViewHeight
        };
        var now = Date.now();
        if (now - lastTouchUpTime > TOUCH_DEBOUNCE_MS) {
          lastTouchUpTime = now;
          callFlutterHandlerGlobal('onTouchUp', coords.x, coords.y);
        }
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error in pointerup handler:', err);
      }
    }
  }

  document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
  document.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true });
  window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
  window.addEventListener('pointerup', handlePointerUp, { capture: true, passive: true });

})();

