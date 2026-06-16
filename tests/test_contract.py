"""Tests for the ComplianceGateway anchor invariant:
is_compliant == (risk_level == 'low')."""
import json

import pytest


def make_contract(contract_module, gl_runtime):
    return contract_module.ComplianceGateway()


@pytest.mark.parametrize(
    "llm_out,expected_compliant,expected_risk",
    [
        ({"risk_level": "low", "reasoning": "clean subject"}, True, "low"),
        ({"risk_level": "medium", "reasoning": "partial alias match"}, False, "medium"),
        ({"risk_level": "high", "reasoning": "exact sdn hit"}, False, "high"),
        # Leader LIES: says compliant but risk medium -> anchor forces consistency.
        ({"is_compliant": True, "risk_level": "medium", "reasoning": "x"}, False, "medium"),
        # Leader LIES the other way.
        ({"is_compliant": False, "risk_level": "low", "reasoning": "y"}, True, "low"),
        # Garbage risk_level -> fail closed to high/non-compliant.
        ({"risk_level": "banana", "reasoning": "weird"}, False, "high"),
        # Missing reasoning -> normalized to a non-empty placeholder.
        ({"risk_level": "low"}, True, "low"),
    ],
)
def test_anchor_holds(contract_module, gl_runtime, llm_out, expected_compliant, expected_risk):
    gl_runtime.nondet.exec_prompt = lambda prompt, **kw: dict(llm_out)
    c = make_contract(contract_module, gl_runtime)
    key = c.screen("Acme Corp", "wire transfer")
    rec = json.loads(c.records_json[key])
    assert rec["risk_level"] == expected_risk
    assert rec["is_compliant"] is expected_compliant
    # The anchor invariant itself:
    assert rec["is_compliant"] == (rec["risk_level"] == "low")


def test_normalized_output_always_validates(contract_module, gl_runtime):
    """Whatever the LLM emits, the leader normalization must satisfy the validator."""
    weird_outputs = [
        {"risk_level": "LOW", "reasoning": "uppercase enum"},
        {"risk_level": "high", "is_compliant": "yes", "reasoning": "string bool"},
        {"risk_level": "", "reasoning": ""},
        {"reasoning": "no risk key at all"},
        {"risk_level": "medium", "reasoning": "   "},
    ]
    for out in weird_outputs:
        gl_runtime.nondet.exec_prompt = lambda prompt, _o=out, **kw: dict(_o)
        c = make_contract(contract_module, gl_runtime)
        c.screen("Subject", "ctx")
        validator = gl_runtime.vm.last_validator
        leader_result = gl_runtime.vm.last_leader_result
        ret = gl_runtime.vm.Return(leader_result)
        assert validator(ret) is True


def test_validator_rejects_bad_inputs(contract_module, gl_runtime):
    gl_runtime.nondet.exec_prompt = lambda prompt, **kw: {"risk_level": "low", "reasoning": "ok"}
    c = make_contract(contract_module, gl_runtime)
    c.screen("Subject", "ctx")
    validator = gl_runtime.vm.last_validator
    R = gl_runtime.vm.Return

    bad = [
        # not a Return
        "not-a-return",
        # invalid JSON
        R("{not json"),
        # bad enum
        R(json.dumps({"is_compliant": False, "risk_level": "extreme", "reasoning": "x"})),
        # anchor violation: compliant but not low
        R(json.dumps({"is_compliant": True, "risk_level": "high", "reasoning": "x"})),
        # anchor violation: not compliant but low
        R(json.dumps({"is_compliant": False, "risk_level": "low", "reasoning": "x"})),
        # is_compliant not a bool (int)
        R(json.dumps({"is_compliant": 1, "risk_level": "low", "reasoning": "x"})),
        # empty reasoning
        R(json.dumps({"is_compliant": True, "risk_level": "low", "reasoning": "   "})),
    ]
    for b in bad:
        assert validator(b) is False


def test_good_input_validates(contract_module, gl_runtime):
    gl_runtime.nondet.exec_prompt = lambda prompt, **kw: {"risk_level": "low", "reasoning": "clean"}
    c = make_contract(contract_module, gl_runtime)
    c.screen("Subject", "ctx")
    validator = gl_runtime.vm.last_validator
    R = gl_runtime.vm.Return
    assert validator(R(json.dumps({"is_compliant": True, "risk_level": "low", "reasoning": "ok"}))) is True
    assert validator(R(json.dumps({"is_compliant": False, "risk_level": "medium", "reasoning": "ok"}))) is True
