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
