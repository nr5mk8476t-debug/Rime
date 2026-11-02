// Balancing values in one place. Tune freely; nothing else hard-codes these.
export const BALANCE = {
  startCredits: 87,
  /** rent per 5-day cycle; later cycles escalate by rentGrowth */
  rent: [160],
  rentGrowth: 1.35,
  daysPerCycle: 5,
  /** action budget per in-game day (negotiation rounds, inspections, repairs consume it) */
  actionsPerDay: 12,
};
