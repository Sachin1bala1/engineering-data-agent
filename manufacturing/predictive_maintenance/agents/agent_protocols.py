"""Pydantic schemas for agent communication."""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class PlannerOutput(BaseModel):
    comparison_type: str
    signals: List[str]
    alignment_method: str
    statistics_required: List[str]
    reason: str


class ExecutionOutput(BaseModel):
    signal_results: Dict[str, Dict[str, Any]]
    execution_hash: str
    input_hash: str


class ValidationOutput(BaseModel):
    status: str
    errors: List[str] = Field(default_factory=list)
    recommend_repair: bool = False


class RepairOutput(BaseModel):
    issue: str
    suggested_fix: str
    confidence: float


class AgentLogEntry(BaseModel):
    agent: str
    timestamp: str
    input_hash: str
    output_hash: str
    payload: Dict[str, Any]
