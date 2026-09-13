"""
Automated unit tests for engine.py
Covers:
- Hard rules enforcement
- Compliance auditing
- SoC trajectory forecasting
- Edge cases (SoC <= 15, DRS=False, battery zero depletion)
"""

import pandas as pd
from engine import (
    recommend_energy_mode,
    evaluate_rule_compliance,
    evaluate_rule_compliance_detail,
    soc_trajectory_forecast,
    find_lap_battery_runs_dry,
    ENERGY_COST_PCT,
    get_default_model,
)

def test_hard_rule_soc_under_15():
    """If battery_soc_pct <= 15, mode must be Harvest or Balance regardless of gap or DRS."""
    state = {
        "battery_soc_pct": 14.9,
        "gap_sec": 0.2,
        "closing_speed_kph": 15.0,
        "drs_available": True,
        "laps_remaining": 10,
        "tyre_age": 2,
    }
    rec = recommend_energy_mode(state)
    assert rec["mode"] in ["Harvest", "Balance"], f"Expected Harvest or Balance but got {rec['mode']}"
    assert rec["mode"] != "Overtake"
    assert rec["mode"] != "Push"

def test_hard_rule_drs_false_blocks_overtake():
    """Mode can ONLY be Overtake if drs_available is True."""
    state = {
        "battery_soc_pct": 80.0,
        "gap_sec": 0.3,
        "closing_speed_kph": 20.0,
        "drs_available": False,
        "laps_remaining": 5,
        "tyre_age": 1,
    }
    rec = recommend_energy_mode(state)
    assert rec["mode"] != "Overtake", "Overtake must never be recommended when drs_available is False"

def test_hard_rule_gap_over_1_blocks_overtake():
    """Mode can ONLY be Overtake if gap_sec <= 1.0."""
    state = {
        "battery_soc_pct": 85.0,
        "gap_sec": 1.05,
        "closing_speed_kph": 25.0,
        "drs_available": True,
        "laps_remaining": 5,
        "tyre_age": 1,
    }
    rec = recommend_energy_mode(state)
    assert rec["mode"] != "Overtake", "Overtake must never be recommended when gap_sec > 1.0"

def test_compliance_flags_drs_false_violation():
    """evaluate_rule_compliance flags VIOLATION if Overtake recommended with drs_available=False."""
    state = {
        "battery_soc_pct": 50.0,
        "gap_sec": 0.5,
        "drs_available": False,
    }
    res = evaluate_rule_compliance(state, recommended_mode="Overtake")
    assert res == "VIOLATION"

def test_compliance_flags_gap_violation():
    """evaluate_rule_compliance flags VIOLATION if Overtake recommended with gap > 1.0."""
    state = {
        "battery_soc_pct": 50.0,
        "gap_sec": 1.2,
        "drs_available": True,
    }
    res = evaluate_rule_compliance(state, recommended_mode="Overtake")
    assert res == "VIOLATION"

def test_compliance_flags_zero_depletion_violation():
    """Flags violation if battery_soc_pct would drop below 0 after cost is applied."""
    state = {
        "battery_soc_pct": 2.0,
        "gap_sec": 2.0,
        "drs_available": False,
    }
    # Push costs 4.0%, so 2.0 - 4.0 = -2.0 < 0
    res = evaluate_rule_compliance(state, recommended_mode="Push")
    assert res == "VIOLATION"

def test_compliance_valid_overtake():
    """Flags COMPLIANT for legitimate overtake."""
    state = {
        "battery_soc_pct": 60.0,
        "gap_sec": 0.5,
        "drs_available": True,
    }
    res = evaluate_rule_compliance(state, recommended_mode="Overtake")
    assert res == "COMPLIANT"

def test_soc_trajectory_always_push_exhaustion():
    """Always push drains 4% per lap and runs dry at 40% / 4% = 10 laps."""
    traj = soc_trajectory_forecast(current_soc=40.0, laps_remaining=15, policy="always_push")
    assert len(traj) == 16
    assert traj[0] == (0, 40.0)
    assert traj[10] == (10, 0.0)
    assert traj[15] == (15, 0.0)
    dry_lap = find_lap_battery_runs_dry(traj)
    assert dry_lap == 10

def test_soc_trajectory_always_balance():
    """Always balance drains 1% per lap."""
    traj = soc_trajectory_forecast(current_soc=50.0, laps_remaining=20, policy="always_balance")
    assert traj[0] == (0, 50.0)
    assert traj[20] == (20, 30.0)
    dry_lap = find_lap_battery_runs_dry(traj)
def test_confidence_threshold_fallback_to_push():
    """If hard rules pass but success_prob < 0.50, must fall back to Push."""
    state = {
        "battery_soc_pct": 65.0,
        "gap_sec": 0.95,
        "closing_speed_kph": 0.2,
        "drs_available": True,
        "laps_remaining": 15,
        "tyre_age": 4,
        "speed_kph": 210.0,
    }
    rec = recommend_energy_mode(state)
    assert rec["success_prob"] < 0.50, f"Expected success_prob < 0.50, got {rec['success_prob']}"
    assert rec["mode"] == "Push", f"Expected Push fallback but got {rec['mode']}"
    assert "opportunity available but confidence below threshold, held for Push instead" in rec["reasoning"]

def test_confidence_threshold_overtake_pass():
    """If hard rules pass AND success_prob >= 0.50, mode is Overtake."""
    state = {
        "battery_soc_pct": 65.0,
        "gap_sec": 0.45,
        "closing_speed_kph": 12.4,
        "drs_available": True,
        "laps_remaining": 15,
        "tyre_age": 4,
        "speed_kph": 235.0,
    }
    rec = recommend_energy_mode(state)
    assert rec["success_prob"] >= 0.50, f"Expected success_prob >= 0.50, got {rec['success_prob']}"
    assert rec["mode"] == "Overtake", f"Expected Overtake but got {rec['mode']}"

if __name__ == "__main__":
    test_hard_rule_soc_under_15()
    test_hard_rule_drs_false_blocks_overtake()
    test_hard_rule_gap_over_1_blocks_overtake()
    test_compliance_flags_drs_false_violation()
    test_compliance_flags_gap_violation()
    test_compliance_flags_zero_depletion_violation()
    test_compliance_valid_overtake()
    test_soc_trajectory_always_push_exhaustion()
    test_soc_trajectory_always_balance()
    test_confidence_threshold_fallback_to_push()
    test_confidence_threshold_overtake_pass()
    print("All 11 unit tests passed successfully!")
