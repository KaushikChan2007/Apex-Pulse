Apex Pulse is a real-time decision-intelligence engine for high-stakes,
energy-constrained systems. A hybrid architecture — an XGBoost classifier
for probabilistic judgment, wrapped in a hard-rule safety layer that no
model output can override — recommends actions like Push, Balance, Harvest,
or Overtake while enforcing non-negotiable constraints (reserve floors,
power ceilings, eligibility windows). Built and validated on real 2023
Formula 1 telemetry (FastF1 API, Monza GP), with a proof-of-concept module
showing the same unmodified engine generalizes to EV delivery-rider
battery/route decisions. Includes a dual-console pit-wall/cockpit system
with live WebSocket telemetry sync and a real-time AI strategist.
