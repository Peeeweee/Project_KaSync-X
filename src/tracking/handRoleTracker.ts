import type { HandData, ScreenRole } from '../store/handState';

export class HandRoleTracker {
  private rolesByHandedness = new Map<string, ScreenRole>();

  reset() {
    this.rolesByHandedness.clear();
  }

  assign<T extends HandData>(hands: T[]): T[] {
    if (hands.length === 0) return hands;

    const assigned = new Set<ScreenRole>();
    const result = hands.map(hand => {
      const knownRole = this.rolesByHandedness.get(hand.handedness);
      if (knownRole && !assigned.has(knownRole)) {
        assigned.add(knownRole);
        return { ...hand, screenRole: knownRole };
      }
      return { ...hand, screenRole: undefined };
    });

    const unassigned = result
      .map((hand, index) => ({ hand, index }))
      .filter(entry => !entry.hand.screenRole)
      .sort((a, b) => a.hand.indexTipPosition.x - b.hand.indexTipPosition.x);

    for (const entry of unassigned) {
      const available: ScreenRole[] = (['left', 'right'] as const).filter(role => !assigned.has(role));
      const role = available.length === 1
        ? available[0]
        : entry.hand.indexTipPosition.x < 0.5 ? 'left' : 'right';

      entry.hand.screenRole = role;
      assigned.add(role);
      if (entry.hand.handedness !== 'Unknown') {
        this.rolesByHandedness.set(entry.hand.handedness, role);
      }
    }

    return result as T[];
  }
}
