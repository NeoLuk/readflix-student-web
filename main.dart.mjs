// Compiles a dart2wasm-generated main module from `source` which can then
// be instantiated via the `instantiate` method.
//
// `source` needs to be a `Response` object (or promise thereof) e.g. created
// via the `fetch()` JS API.
export async function compileStreaming(source) {
  const builtins = {builtins: ['js-string']};
  return new CompiledApp(
      await WebAssembly.compileStreaming(source, builtins), builtins);
}

// Compiles a dart2wasm-generated wasm module from `bytes` which is then
// instantiable via the `instantiate` method.
export async function compile(bytes) {
  const builtins = {builtins: ['js-string']};
  return new CompiledApp(await WebAssembly.compile(bytes, builtins), builtins);
}

class CompiledApp {
  constructor(module, builtins) {
    this.module = module;
    this.builtins = builtins;
  }

  // The second argument is an options object containing:
  // `loadDeferredModules` is a JS function that takes an array of module names
  //   matching wasm files produced by the dart2wasm compiler. It also takes a
  //   callback that should be invoked for each loaded module with 2 arguments:
  //   (1) the module name, (2) the loaded module in a format supported by
  //   `WebAssembly.compile` or `WebAssembly.compileStreaming`. The callback
  //   returns a Promise that resolves when the module is instantiated.
  //   loadDeferredModules should return a Promise that resolves when all the
  //   modules have been loaded and the callback promises have resolved.
  // `loadDeferredId` is a JS function that takes load ID produced by the
  //   compiler when the `use-load-ids` option is passed. Each load ID maps to
  //   one or more wasm files as specified in the emitted JSON file. It also
  //   takes a callback that should be invoked for each loaded module with 2
  //   arguments: (1) the module name, (2) the loaded module in a format
  //   supported by `WebAssembly.compile` or `WebAssembly.compileStreaming`.
  //   The callback returns a Promise that resolves when the module is
  //   instantiated.
  //   loadDeferredId should return a Promise that resolves when all the
  //   modules have been loaded and the callback promises have resolved.
  async instantiate(additionalImports, {loadDeferredModules, loadDeferredId} = {}) {
    let dartInstance;

    // Prints to the console
    function printToConsole(value) {
      if (typeof dartPrint == "function") {
        dartPrint(value);
        return;
      }
      if (typeof console == "object" && typeof console.log != "undefined") {
        console.log(value);
        return;
      }
      if (typeof print == "function") {
        print(value);
        return;
      }

      throw "Unable to print message: " + value;
    }

    // A special symbol attached to functions that wrap Dart functions.
    const jsWrappedDartFunctionSymbol = Symbol("JSWrappedDartFunction");

    function finalizeWrapper(dartFunction, wrapped) {
      wrapped.dartFunction = dartFunction;
      wrapped[jsWrappedDartFunctionSymbol] = true;
      return wrapped;
    }

    // Imports
    const dart2wasm = {
            AB: x0 => new Int16Array(x0),
      AC: (o, start, length) => new Uint8Array(o.buffer, o.byteOffset + start, length),
      AD: (x0,x1,x2) => x0.setAttribute(x1,x2),
      AE: x0 => x0.matches,
      AF: s => s.toUpperCase(),
      AG: (x0,x1) => new Intl.v8BreakIterator(x0,x1),
      AH: (x0,x1,x2) => x0.setSelectionRange(x1,x2),
      AI: (x0,x1) => { x0.min = x1 },
      AJ: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      AK: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1) { return wasmFunction(f,arguments.length,x0,x1) }),
      AL: x0 => x0.sandbox,
      B: s => printToConsole(s),
      BB: x0 => new Uint16Array(x0),
      BC: (o, start, length) => new Int8Array(o.buffer, o.byteOffset + start, length),
      BD: x0 => x0.getBoundingClientRect(),
      BE: (x0,x1) => x0.matchMedia(x1),
      BF: (x0,x1) => x0[x1],
      BG: x0 => x0.v8BreakIterator,
      BH: (x0,x1) => { x0.value = x1 },
      BI: (x0,x1) => { x0.max = x1 },
      BJ: x0 => x0.withCredentials,
      BK: (o,s,v) => o[s] = v,
      BL: x0 => x0.stopLoading(),
      C: Function.prototype.call.bind(Number.prototype.toString),
      CB: x0 => new Int32Array(x0),
      CC: (x0,x1) => x0.querySelector(x1),
      CD: (ms, c) =>
      setTimeout(() => dartInstance.exports.$invokeCallback(c),ms),
      CE: x0 => x0.matches,
      CF: x0 => x0.length,
      CG: () => globalThis.Intl,
      CH: (x0,x1,x2) => x0.setSelectionRange(x1,x2),
      CI: (x0,x1) => { x0.disabled = x1 },
      CJ: (x0,x1) => { x0.timeout = x1 },
      CK: () => Symbol("jsBoxedDartObjectProperty"),
      CL: (x0,x1) => x0.evaluateJavascript(x1),
      D: Function.prototype.call.bind(BigInt.prototype.toString),
      DB: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmI32ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      DC: (x0,x1) => x0.item(x1),
      DD: s => new Date(s * 1000).getTimezoneOffset() * 60,
      DE: o => typeof o === 'function' && o[jsWrappedDartFunctionSymbol] === true,
      DF: (x0,x1) => x0.exec(x1),
      DG: (x0,x1) => x0.segment(x1),
      DH: (x0,x1) => { x0.value = x1 },
      DI: (x0,x1) => { x0.scrollLeft = x1 },
      DJ: (x0,x1,x2) => x0.setRequestHeader(x1,x2),
      DK: () => globalThis.window.flutter_inappwebview_plugin,
      DL: (x0,x1) => x0.goBackOrForward(x1),
      E: (exn) => {
        let stackString = exn.toString();
        let frames = stackString.split('\n');
        let drop = 4;
        if (frames[0].startsWith('Error')) {
            drop += 1;
        }
        return frames.slice(drop).join('\n');
      },
      EB: x0 => new Uint32Array(x0),
      EC: x0 => x0.length,
      ED: Date.now,
      EE: f => f.dartFunction,
      EF: x0 => x0.unicode,
      EG: x0 => x0.index,
      EH: s => {
        if (/[[\]{}()*+?.\\^$|]/.test(s)) {
            s = s.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
        }
        return s;
      },
      EI: (x0,x1) => { x0.spellcheck = x1 },
      EJ: (x0,x1) => { x0.withCredentials = x1 },
      EK: (x0,x1) => x0.append(x1),
      EL: x0 => x0.goForward(),
      F: () => new Error().stack,
      FB: x0 => new Float32Array(x0),
      FC: (x0,x1) => x0.querySelectorAll(x1),
      FD: (handle) => clearTimeout(handle),
      FE: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      FF: x0 => x0.index,
      FG: x0 => x0.next(),
      FH: x0 => x0.value,
      FI: (x0,x1) => { x0.disabled = x1 },
      FJ: (x0,x1) => { x0.responseType = x1 },
      FK: (x0,x1,x2) => x0.setAttribute(x1,x2),
      FL: x0 => x0.goBack(),
      G: s => JSON.stringify(s),
      GB: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmF32ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      GC: (x0,x1) => x0.getAttribute(x1),
      GD: (a, l) => a.length = l,
      GE: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1) { return wasmFunction(f,arguments.length,x0,x1) }),
      GF: (x0,x1) => { x0.lastIndex = x1 },
      GG: x0 => x0.value,
      GH: x0 => x0.selectionDirection,
      GI: (x0,x1) => x0.transferFromImageBitmap(x1),
      GJ: (x0,x1) => x0.getItem(x1),
      GK: (x0,x1) => x0.removeAttribute(x1),
      GL: x0 => x0.reload(),
      H: Function.prototype.call.bind(Number.prototype.toString),
      HB: x0 => new Float64Array(x0),
      HC: x0 => x0.remove(),
      HD: (x0,x1) => x0.closest(x1),
      HE: (p, s, f) => p.then(s, (e) => f(e, e === undefined)),
      HF: x0 => x0.dotAll,
      HG: x0 => x0.done,
      HH: x0 => x0.selectionStart,
      HI: (x0,x1) => x0.getContext(x1),
      HJ: (o, p) => p in o,
      HK: (x0,x1) => x0.prepare(x1),
      HL: (x0,x1) => x0.getResponseHeader(x1),
      I: Function.prototype.call.bind(String.prototype.indexOf),
      IB: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmF64ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      IC: (x0,x1) => x0.appendChild(x1),
      ID: x0 => x0.bottom,
      IE: (o, i) => o[i],
      IF: x0 => x0.ignoreCase,
      IG: (o, m, a) => o[m].apply(o, a),
      IH: x0 => x0.selectionEnd,
      II: (x0,x1) => { x0.height = x1 },
      IJ: x0 => x0.groups,
      IK: (x0,x1) => { x0.ariaHidden = x1 },
      IL: x0 => x0.responseText,
      J: (s, p, i) => s.lastIndexOf(p, i),
      JB: x0 => new ArrayBuffer(x0),
      JC: (x0,x1) => x0.append(x1),
      JD: x0 => x0.top,
      JE: o => o.length,
      JF: x0 => x0.multiline,
      JG: x0 => x0.iterator,
      JH: x0 => x0.value,
      JI: (x0,x1) => { x0.width = x1 },
      JJ: x0 => x0.nextSibling,
      JK: x0 => x0.ariaHidden,
      JL: (x0,x1,x2,x3) => x0.open(x1,x2,x3),
      K: (exn) => {
        if (exn instanceof Error) {
          return exn.stack;
        } else {
          return null;
        }
      },
      KB: (x0,x1,x2) => new Uint8Array(x0,x1,x2),
      KC: (x0,x1,x2,x3) => x0.setProperty(x1,x2,x3),
      KD: x0 => x0.right,
      KE: o => {
        if (o === undefined) return 1;
        var type = typeof o;
        if (type === 'boolean') return 2;
        if (type === 'number') return 3;
        if (type === 'string') return 4;
        if (o instanceof Array) return 5;
        if (ArrayBuffer.isView(o)) {
          if (o instanceof Int8Array) return 6;
          if (o instanceof Uint8Array) return 7;
          if (o instanceof Uint8ClampedArray) return 8;
          if (o instanceof Int16Array) return 9;
          if (o instanceof Uint16Array) return 10;
          if (o instanceof Int32Array) return 11;
          if (o instanceof Uint32Array) return 12;
          if (o instanceof Float32Array) return 13;
          if (o instanceof Float64Array) return 14;
          if (o instanceof DataView) return 15;
        }
        if (o instanceof ArrayBuffer) return 16;
        // Feature check for `SharedArrayBuffer` before doing a type-check.
        if (globalThis.SharedArrayBuffer !== undefined &&
            o instanceof SharedArrayBuffer) {
            return 17;
        }
        if (o instanceof Promise) return 18;
        return 19;
      },
      KF: x0 => x0.pop(),
      KG: () => globalThis.Symbol,
      KH: x0 => x0.selectionDirection,
      KI: x0 => x0.height,
      KJ: (x0,x1) => x0.debug(x1),
      KK: (x0,x1) => { x0.role = x1 },
      KL: x0 => x0.id,
      L: o => o === undefined,
      LB: (x0,x1,x2) => new DataView(x0,x1,x2),
      LC: x0 => x0.style,
      LD: x0 => x0.left,
      LE: x0 => x0.language,
      LF: x0 => x0.flags,
      LG: (x0,x1) => new Intl.Segmenter(x0,x1),
      LH: x0 => x0.selectionStart,
      LI: x0 => x0.width,
      LJ: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1,x2,x3,x4,x5,x6,x7,x8) { return wasmFunction(f,arguments.length,x0,x1,x2,x3,x4,x5,x6,x7,x8) }),
      LK: x0 => x0.role,
      LL: (x0,x1) => { x0.id = x1 },
      M: o => String(o),
      MB: (o, p) => o[p],
      MC: x0 => x0.debugShowSemanticsNodes,
      MD: x0 => x0.clientY,
      ME: (x0,x1,x2,x3) => x0.register(x1,x2,x3),
      MF: (s, m) => {
        try {
          return new RegExp(s, m);
        } catch (e) {
          return String(e);
        }
      },
      MG: x0 => x0.Segmenter,
      MH: x0 => x0.selectionEnd,
      MI: x0 => x0.rasterEndMilliseconds,
      MJ: (o, p, v) => o[p] = v,
      MK: (x0,x1) => { x0.csp = x1 },
      ML: (x0,x1) => x0.getCookieExpirationDate(x1),
      N: (c) =>
      queueMicrotask(() => dartInstance.exports.$invokeCallback(c)),
      NB: (o) => new DataView(o.buffer, o.byteOffset, o.byteLength),
      NC: o => o,
      ND: x0 => x0.clientX,
      NE: () => globalThis.window.FinalizationRegistry,
      NF: o => o instanceof RegExp,
      NG: x0 => x0.buffer,
      NH: x0 => x0.keyCode,
      NI: x0 => x0.rasterStartMilliseconds,
      NJ: (o, t) => typeof o === t,
      NK: x0 => x0.csp,
      NL: x0 => x0.length,
      O: (x0,x1) => x0.didCreateEngineInitializer(x1),
      OB: Function.prototype.call.bind(Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get),
      OC: o => {
        if (o === undefined || o === null) return 0;
        if (typeof o === 'boolean') return 1;
        return 2;
      },
      OD: x0 => x0.changedTouches,
      OE: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      OF: (a, s) => a.join(s),
      OG: x0 => x0.wasmMemory,
      OH: (x0,x1) => x0.scrollIntoView(x1),
      OI: x0 => x0.imageBitmaps,
      OJ: x0 => x0.contentWindow,
      OK: (x0,x1) => { x0.name = x1 },
      OL: x0 => x0.getReader(),
      P: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      PB: o => o.byteOffset,
      PC: (x0,x1) => x0.warn(x1),
      PD: x0 => x0.offsetY,
      PE: x0 => new window.FinalizationRegistry(x0),
      PF: (x0,x1) => x0.error(x1),
      PG: () => globalThis.window._flutter_skwasmInstance,
      PH: x0 => x0.multiViewEnabled,
      PI: x0 => x0.canvasKitMaximumSurfaces,
      PJ: (x0,x1) => { x0.allowFullscreen = x1 },
      PK: x0 => x0.name,
      PL: x0 => x0.value,
      Q: (wasmFunction,f) => finalizeWrapper(f, function() { return wasmFunction(f,arguments.length) }),
      QB: o => o.buffer,
      QC: x0 => x0.console,
      QD: x0 => x0.offsetX,
      QE: (x0,x1) => x0.unregister(x1),
      QF: () => globalThis.console,
      QG: () => new TextDecoder(),
      QH: (x0,x1) => x0.replaceWith(x1),
      QI: (a, i) => a.splice(i, 1),
      QJ: (x0,x1) => { x0.height = x1 },
      QK: (x0,x1) => { x0.referrerPolicy = x1 },
      QL: x0 => x0.done,
      R: (x0,x1) => ({initializeEngine: x0,autoStart: x1}),
      RB: Function.prototype.call.bind(DataView.prototype.getUint8),
      RC: () => globalThis.window,
      RD: x0 => x0.type,
      RE: (x0,x1) => x0.contains(x1),
      RF: s => s.trimRight(),
      RG: (d, digits) => d.toFixed(digits),
      RH: (x0,x1) => { x0.type = x1 },
      RI: a => a.pop(),
      RJ: (x0,x1) => { x0.width = x1 },
      RK: x0 => x0.referrerPolicy,
      RL: x0 => x0.read(),
      S: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1) { return wasmFunction(f,arguments.length,x0,x1) }),
      SB: (b, o) => new DataView(b, o),
      SC: (o, c) => o instanceof c,
      SD: x0 => x0.maxTouchPoints,
      SE: (s) => +s,
      SF: x0 => x0.blur(),
      SG: x0 => x0.maxHeight,
      SH: (x0,x1) => { x0.className = x1 },
      SI: (x0,x1) => x0.getRandomValues(x1),
      SJ: (x0,x1) => { x0.border = x1 },
      SK: x0 => x0.allowFullscreen,
      SL: x0 => x0.body,
      T: x0 => new Promise(x0),
      TB: (b, o, l) => new DataView(b, o, l),
      TC: (string, token) => string.split(token),
      TD: x0 => x0.platform,
      TE: s => {
        if (!/^\s*[+-]?(?:Infinity|NaN|(?:\.\d+|\d+(?:\.\d*)?)(?:[eE][+-]?\d+)?)\s*$/.test(s)) {
          return NaN;
        }
        return parseFloat(s);
      },
      TF: x0 => x0.button,
      TG: x0 => x0.maxWidth,
      TH: (x0,x1) => { x0.tabIndex = x1 },
      TI: () => globalThis.crypto,
      TJ: x0 => x0.style,
      TK: (x0,x1) => { x0.allow = x1 },
      TL: (x0,x1) => new OffscreenCanvas(x0,x1),
      U: (x0,x1,x2) => x0.call(x1,x2),
      UB: Function.prototype.call.bind(DataView.prototype.getFloat64),
      UC: o => o instanceof Array,
      UD: x0 => x0.body,
      UE: s => s.trim(),
      UF: x0 => x0.innerHeight,
      UG: x0 => x0.minHeight,
      UH: (x0,x1) => { x0.name = x1 },
      UI: l => new DataView(new ArrayBuffer(l)),
      UJ: (x0,x1) => { x0.src = x1 },
      UK: x0 => x0.allow,
      UL: x0 => x0.assetBase,
      V: (constructor, args) => {
        const factoryFunction = constructor.bind.apply(
            constructor, [null, ...args]);
        return new factoryFunction();
      },
      VB: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Float64Array) return 1;
        return 2;
      },
      VC: (a, i) => a[i],
      VD: () => globalThis.document,
      VE: x0 => x0.classList,
      VF: x0 => x0.innerWidth,
      VG: x0 => x0.minWidth,
      VH: (x0,x1) => { x0.placeholder = x1 },
      VI: (map, o, v) => map.set(o, v),
      VJ: (x0,x1) => x0.createElement(x1),
      VK: x0 => x0.body,
      VL: x0 => x0.loader,
      W: x0 => new Array(x0),
      WB: Function.prototype.call.bind(DataView.prototype.setFloat64),
      WC: a => a.length,
      WD: (x0,x1,x2) => x0.addEventListener(x1,x2),
      WE: x0 => x0.preventDefault(),
      WF: x0 => x0.height,
      WG: x0 => x0.debugSkipFontRetryDelay,
      WH: (x0,x1) => { x0.autocomplete = x1 },
      WI: (map, o) => map.get(o),
      WJ: () => globalThis.document,
      WK: (x0,x1) => { x0.display = x1 },
      WL: () => globalThis._flutter,
      X: o => [o],
      XB: (t, s) => t.set(s),
      XC: (x0,x1) => x0.test(x1),
      XD: x0 => x0.hasFocus(),
      XE: x0 => x0.parent,
      XF: x0 => x0.width,
      XG: x0 => x0.status,
      XH: (x0,x1) => { x0.name = x1 },
      XI: () => new WeakMap(),
      XJ: x0 => x0.baseURI,
      XK: x0 => x0.getSize(),
      Y: (o0, o1) => [o0, o1],
      YB: Function.prototype.call.bind(DataView.prototype.setFloat32),
      YC: x0 => x0.userAgent,
      YD: x0 => x0.relatedTarget,
      YE: x0 => x0.timeStamp,
      YF: x0 => x0.clientHeight,
      YG: (x0,x1,x2) => x0.set(x1,x2),
      YH: (x0,x1) => { x0.placeholder = x1 },
      YI: x0 => new WeakRef(x0),
      YJ: x0 => x0.hostElement,
      YK: x0 => x0.height,
      Z: (o0, o1, o2) => [o0, o1, o2],
      ZB: Function.prototype.call.bind(DataView.prototype.getFloat32),
      ZC: x0 => x0.navigator,
      ZD: x0 => x0.shiftKey,
      ZE: (x0,x1) => x0.hasAttribute(x1),
      ZF: x0 => x0.clientWidth,
      ZG: x0 => x0.arrayBuffer(),
      ZH: (x0,x1) => { x0.action = x1 },
      ZI: x0 => x0.deref(),
      ZJ: x0 => x0.location,
      ZK: x0 => x0.width,
      a: (o0, o1, o2, o3) => [o0, o1, o2, o3],
      aB: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Float32Array) return 1;
        return 2;
      },
      aC: Function.prototype.call.bind(String.prototype.toLowerCase),
      aD: (decoder, codeUnits) => decoder.decode(codeUnits),
      aE: x0 => x0.buttons,
      aF: (x0,x1) => { x0.content = x1 },
      aG: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof ArrayBuffer) return 1;
        if (globalThis.SharedArrayBuffer !== undefined &&
            o instanceof SharedArrayBuffer) {
          return 2;
        }
        return 3;
      },
      aH: (x0,x1) => { x0.method = x1 },
      aI: () => globalThis.WeakRef,
      aJ: (x0,x1) => x0.getModifierState(x1),
      aK: x0 => x0.remove(),
      b: (x0,x1,x2) => { x0[x1] = x2 },
      bB: Function.prototype.call.bind(DataView.prototype.getUint32),
      bC: Object.is,
      bD: () => new TextDecoder("utf-8", {fatal: true}),
      bE: x0 => x0.ctrlKey,
      bF: (x0,x1) => { x0.name = x1 },
      bG: (x0,x1) => x0.fetch(x1),
      bH: (x0,x1) => { x0.noValidate = x1 },
      bI: (o, offsetInBytes, lengthInBytes) => {
        var dst = new ArrayBuffer(lengthInBytes);
        new Uint8Array(dst).set(new Uint8Array(o, offsetInBytes, lengthInBytes));
        return new DataView(dst);
      },
      bJ: x0 => x0.metaKey,
      bK: x0 => x0.randomUUID(),
      c: o => o,
      cB: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Uint32Array) return 1;
        return 2;
      },
      cC: x0 => x0.vendor,
      cD: () => new TextDecoder("utf-8", {fatal: false}),
      cE: x0 => x0.y,
      cF: x0 => x0.head,
      cG: x0 => x0.fontFallbackBaseUrl,
      cH: (x0,x1) => x0.removeAttribute(x1),
      cI: (a, s, e) => a.slice(s, e),
      cJ: x0 => x0.altKey,
      cK: (x0,x1) => x0.getRandomValues(x1),
      d: (o, p) => o[p],
      dB: Function.prototype.call.bind(DataView.prototype.getInt32),
      dC: (x0,x1) => x0.createTextNode(x1),
      dD: (a, i, v) => a[i] = v,
      dE: x0 => x0.x,
      dF: (x0,x1) => x0.removeChild(x1),
      dG: (handle) => clearInterval(handle),
      dH: x0 => x0.isConnected,
      dI: (x0,x1) => x0.removeItem(x1),
      dJ: x0 => x0.ctrlKey,
      dK: (x0,x1,x2,x3,x4) => x0.createFlutterInAppWebView(x1,x2,x3,x4),
      e: () => globalThis,
      eB: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Int32Array) return 1;
        return 2;
      },
      eC: (x0,x1) => { x0.id = x1 },
      eD: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const setValue = dartInstance.exports.$wasmI8ArraySet;
        for (let i = 0; i < length; i++) {
          setValue(wasmArray, wasmArrayOffset + i, jsArray[jsArrayOffset + i]);
        }
      },
      eE: x0 => x0.scrollTop,
      eF: x0 => x0.firstChild,
      eG: (ms, c) =>
      setInterval(() => dartInstance.exports.$invokeCallback(c), ms),
      eH: x0 => x0.click(),
      eI: x0 => x0.localStorage,
      eJ: x0 => x0.isComposing,
      eK: x0 => x0.crypto,
      f: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      fB: o => o instanceof Uint16Array,
      fC: (x0,x1) => { x0.nonce = x1 },
      fD: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const setValue = dartInstance.exports.$wasmI32ArraySet;
        for (let i = 0; i < length; i++) {
          setValue(wasmArray, wasmArrayOffset + i, jsArray[jsArrayOffset + i]);
        }
      },
      fE: x0 => x0.offsetTop,
      fF: x0 => x0.viewConstraints,
      fG: () => Date.now(),
      fH: (x0,x1) => x0.getElementsByClassName(x1),
      fI: () => globalThis.window,
      fJ: x0 => x0.code,
      fK: (a, l) => a.length = l,
      g: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      gB: Function.prototype.call.bind(DataView.prototype.getUint16),
      gC: x0 => x0.nonce,
      gD: x0 => x0.visibilityState,
      gE: x0 => x0.scrollLeft,
      gF: x0 => x0.hostElement,
      gG: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const setValue = dartInstance.exports.$wasmF32ArraySet;
        for (let i = 0; i < length; i++) {
          setValue(wasmArray, wasmArrayOffset + i, jsArray[jsArrayOffset + i]);
        }
      },
      gH: (x0,x1) => x0.dispatchEvent(x1),
      gI: (x0,x1) => x0.key(x1),
      gJ: x0 => x0.repeat,
      gK: x0 => x0.canScrollHorizontally(),
      h: (x0,x1) => ({addView: x0,removeView: x1}),
      hB: o => o instanceof Int16Array,
      hC: () => globalThis.window.flutterConfiguration,
      hD: (x0,x1,x2) => x0.removeEventListener(x1,x2),
      hE: x0 => x0.offsetLeft,
      hF: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      hG: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const setValue = dartInstance.exports.$wasmF64ArraySet;
        for (let i = 0; i < length; i++) {
          setValue(wasmArray, wasmArrayOffset + i, jsArray[jsArrayOffset + i]);
        }
      },
      hH: (x0,x1) => x0.createEvent(x1),
      hI: x0 => x0.length,
      hJ: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      hK: x0 => x0.canScrollVertically(),
      i: (l, r) => l === r,
      iB: Function.prototype.call.bind(DataView.prototype.getInt16),
      iC: (x0,x1) => x0.attachShadow(x1),
      iD: x0 => x0.disconnect(),
      iE: x0 => x0.offsetParent,
      iF: x0 => ({runApp: x0}),
      iG: (x0,x1,x2,x3) => x0.pushState(x1,x2,x3),
      iH: (x0,x1,x2,x3) => x0.initEvent(x1,x2,x3),
      iI: (x0,x1,x2) => x0.setItem(x1,x2),
      iJ: x0 => x0.userAgent,
      iK: x0 => x0.isSecureContext(),
      j: x0 => x0.random(),
      jB: o => o instanceof Uint8ClampedArray,
      jC: (x0,x1) => x0.createElement(x1),
      jD: x0 => new Intl.Locale(x0),
      jE: (o, p, r) => o.replaceAll(p, () => r),
      jF: Function.prototype.call.bind(DataView.prototype.getBigInt64),
      jG: x0 => x0.history,
      jH: x0 => x0.readText(),
      jI: () => {
        return typeof process != "undefined" &&
               Object.prototype.toString.call(process) == "[object process]" &&
               process.platform == "win32"
      },
      jJ: x0 => x0.navigator,
      jK: x0 => x0.getScrollY(),
      k: o => o,
      kB: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Uint8Array) return 1;
        return 2;
      },
      kC: x0 => x0.scale,
      kD: x0 => x0.region,
      kE: x0 => x0.deltaMode,
      kF: Function.prototype.call.bind(DataView.prototype.setBigInt64),
      kG: (x0,x1,x2,x3) => x0.replaceState(x1,x2,x3),
      kH: x0 => x0.clipboard,
      kI: () => {
        // On browsers return `globalThis.location.href`
        if (globalThis.location != null) {
          return globalThis.location.href;
        }
        return null;
      },
      kJ: (x0,x1,x2,x3) => x0.open(x1,x2,x3),
      kK: x0 => x0.getScrollX(),
      l: o => {
        if (o === undefined || o === null) return 0;
        if (typeof o === 'number') return 1;
        return 2;
      },
      lB: Function.prototype.call.bind(DataView.prototype.setInt32),
      lC: x0 => x0.visualViewport,
      lD: x0 => x0.script,
      lE: x0 => x0.deltaY,
      lF: (o, start, length) => new BigInt64Array(o.buffer, o.byteOffset + start, length),
      lG: o => {
        const proto = Object.getPrototypeOf(o);
        return proto === Object.prototype || proto === null;
      },
      lH: (x0,x1) => x0.writeText(x1),
      lI: () => new XMLHttpRequest(),
      lJ: (x0,x1) => x0.canShare(x1),
      lK: x0 => x0.getSelectedText(),
      m: () => globalThis.Math,
      mB: Function.prototype.call.bind(DataView.prototype.setUint32),
      mC: x0 => x0.devicePixelRatio,
      mD: x0 => x0.language,
      mE: x0 => x0.deltaX,
      mF: () => typeof dartUseDateNowForTicks !== "undefined",
      mG: o => Object.keys(o),
      mH: x0 => x0.unlock(),
      mI: (x0,x1,x2) => x0.open(x1,x2),
      mJ: (x0,x1) => x0.share(x1),
      mK: x0 => x0.src,
      n: (x0,x1) => x0.prepend(x1),
      nB: Function.prototype.call.bind(DataView.prototype.setInt16),
      nC: x0 => x0.height,
      nD: x0 => x0.languages,
      nE: x0 => x0.wheelDeltaY,
      nF: () => Date.now(),
      nG: x0 => x0.state,
      nH: (x0,x1) => x0.lock(x1),
      nI: (x0,x1) => x0.send(x1),
      nJ: x0 => x0.message,
      nK: x0 => x0.getContentWidth(),
      o: (x0,x1,x2,x3) => x0.addEventListener(x1,x2,x3),
      oB: Function.prototype.call.bind(DataView.prototype.setUint16),
      oC: x0 => x0.width,
      oD: (x0,x1) => x0.observe(x1),
      oE: x0 => x0.wheelDeltaX,
      oF: () => 1000 * performance.now(),
      oG: x0 => x0.state,
      oH: x0 => x0.orientation,
      oI: x0 => x0.send(),
      oJ: x0 => x0.name,
      oK: x0 => x0.getContentHeight(),
      p: b => !!b,
      pB: Function.prototype.call.bind(DataView.prototype.setUint8),
      pC: x0 => x0.screen,
      pD: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1) { return wasmFunction(f,arguments.length,x0,x1) }),
      pE: x0 => x0.key,
      pF: (x0,x1) => x0.requestAnimationFrame(x1),
      pG: (x0,x1) => x0.go(x1),
      pH: (x0,x1) => x0.querySelector(x1),
      pI: x0 => x0.abort(),
      pJ: (x0,x1,x2) => ({files: x0,title: x1,text: x2}),
      pK: x0 => x0.printCurrentPage(),
      q: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      qB: Function.prototype.call.bind(DataView.prototype.setInt8),
      qC: (string, times) => string.repeat(times),
      qD: x0 => new ResizeObserver(x0),
      qE: x0 => x0.identifier,
      qF: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      qG: x0 => x0.hash,
      qH: (x0,x1) => { x0.title = x1 },
      qI: x0 => x0.upload,
      qJ: (x0,x1) => ({files: x0,text: x1}),
      qK: (x0,x1,x2,x3) => x0.scrollBy(x1,x2,x3),
      r: (x0,x1) => x0.focus(x1),
      rB: Function.prototype.call.bind(DataView.prototype.getInt8),
      rC: o => {
        if (o === null || o === undefined) return 0;
        if (typeof(o) === 'string') return 1;
        return 2;
      },
      rD: (x0,x1) => x0.getPropertyValue(x1),
      rE: x0 => x0.touches,
      rF: x0 => x0.now(),
      rG: x0 => x0.location,
      rH: (x0,x1) => x0.vibrate(x1),
      rI: x0 => x0.readyState,
      rJ: (x0,x1) => ({files: x0,title: x1}),
      rK: (x0,x1,x2,x3) => x0.scrollTo(x1,x2,x3),
      s: () => ({}),
      sB: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Int8Array) return 1;
        return 2;
      },
      sC: x0 => x0.tabIndex,
      sD: x0 => globalThis.parseFloat(x0),
      sE: x0 => x0.pressure,
      sF: x0 => x0.performance,
      sG: x0 => x0.search,
      sH: x0 => x0.content,
      sI: x0 => x0.responseURL,
      sJ: x0 => ({files: x0}),
      sK: (x0,x1,x2) => x0.injectCSSFileFromUrl(x1,x2),
      t: (o, p, v) => o[p] = v,
      tB: (o, start, length) => new Float64Array(o.buffer, o.byteOffset + start, length),
      tC: (x0,x1) => x0.contains(x1),
      tD: (x0,x1) => x0.getComputedStyle(x1),
      tE: x0 => x0.tiltY,
      tF: x0 => new Uint8Array(x0),
      tG: x0 => x0.pathname,
      tH: x0 => x0.document,
      tI: x0 => x0.statusText,
      tJ: (x0,x1) => ({title: x0,text: x1}),
      tK: (x0,x1) => x0.injectCSSCode(x1),
      u: () => [],
      uB: (o, start, length) => new Float32Array(o.buffer, o.byteOffset + start, length),
      uC: x0 => x0.activeElement,
      uD: x0 => x0.documentElement,
      uE: x0 => x0.tiltX,
      uF: (x0,x1,x2) => x0.slice(x1,x2),
      uG: x0 => x0.parentElement,
      uH: (x0,x1,x2) => x0.insertBefore(x1,x2),
      uI: x0 => x0.getAllResponseHeaders(),
      uJ: x0 => globalThis.Object.isFrozen(x0),
      uK: (x0,x1,x2) => x0.injectJavascriptFileFromUrl(x1,x2),
      v: (a, i) => a.push(i),
      vB: (o, start, length) => new Uint32Array(o.buffer, o.byteOffset + start, length),
      vC: x0 => x0.parentNode,
      vD: x0 => x0.computedStyleMap(),
      vE: x0 => x0.pointerType,
      vF: (x0,x1) => x0.decode(x1),
      vG: (x0,x1) => x0.querySelectorAll(x1),
      vH: x0 => x0.id,
      vI: x0 => x0.status,
      vJ: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1,x2) { return wasmFunction(f,arguments.length,x0,x1,x2) }),
      vK: x0 => x0.getTitle(),
      w: x0 => new Int8Array(x0),
      wB: (o, start, length) => new Int32Array(o.buffer, o.byteOffset + start, length),
      wC: x0 => x0.tagName,
      wD: (x0,x1) => x0.get(x1),
      wE: x0 => x0.pointerId,
      wF: (x0,x1) => x0.adoptText(x1),
      wG: (x0,x1) => x0.removeProperty(x1),
      wH: x0 => x0.offsetHeight,
      wI: x0 => x0.response,
      wJ: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1,x2) { return wasmFunction(f,arguments.length,x0,x1,x2) }),
      wK: x0 => x0.getUrl(),
      x: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmI8ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      xB: (o, start, length) => new Uint16Array(o.buffer, o.byteOffset + start, length),
      xC: x0 => x0.target,
      xD: (o, p) => p in o,
      xE: x0 => x0.getCoalescedEvents(),
      xF: x0 => x0.first(),
      xG: (x0,x1) => x0.add(x1),
      xH: x0 => x0.offsetWidth,
      xI: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      xJ: x0 => globalThis.Object.freeze(x0),
      xK: (x0,x1) => x0.setSettings(x1),
      y: x0 => new Uint8Array(x0),
      yB: (o, start, length) => new Int16Array(o.buffer, o.byteOffset + start, length),
      yC: x0 => x0.clientY,
      yD: (x0,x1) => { x0.textContent = x1 },
      yE: (x0,x1) => x0.getModifierState(x1),
      yF: x0 => x0.next(),
      yG: x0 => x0.data,
      yH: x0 => x0.stopPropagation(),
      yI: (x0,x1,x2,x3) => x0.addEventListener(x1,x2,x3),
      yJ: (x0,x1) => { x0.nativeSyncCommunication = x1 },
      yK: (x0,x1) => x0.item(x1),
      z: x0 => new Uint8ClampedArray(x0),
      zB: (o, start, length) => new Uint8ClampedArray(o.buffer, o.byteOffset + start, length),
      zC: x0 => x0.clientX,
      zD: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      zE: s => s.trimLeft(),
      zF: x0 => x0.current(),
      zG: (x0,x1) => { x0.scrollTop = x1 },
      zH: x0 => x0.disabled,
      zI: (x0,x1,x2,x3) => x0.removeEventListener(x1,x2,x3),
      zJ: (x0,x1) => { x0.nativeAsyncCommunication = x1 },
      zK: x0 => x0.length,

    };

    const baseImports = {
      _: dart2wasm,
      Math: Math,
      Date: Date,
      Object: Object,
      Array: Array,
      Reflect: Reflect,
      WebAssembly: {
        JSTag: WebAssembly.JSTag,
      },
      "": new Proxy({}, { get(_, prop) { return prop; } }),

    };

    const jsStringPolyfill = {
      "charCodeAt": (s, i) => s.charCodeAt(i),
      "compare": (s1, s2) => {
        if (s1 < s2) return -1;
        if (s1 > s2) return 1;
        return 0;
      },
      "concat": (s1, s2) => s1 + s2,
      "equals": (s1, s2) => s1 === s2,
      "fromCharCode": (i) => String.fromCharCode(i),
      "length": (s) => s.length,
      "substring": (s, a, b) => s.substring(a, b),
      "fromCharCodeArray": (a, start, end) => {
        if (end <= start) return '';

        const read = dartInstance.exports.$wasmI16ArrayGet;
        let result = '';
        let index = start;
        const chunkLength = Math.min(end - index, 500);
        let array = new Array(chunkLength);
        while (index < end) {
          const newChunkLength = Math.min(end - index, 500);
          for (let i = 0; i < newChunkLength; i++) {
            array[i] = read(a, index++);
          }
          if (newChunkLength < chunkLength) {
            array = array.slice(0, newChunkLength);
          }
          result += String.fromCharCode(...array);
        }
        return result;
      },
      "intoCharCodeArray": (s, a, start) => {
        if (s === '') return 0;

        const write = dartInstance.exports.$wasmI16ArraySet;
        for (var i = 0; i < s.length; ++i) {
          write(a, start++, s.charCodeAt(i));
        }
        return s.length;
      },
      "test": (s) => typeof s == "string",
    };


    

    dartInstance = await WebAssembly.instantiate(this.module, {
      ...baseImports,
      ...additionalImports,
      
      "wasm:js-string": jsStringPolyfill,
    });

    return new InstantiatedApp(this, dartInstance);
  }
}

class InstantiatedApp {
  constructor(compiledApp, instantiatedModule) {
    this.compiledApp = compiledApp;
    this.instantiatedModule = instantiatedModule;
  }

  // Call the main function with the given arguments.
  invokeMain(...args) {
    this.instantiatedModule.exports.$invokeMain(args);
  }
}
