"""Fake `genlayer` module so the real contract .py can be imported and unit
tested off-chain. Injected into sys.modules BEFORE the contract is loaded."""
import importlib.util
import os
import sys
import types

import pytest

# --------------------------------------------------------------------------
# Fake genlayer runtime
# --------------------------------------------------------------------------


class u256(int):
    """u256 behaves like int (int subclass) for off-chain tests."""
    pass


class TreeMap(dict):
    """Persistent map stand-in. Supports TreeMap[str, str] annotations."""

    def __class_getitem__(cls, _item):
        return cls


def _passthrough_decorator(fn):
    return fn


class _Public:
    write = staticmethod(_passthrough_decorator)
    view = staticmethod(_passthrough_decorator)


class _Return:
    """Mirror gl.vm.Return: holds JSON-string calldata."""

    def __init__(self, calldata):
        self.calldata = calldata


class _WebResponse:
    def __init__(self, body: bytes):
        self.body = body


class _Web:
    def get(self, url, *a, **k):
        raise RuntimeError("no network in tests")

    def render(self, url, *a, **k):
        raise RuntimeError("no network in tests")


class _Nondet:
    def __init__(self):
        self.web = _Web()

    def exec_prompt(self, prompt, **kwargs):
        # Default stub; tests monkeypatch gl.nondet.exec_prompt.
        return {}


class _Vm:
    Return = _Return

    def __init__(self):
        self.last_leader = None
        self.last_validator = None
        self.last_leader_result = None

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        # Record both fns so tests can probe the validator directly.
        self.last_leader = leader_fn
        self.last_validator = validator_fn
        result = leader_fn()
        self.last_leader_result = result
        return result


class _Message:
    def __init__(self):
        self.sender_address = "0xc3880f804df13c052e6d9fba042666b396c51a44"


class _ContractMeta(type):
    pass


class Contract(metaclass=_ContractMeta):
    """Base contract: auto-initializes annotated TreeMap storage fields."""

    def __new__(cls, *args, **kwargs):
        obj = super().__new__(cls)
        anns = {}
        for klass in reversed(cls.__mro__):
            anns.update(getattr(klass, "__annotations__", {}))
        for name, ann in anns.items():
            if ann is TreeMap or (isinstance(ann, type) and issubclass(ann, TreeMap)):
                object.__setattr__(obj, name, TreeMap())
        return obj


class _GL:
    Contract = Contract
    public = _Public()

    def __init__(self):
        self.vm = _Vm()
        self.nondet = _Nondet()
        self.message = _Message()


gl = _GL()

# Build and inject the fake module
_mod = types.ModuleType("genlayer")
_mod.gl = gl
_mod.u256 = u256
_mod.TreeMap = TreeMap
_mod.Contract = Contract
_mod.__all__ = ["gl", "u256", "TreeMap", "Contract"]
sys.modules["genlayer"] = _mod


# --------------------------------------------------------------------------
# Load the real contract module by path
# --------------------------------------------------------------------------
_CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "genlayer", "compliance_gateway.py"
)


def _load_contract_module():
    spec = importlib.util.spec_from_file_location("compliance_gateway", _CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def gl_runtime():
    # Reset recorded state and default stubs between tests.
    gl.vm.last_leader = None
    gl.vm.last_validator = None
    gl.vm.last_leader_result = None
    gl.nondet.exec_prompt = lambda prompt, **kw: {}
    gl.nondet.web = _Web()
    gl.message.sender_address = "0xc3880f804df13c052e6d9fba042666b396c51a44"
    return gl


@pytest.fixture()
def contract_module():
    return _load_contract_module()
