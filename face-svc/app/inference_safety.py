"""Shared inference synchronization and explicit liveness class semantics."""
import math
from threading import Lock

INFERENCE_LOCK = Lock()


def real_probability(logits, real_class_index: int) -> float:
    values = [float(v) for v in logits]
    if len(values) < 2 or not 0 <= real_class_index < len(values):
        raise ValueError("LIVENESS_REAL_CLASS_INDEX does not match model output")
    if not all(math.isfinite(v) for v in values):
        raise ValueError("Non-finite liveness output")
    peak = max(values)
    weights = [math.exp(v - peak) for v in values]
    return weights[real_class_index] / sum(weights)
