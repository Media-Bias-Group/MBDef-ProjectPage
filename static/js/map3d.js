/* The rotating 3D map at the top of the page.

   Reads static/data/points.json and static/data/points.bin (made by scripts/build_points.py) and draws every term
   as a round dot with plain WebGL (no library). The cloud turns slowly about its vertical axis; it eases to a stop
   while the mouse is over it or while someone drags it, and turns again afterwards. With "reduce motion" set in the
   operating system it does not turn by itself, but can still be dragged. Drawing stops while the map is off screen.

   The map element is a link to the MBDef Explorer: a click opens it, a drag only turns the map. */
(function () {
  'use strict';

  var box = document.getElementById('map3d');
  if (!box) return;
  var canvas = box.querySelector('canvas');
  var labelLayer = box.querySelector('.map3d-labels');
  var note = box.querySelector('.map3d-note');

  var SPIN = (2 * Math.PI) / 100; // radians per second: one turn in 100 s
  var FOV = (40 * Math.PI) / 180;
  var NEAR = 1, FAR = 100, RADIUS = +box.getAttribute('data-radius') || 8; // the frame keeps a sphere of this radius in view (98% of points lie within 10)
  var BG = [0.047, 0.063, 0.086]; // the panel's dark ground, for the depth fade (matches --stage-bg in mbdef.css)
  var HALO = 0.04; // strength of the glow pass: high enough that dense clusters glow, low enough that they do not turn white
  var CLICK_PX = 6; // a press that moves less than this is a click, which follows the link

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('(max-width: 600px)');

  function fail(msg) {
    if (note) { note.textContent = msg; note.hidden = false; }
    box.classList.add('is-failed');
  }

  var gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) { fail('Your browser cannot draw the 3D map (WebGL is off). The Explorer shows the same map.'); return; }

  // ------------------------------------------------------------ shaders
  // two passes over the same points: a faint, wide additive halo, so that dense clusters glow, then the dots themselves
  // as soft round sprites blended over each other. Colours are premultiplied by alpha throughout.
  var VS = [
    'attribute vec3 aPos; attribute vec3 aCol;',
    'uniform float uYaw, uPitch, uDist, uF, uAspect, uPx, uNear, uFar, uHalo;',
    'uniform vec3 uBg; varying vec3 vCol; varying float vA, vH;',
    'void main() {',
    '  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);',
    '  vec3 p = vec3(cy * aPos.x + sy * aPos.z, aPos.y, -sy * aPos.x + cy * aPos.z);',
    '  p = vec3(p.x, cp * p.y - sp * p.z, sp * p.y + cp * p.z);',
    '  float zv = p.z - uDist;',
    '  gl_Position = vec4(p.x * uF / uAspect, p.y * uF, zv * (uFar + uNear) / (uNear - uFar) + 2.0 * uFar * uNear / (uNear - uFar), -zv);',
    '  gl_PointSize = uPx * (uDist / -zv) * mix(1.0, 3.2, uHalo);',   // nearer dots are larger
    '  float far = smoothstep(uDist - 7.0, uDist + 9.0, -zv);',        // 0 in front, 1 at the back
    '  vCol = mix(aCol, uBg, 0.15 * far);',                            // a light depth fade only
    '  vA = mix(0.96, 0.72, far); vH = uHalo;',
    '}'
  ].join('\n');
  var FS = [
    'precision mediump float; uniform float uHaloA; varying vec3 vCol; varying float vA, vH;',
    'void main() {',
    '  float r = length(gl_PointCoord * 2.0 - 1.0);',
    '  if (r > 1.0) discard;',
    '  if (vH > 0.5) { float h = (1.0 - r) * (1.0 - r) * uHaloA * vA; gl_FragColor = vec4(vCol * h, 0.0); return; }',
    '  float a = vA * (1.0 - smoothstep(0.45, 1.0, r));',              // a soft round sprite
    '  vec3 c = vCol * (1.0 + 0.18 * (1.0 - r));',                      // a slightly brighter core
    '  gl_FragColor = vec4(c * a, a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog = gl.createProgram();
  try {
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.error(e); fail('The 3D map could not be drawn here. The Explorer shows the same map.'); return; }
  gl.useProgram(prog);
  var U = {};
  ['uYaw', 'uPitch', 'uDist', 'uF', 'uAspect', 'uPx', 'uNear', 'uFar', 'uBg', 'uHalo', 'uHaloA'].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

  // ------------------------------------------------------------ view state
  var st = {
    yaw: 0.6, pitch: 0.32, speed: 0, // current spin speed, eased towards the target
    hover: false, drag: null, moved: 0, resumeAt: 0, visible: true, n: 0, labels: [],
    w: 1, h: 1, dpr: 1, dist: 30, f: 1
  };

  function wantSpin(now) { return !reduced.matches && !st.hover && !st.drag && now >= st.resumeAt; }

  function resize() {
    var r = box.getBoundingClientRect();
    st.dpr = Math.min(window.devicePixelRatio || 1, 2);
    st.w = Math.max(1, Math.round(r.width)); st.h = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(st.w * st.dpr); canvas.height = Math.round(st.h * st.dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    st.f = 1 / Math.tan(FOV / 2);
    var aspect = st.w / st.h;
    var half = aspect >= 1 ? FOV / 2 : Math.atan(Math.tan(FOV / 2) * aspect); // the narrower of the two half-angles
    // a portrait card shows the cloud's long side across its narrow width: keep a little more of it in view
    st.dist = (aspect >= 1 ? RADIUS : RADIUS * Math.min(1.35, 1 + (1 - aspect) * 1.2)) / Math.sin(half);
    draw();
  }

  // the same projection as the vertex shader, for the labels
  function project(x, y, z) {
    var cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    var px = cy * x + sy * z, pz = -sy * x + cy * z;
    var py = cp * y - sp * pz; pz = sp * y + cp * pz;
    var w = st.dist - pz, aspect = st.w / st.h;
    return { x: (0.5 + (px * st.f) / aspect / w / 2) * st.w, y: (0.5 - (py * st.f) / w / 2) * st.h, depth: pz };
  }

  function draw() {
    if (!st.n) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uYaw, st.yaw); gl.uniform1f(U.uPitch, st.pitch); gl.uniform1f(U.uDist, st.dist);
    gl.uniform1f(U.uF, st.f); gl.uniform1f(U.uAspect, st.w / st.h);
    // dot size in device pixels at the centre's depth: larger on big maps, never below 2.3 CSS pixels
    gl.uniform1f(U.uPx, Math.max(2.3, Math.min(5.4, st.h / 102)) * (narrow.matches ? 0.72 : 1) * st.dpr); // smaller on phones, where the cloud is denser
    gl.blendFunc(gl.ONE, gl.ONE);                 // halo: additive
    gl.uniform1f(U.uHalo, 1);
    gl.drawArrays(gl.POINTS, 0, st.n);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // dots: over
    gl.uniform1f(U.uHalo, 0);
    gl.drawArrays(gl.POINTS, 0, st.n);
    // labels: nearest first; a label is hidden when it would cover a nearer one, and fades out on the far side
    var maxLabels = narrow.matches ? 6 : st.labels.length, placed = [];
    st.labels.forEach(function (L) { L.p = project(L.at[0], L.at[1], L.at[2]); });
    st.labels.slice(0, maxLabels).sort(function (a, b) { return b.p.depth - a.p.depth; }).forEach(function (L) {
      var p = L.p, w = L.w || (L.w = L.el.offsetWidth), h = L.h || (L.h = L.el.offsetHeight);
      var r = { x0: p.x - 6, y0: p.y - h * 0.7, x1: p.x - 6 + w, y1: p.y + h * 0.3 };
      var out = r.x0 < 4 || r.x1 > st.w - 4 || r.y0 < 4 || r.y1 > st.h - 4; // never cut off at the card's edge
      var hit = out || placed.some(function (q) { return r.x0 < q.x1 + 4 && q.x0 < r.x1 + 4 && r.y0 < q.y1 + 2 && q.y0 < r.y1 + 2; });
      var front = Math.max(0, Math.min(1, (p.depth + 4) / 8)); // 0 well behind the centre, 1 in front of it
      L.target = hit ? 0 : 0.8 + 0.2 * front;
      if (!hit) placed.push(r);
    });
    st.labels.forEach(function (L, k) {
      if (k >= maxLabels) L.target = 0;
      L.alpha = L.alpha == null ? L.target : L.alpha + (L.target - L.alpha) * 0.12; // a soft fade, never a jump
      L.el.style.transform = 'translate(' + L.p.x.toFixed(1) + 'px,' + L.p.y.toFixed(1) + 'px)';
      L.el.style.opacity = L.alpha.toFixed(3);
      L.el.style.zIndex = String(Math.round(100 + L.p.depth * 5));
    });
  }

  var last = 0, raf = 0;
  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    var target = wantSpin(now) ? SPIN : 0;
    st.speed += (target - st.speed) * Math.min(1, dt * 2.2); // eases in and out over about a second
    if (Math.abs(st.speed) < 1e-4 && target === 0) st.speed = 0;
    st.yaw += st.speed * dt;
    draw();
    if (!box.dataset.ready) box.dataset.ready = '1'; // drawn once: screenshots and checks wait for this
    var fading = st.labels.some(function (L) { return Math.abs(L.target - L.alpha) > 0.01; });
    if (st.visible && (st.speed !== 0 || target !== 0 || st.drag || fading)) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function kick() { if (!raf && st.n) raf = requestAnimationFrame(frame); }

  // ------------------------------------------------------------ interaction: hover pauses, drag turns, click follows the link
  box.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') { st.hover = true; kick(); } });
  box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { st.hover = false; kick(); } });
  box.addEventListener('dragstart', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    st.drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, pitch: st.pitch, id: e.pointerId };
    st.moved = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the drag still works inside the canvas */ }
    kick();
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!st.drag || e.pointerId !== st.drag.id) return;
    st.moved = Math.max(st.moved, Math.hypot(e.clientX - st.drag.x, e.clientY - st.drag.y));
    if (st.moved >= CLICK_PX) box.classList.add('is-dragging');
    st.yaw = st.drag.yaw + ((e.clientX - st.drag.x) / st.w) * Math.PI * 1.4;
    st.pitch = Math.max(-1.2, Math.min(1.2, st.drag.pitch + ((e.clientY - st.drag.y) / st.h) * Math.PI * 0.8));
  });
  function endDrag(e) {
    if (!st.drag || e.pointerId !== st.drag.id) return;
    st.drag = null; box.classList.remove('is-dragging');
    st.resumeAt = performance.now() + (e.pointerType === 'mouse' ? 0 : 2500); // on touch screens, wait a moment
    kick();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  // a drag ends with a click event on the link: only a press that did not move follows it
  box.addEventListener('click', function (e) { if (st.moved >= CLICK_PX) { e.preventDefault(); st.moved = 0; } }, true);
  box.addEventListener('keydown', function (e) { // arrow keys turn the map; Enter follows the link as usual
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); st.yaw += e.key === 'ArrowLeft' ? -0.25 : 0.25; st.resumeAt = performance.now() + 2500; draw();
  });
  if (reduced.addEventListener) reduced.addEventListener('change', kick);
  if (narrow.addEventListener) narrow.addEventListener('change', function () { draw(); kick(); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { st.visible = es[0].isIntersecting; if (st.visible) kick(); }).observe(box);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(box);
  else window.addEventListener('resize', resize);

  // ------------------------------------------------------------ data
  // points.json may carry the binary itself as base64 (bin_b64), for hosts that serve no .bin files
  var base = box.getAttribute('data-src') || 'static/data/points';
  fetch(base + '.json').then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + r.url); return r.json(); }).then(function (j) {
    if (j.bin_b64) return [j, Uint8Array.from(atob(j.bin_b64), function (c) { return c.charCodeAt(0); }).buffer];
    return fetch(base + '.bin').then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + r.url); return r.arrayBuffer(); }).then(function (b) { return [j, b]; });
  }).then(function (res) {
    var info = res[0], buf = res[1], n = info.count;
    if (buf.byteLength !== n * 7) throw new Error('points.bin has ' + buf.byteLength + ' bytes, expected ' + n * 7);
    var dv = new DataView(buf), pos = new Float32Array(n * 3), col = new Uint8Array(n * 3);
    var off = info.decode.offset, sc = info.decode.scale, rgb = info.topics.map(function (t) { return t.rgb; });
    for (var j = 0; j < n * 3; j++) pos[j] = dv.getUint16(j * 2, true) * sc + off;
    for (var i = 0; i < n; i++) { var c = rgb[dv.getUint8(n * 6 + i)]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }

    function attr(name, data, size, type, norm) {
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, type, norm, 0, 0);
    }
    attr('aPos', pos, 3, gl.FLOAT, false);
    attr('aCol', col, 3, gl.UNSIGNED_BYTE, true);
    gl.uniform1f(U.uNear, NEAR); gl.uniform1f(U.uFar, FAR); gl.uniform3fv(U.uBg, BG);
    gl.uniform1f(U.uHaloA, HALO);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);

    st.labels = info.labels.map(function (L) {
      var el = document.createElement('span');
      el.className = 'map3d-label';
      el.style.setProperty('--dot', 'rgb(' + info.topics[L.topic].rgb.join(',') + ')');
      el.textContent = L.text;
      labelLayer.appendChild(el);
      return { el: el, at: L.at };
    });
    st.n = n;
    // label sizes are measured once; measure again when the web font has arrived
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { st.labels.forEach(function (L) { L.w = 0; L.h = 0; }); draw(); kick(); });
    resize();
    box.classList.add('is-ready');
    kick();
  }).catch(function (e) { console.error(e); fail('The map data could not be loaded. The Explorer shows the same map.'); });
})();
