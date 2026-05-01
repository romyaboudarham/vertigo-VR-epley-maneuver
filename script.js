
// ─────────────────────────────────────────────
// Tube Canal – A-Frame component
// ─────────────────────────────────────────────
AFRAME.registerComponent('tube-canal', {
  schema: {
    ear: { type: 'string', default: '' }
  },

  init: function () {
    var T = THREE;

    var pts = [
      new T.Vector3( 2.88, 1.30, 1.58),
      new T.Vector3( 3.79, 8.05, 2.76),
      new T.Vector3( 2.18, 8.01, 0.69),
      new T.Vector3(-0.49, 7.94, 0.71),
      new T.Vector3(-2.11, 7.98, 2.80),
      new T.Vector3(-1.19, 1.27, 1.59),
    ];

    // Shift origin to the arch top so the entity's (0,0,0) is the arch peak
    var offset = new T.Vector3(0.85, 7.9, 1.2);
    this.tpts = pts.map(function (p) { return p.clone().sub(offset); });

    var curve = new T.CatmullRomCurve3(this.tpts, false, 'catmullrom', 0.5);

    var tubeMat = new T.MeshPhongMaterial({
      color: 0x88bbff, transparent: true, opacity: 0.28,
      side: T.DoubleSide, shininess: 140, specular: 0xffffff,
    });
    var waterMat = new T.MeshPhongMaterial({
      color: 0x1155cc, transparent: true, opacity: 0.88,
      shininess: 80, specular: 0x4488ff,
    });

    this.group = new T.Group();
    this.group.add(new T.Mesh(new T.TubeGeometry(curve, 300, 0.42, 20, false), tubeMat));

    this.waterMesh = new T.Mesh(new T.TubeGeometry(curve, 300, 0.30, 18, false), waterMat);
    this.group.add(this.waterMesh);

    var capGeo = new T.SphereGeometry(0.42, 16, 16);
    var self = this;
    [this.tpts[0], this.tpts[this.tpts.length - 1]].forEach(function (p) {
      var c = new T.Mesh(capGeo, tubeMat);
      c.position.copy(p);
      self.group.add(c);
    });

    // Otolith crystal sphere — left ear starts at first point, right ear at last point
    var ear = this.data.ear;
    this.crystal = null;
    this.ballT  = 0;
    this.ballV  = 0;
    this.curve  = curve;
    this.curveLength = curve.getLength();

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
    this._invWorld = new THREE.Matrix4();
  },

  tick: function (time, delta) {
    if (!this.el.object3D.visible) return;
    var T = THREE;
    var dt = Math.min(delta / 1000, 0.05); // cap at 50 ms to avoid tunnelling
    this.elapsed += dt;
    var t = this.elapsed;

    // Water ripple animation
    var wpts = this.tpts.map(function (p, i) {
      return new T.Vector3(
        p.x,
        p.y + Math.sin(i * 0.35 + t * 1.4) * 0.012,
        p.z
      );
    });
    this.waterMesh.geometry.dispose();
    this.waterMesh.geometry = new T.TubeGeometry(
      new T.CatmullRomCurve3(wpts, false, 'catmullrom', 0.5),
      300, 0.30, 18, false
    );

    // Ball physics
    if (this.crystal) {
      // Transform world-space gravity into this entity's local space.
      // As the camera (and tube) rotates with head movement, localGravity
      // changes direction, causing the ball to roll through the tube.
      this._invWorld.copy(this.el.object3D.matrixWorld).invert();
      var localGravity = new T.Vector3(0, -1, 0).transformDirection(this._invWorld);

      // Acceleration = component of gravity along the curve tangent (m/s² → t/s²)
      var tangent = this.curve.getTangent(this.ballT);
      var G = 6.0; // gravity strength, tuned for feel
      var accel = localGravity.dot(tangent) * G / this.curveLength;

      // Integrate velocity and position
      this.ballV += accel * dt;
      this.ballV *= Math.exp(-1.8 * dt); // viscous damping (fluid resistance)
      this.ballT += this.ballV * dt;

      // Soft bounce at both ends
      if (this.ballT <= 0) {
        this.ballT = 0;
        this.ballV = Math.abs(this.ballV) * 0.25;
      }
      if (this.ballT >= 1) {
        this.ballT = 1;
        this.ballV = -Math.abs(this.ballV) * 0.25;
      }

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

    // Show the camera-locked tube for the active ear, hide otherwise
    ['left', 'right'].forEach(function (ear) {
      var el = document.getElementById('tube-' + ear);
      if (el) el.setAttribute('visible', name === ear);
    });

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

    var colors = { left: '#2979ff', right: '#ff1744', back: '#546e7a' };
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

    var colors = { left: '#2979ff', right: '#ff1744', back: '#546e7a' };
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
      }
    }, 600);
  });
});
