from predictive_maintenance.policy.execution_policy import evaluate_execution_policy


def test_execution_policy_blocks_low_confidence():
    recommendation = {
        "recommended_fix": {"type": "apply_default_date"},
        "confidence": 0.5
    }
    decision = evaluate_execution_policy(recommendation)
    assert decision.auto_apply is False


def test_execution_policy_allows_high_confidence():
    recommendation = {
        "recommended_fix": {"type": "apply_default_date"},
        "confidence": 0.98
    }
    decision = evaluate_execution_policy(recommendation)
    assert decision.auto_apply is True
