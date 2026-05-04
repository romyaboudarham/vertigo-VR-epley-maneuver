
// ─────────────────────────────────────────────
// Tube Canal – A-Frame component
// ─────────────────────────────────────────────
AFRAME.registerComponent('tube-canal', {
  schema: {
    ear: { type: 'string', default: '' }
  },

  init: function () {
    var T = THREE;
    var self = this;

    // 1. Raw control points
    var raw = [
      [2.880,2.260,0.962], [3.277,2.553,2.159], [3.673,3.846,3.042],
      [3.790,6.355,3.707], [3.590,8.630,2.816], [3.222,9.530,1.319],
      [2.775,8.775,0.342], [1.986,8.074,0.659], [0.041,8.027,0.642],
      [-0.880,8.822,0.303], [-1.248,9.511,1.336], [-1.797,8.712,2.788],
      [-2.110,6.355,3.693], [-1.991,3.846,3.056], [-1.591,2.512,2.146],
      [-1.190,2.266,0.974]
    ];

    // 2. Apply 40% X-axis Gaussian spread centered at Y=8.8, sigma²=3.5
    //    index < 8 shifts right (+X), index >= 8 shifts left (-X)
    var spreadPts = raw.map(function (p, i) {
      var g = Math.exp(-(p[1] - 8.8) * (p[1] - 8.8) / (2 * 3.5));
      var x = (i < 8) ? p[0] + 0.4 * g : p[0] - 0.4 * g;
      return new T.Vector3(x, p[1], p[2]);
    });

    // 3. Centripetal CatmullRomCurve3 → resample to 80 pts → 3 Laplacian passes
    var seedCurve = new T.CatmullRomCurve3(spreadPts, false, 'centripetal');
    var pts = seedCurve.getSpacedPoints(79); // 80 evenly-spaced points

    for (var pass = 0; pass < 3; pass++) {
      var smoothed = pts.map(function (p, i) {
        if (i === 0 || i === pts.length - 1) return p.clone();
        return new T.Vector3(
          (pts[i - 1].x + p.x + pts[i + 1].x) / 3,
          (pts[i - 1].y + p.y + pts[i + 1].y) / 3,
          (pts[i - 1].z + p.z + pts[i + 1].z) / 3
        );
      });
      pts = smoothed;
    }

    // Center mesh at bounding-box center so entity origin is at the tube's midpoint
    var bbox = new T.Box3().setFromPoints(pts);
    var bboxCenter = new T.Vector3();
    bbox.getCenter(bboxCenter);
    pts = pts.map(function (p) { return p.clone().sub(bboxCenter); });

    // 4. Final curve from smoothed, centred points
    var curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
    this.smoothedPts = pts;
    this.curve = curve;
    this.curveLength = curve.getLength();

    // Two-pass glass: back faces first, front faces second — gives a hollow glass look
    var tubeGeo = new T.TubeGeometry(curve, 500, 0.42, 24, false);

    var backMat = new T.MeshPhongMaterial({
      color: 0xaaddff, transparent: true, opacity: 0.07,
      side: T.BackSide, shininess: 220, specular: 0xffffff, depthWrite: false,
    });
    var frontMat = new T.MeshPhongMaterial({
      color: 0xcceeff, transparent: true, opacity: 0.13,
      side: T.FrontSide, shininess: 220, specular: 0xffffff, depthWrite: false,
    });

    var backMesh  = new T.Mesh(tubeGeo, backMat);
    var frontMesh = new T.Mesh(tubeGeo, frontMat);
    backMesh.renderOrder  = 1;
    frontMesh.renderOrder = 2;

    this.group = new T.Group();
    this.group.add(backMesh);
    this.group.add(frontMesh);

    // Dummy waterMesh so tick() doesn't crash (invisible)
    this.waterMesh = new T.Mesh(new T.TubeGeometry(curve, 60, 0.01, 4, false),
      new T.MeshBasicMaterial({ visible: false }));
    this.group.add(this.waterMesh);

    // Sphere end caps
    var capGeo = new T.SphereGeometry(0.42, 16, 16);
    [pts[0], pts[pts.length - 1]].forEach(function (p) {
      var backCap  = new T.Mesh(capGeo, backMat);
      var frontCap = new T.Mesh(capGeo, frontMat);
      backCap.renderOrder  = 1;
      frontCap.renderOrder = 2;
      backCap.position.copy(p);
      frontCap.position.copy(p);
      self.group.add(backCap);
      self.group.add(frontCap);
    });

    // Otolith crystal sphere — left ear starts at first point, right ear at last point
    var ear = this.data.ear;
    this.crystal = null;
    this.ballT = 0;
    this.ballV = 0;

    if (ear === 'left' || ear === 'right') {
      this.ballT = (ear === 'right') ? 1.0 : 0.0;
      var crystalMat = new T.MeshPhongMaterial({
        color: 0xf5e6a0, emissive: 0x7a6010, shininess: 200, specular: 0xffffff,
      });
      this.crystal = new T.Mesh(new T.SphereGeometry(0.36, 20, 20), crystalMat);
      this.crystal.position.copy(curve.getPoint(this.ballT));
      this.group.add(this.crystal);
    }

    var ambient = new T.AmbientLight(0xffffff, 0.6);
    this.group.add(ambient);
    var pt1 = new T.PointLight(0x4488ff, 3, 20);
    pt1.position.set(0, -1.5, 3);
    this.group.add(pt1);
    var pt2 = new T.PointLight(0xffffff, 1.5, 20);
    pt2.position.set(-4, 0, 2);
    this.group.add(pt2);

    this.el.object3D.add(this.group);
    this.elapsed = 0;
    this._invWorld = new T.Matrix4();
  },

  tick: function (_time, delta) {
    if (!this.el.object3D.visible) return;
    var T = THREE;
    var dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;
    var t = this.elapsed;
    var pts = this.smoothedPts;

    // Water ripple: displace Y of each point by sin(i*0.4 + time*1.3)*0.012
    var wpts = pts.map(function (p, i) {
      return new T.Vector3(
        p.x,
        p.y + Math.sin(i * 0.4 + t * 1.3) * 0.012,
        p.z
      );
    });
    this.waterMesh.geometry.dispose();
    this.waterMesh.geometry = new T.TubeGeometry(
      new T.CatmullRomCurve3(wpts, false, 'centripetal'),
      500, 0.30, 24, false
    );

    // Ball physics — gravity projected onto curve tangent in local space
    if (this.crystal) {
      this._invWorld.copy(this.el.object3D.matrixWorld).invert();
      var localGravity = new T.Vector3(0, -1, 0).transformDirection(this._invWorld);
      var tangent = this.curve.getTangent(this.ballT);
      var G = 6.0;
      var accel = localGravity.dot(tangent) * G / this.curveLength;
      this.ballV += accel * dt;
      this.ballV *= Math.exp(-1.8 * dt);
      this.ballT += this.ballV * dt;
      if (this.ballT <= 0) { this.ballT = 0; this.ballV =  Math.abs(this.ballV) * 0.25; }
      if (this.ballT >= 1) { this.ballT = 1; this.ballV = -Math.abs(this.ballV) * 0.25; }
      this.crystal.position.copy(this.curve.getPoint(this.ballT));
    }
  },

  remove: function () {
    if (this.waterMesh) this.waterMesh.geometry.dispose();
    this.el.object3D.remove(this.group);
  }
});

// ─────────────────────────────────────────────
// Scene Manager
// ─────────────────────────────────────────────
const SceneManager = {
  scenes: ['selection', 'left', 'right'],

  show: function (name) {
    // Hide all scenes
    this.scenes.forEach(function (id) {
      document.getElementById('scene-' + id).setAttribute('visible', false);
    });

    // Show target scene
    document.getElementById('scene-' + name).setAttribute('visible', true);

    ['left', 'right'].forEach(function (ear) {
      var el = document.getElementById('tube-' + ear);
      if (el) el.setAttribute('visible', name === ear);
    });

    // Reset camera to face forward so world-space BACK button is always at bottom center
    var cam = document.querySelector('[camera]');
    if (cam && cam.components['look-controls']) {
      var lc = cam.components['look-controls'];
      lc.yawObject.rotation.y   = 0;
      lc.pitchObject.rotation.x = 0;
    }

    // Reset all gaze-select components so in-progress timers don't carry over
    document.querySelectorAll('[gaze-select]').forEach(function (el) {
      var comp = el.components['gaze-select'];
      if (comp) comp.reset();
    });
  }
};

// ─────────────────────────────────────────────
// gaze-select A-Frame component
// ─────────────────────────────────────────────
AFRAME.registerComponent('gaze-select', {
  schema: {
    duration: { type: 'number', default: 3000 },
    label:    { type: 'string', default: '' }
  },

  init: function () {
    this.timer          = null;
    this.countdownTimers = [];
    this.selected       = false;
    this.visual         = null;
    this.countdownEl    = null;

    this._onEnter = this.onGazeEnter.bind(this);
    this._onLeave = this.onGazeLeave.bind(this);

    this.el.addEventListener('mouseenter', this._onEnter);
    this.el.addEventListener('mouseleave', this._onLeave);
  },

  // Lazily resolve child references once the DOM is ready
  _resolveChildren: function () {
    if (!this.visual)      this.visual      = this.el.querySelector('.visual-dot');
    if (!this.countdownEl) this.countdownEl = this.el.querySelector('.countdown-text');
    if (!this.ring)        this.ring        = this.el.querySelector('.gaze-ring');
  },

  _ringColor: function (color, opacity) {
    if (!this.ring) return;
    this.ring.setAttribute('material', 'color', color);
    this.ring.setAttribute('material', 'opacity', opacity);
  },

  _setCountdown: function (value) {
    if (this.countdownEl) this.countdownEl.setAttribute('value', value);
  },

  _clearCountdownTimers: function () {
    this.countdownTimers.forEach(clearTimeout);
    this.countdownTimers = [];
  },

  // Public reset — called by SceneManager on scene transitions
  reset: function () {
    this.selected = false;
    clearTimeout(this.timer);
    this.timer = null;
    this._clearCountdownTimers();
    this._resolveChildren();

    var colors = { left: '#2979ff', right: '#ff1744', back: '#546e7a', start: '#00c853' };
    var origColor = colors[this.data.label] || '#ffffff';

    if (this.visual) {
      this.visual.removeAttribute('animation__shrink');
      this.visual.removeAttribute('animation__confirm');
      this.visual.setAttribute('scale', { x: 1, y: 1, z: 1 });
      this.visual.setAttribute('material', 'color', origColor);
    }

    this._ringColor(origColor, 0.35);
    this._setCountdown('');
  },

  onGazeEnter: function () {
    if (this.selected) return;
    this._resolveChildren();

    // Highlight the ring on hover
    this._ringColor('#ffffff', 0.9);

    // Shrink the visual dot over the full duration
    this.visual.setAttribute('animation__shrink', {
      property: 'scale',
      from:     { x: 1, y: 1, z: 1 },
      to:       { x: 0.05, y: 0.05, z: 0.05 },
      dur:      this.data.duration,
      easing:   'linear'
    });

    // Countdown: show 3 → 2 → 1 at 0 s, 1 s, 2 s
    var self = this;
    var steps = [
      { delay: 0,    value: '3' },
      { delay: 1000, value: '2' },
      { delay: 2000, value: '1' }
    ];
    steps.forEach(function (step) {
      self.countdownTimers.push(setTimeout(function () {
        self._setCountdown(step.value);
      }, step.delay));
    });

    this.timer = setTimeout(() => this.onSelect(), this.data.duration);
  },

  onGazeLeave: function () {
    if (this.selected) return;
    this._resolveChildren();

    if (this.visual) {
      this.visual.removeAttribute('animation__shrink');
      this.visual.setAttribute('scale', { x: 1, y: 1, z: 1 });
    }

    var colors = { left: '#2979ff', right: '#ff1744', back: '#546e7a', start: '#00c853' };
    this._ringColor(colors[this.data.label] || '#ffffff', 0.35);

    this._clearCountdownTimers();
    this._setCountdown('');

    clearTimeout(this.timer);
    this.timer = null;
  },

  onSelect: function () {
    this.selected = true;

    if (this.visual) {
      this.visual.setAttribute('scale', { x: 1, y: 1, z: 1 });
      this.visual.setAttribute('animation__confirm', {
        property: 'material.color',
        from:     '#ffffff',
        to:       '#00e676',
        dur:      400,
        easing:   'easeOutQuad'
      });
    }

    this.el.sceneEl.emit('option-selected', { label: this.data.label });
  },

  remove: function () {
    this.el.removeEventListener('mouseenter', this._onEnter);
    this.el.removeEventListener('mouseleave', this._onLeave);
    clearTimeout(this.timer);
    this._clearCountdownTimers();
  }
});

// ─────────────────────────────────────────────
// Scene transition logic
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  document.querySelector('a-scene').addEventListener('option-selected', function (e) {
    var label = e.detail.label;

    // Brief pause so the confirm flash is visible before transitioning
    setTimeout(function () {
      if (label === 'left' || label === 'right') {
        SceneManager.show(label);
      } else if (label === 'back') {
        SceneManager.show('selection');
      } else if (label === 'start') {
        // TODO: begin Epley maneuver sequence
      }
    }, 600);
  });
});
