// Classic mode: endless levels, game over when no moves remain.
import { BaseMode } from './mode.js';

export class ClassicScene extends BaseMode {
  constructor(app) {
    super(app);
    this.scoreBadge = 'bejeweler';
  }
  refill() {
    super.refill();
    this.app.badges.report('levelord', this.level);
  }
}
