"""
Reports service for predictive maintenance system.

This module generates standardized JSON reports for maintenance decision making,
including risk summaries, asset assessments, and actionable recommendations.

Engineering Logic:
- Reports formatted for plant maintenance manager consumption
- Prioritized by risk level for efficient resource allocation
- Includes actionable maintenance recommendations
- Provides operational insights for planning
"""

import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
import logging

from ..models.data_models import (
    RiskAssessment, RiskSummaryResponse, AssetType
)

logger = logging.getLogger(__name__)


@dataclass
class MaintenanceReport:
    """Standardized maintenance report for an asset."""
    asset_id: str
    risk_score: float
    failure_mode: Optional[str]
    recommended_action: str
    risk_level: str
    confidence_level: float
    next_inspection_days: Optional[int]
    assessment_timestamp: datetime


class ReportsService:
    """
    Service for generating maintenance reports and summaries.

    Produces standardized reports that maintenance managers can use to make
    informed decisions about asset maintenance and resource allocation.
    """

    def __init__(self):
        """Initialize reports service."""
        self.logger = logging.getLogger(__name__)

    def generate_risk_summary_report(self, assessments: List[RiskAssessment]) -> RiskSummaryResponse:
        """
        Generate comprehensive risk summary report for all assets.

        Args:
            assessments: List of risk assessments for all assets

        Returns:
            RiskSummaryResponse with summary statistics and prioritized assessments

        Engineering Logic:
        - Sorts assets by risk score for prioritization
        - Calculates summary statistics for operational visibility
        - Groups assessments by risk level for resource planning
        - Includes generation timestamp for report tracking
        """
        if not assessments:
            return RiskSummaryResponse(
                total_assets=0,
                high_risk_assets=0,
                critical_assets=0,
                assessments=[],
                generated_at=datetime.now()
            )

        # Sort assessments by risk score (highest first)
        sorted_assessments = sorted(assessments, key=lambda x: x.risk_score, reverse=True)

        # Calculate summary statistics
        total_assets = len(assessments)
        high_risk_assets = len([a for a in assessments if a.risk_score >= 70])
        critical_assets = len([a for a in assessments if a.risk_score >= 90])

        return RiskSummaryResponse(
            total_assets=total_assets,
            high_risk_assets=high_risk_assets,
            critical_assets=critical_assets,
            assessments=sorted_assessments,
            generated_at=datetime.now()
        )

    def generate_asset_maintenance_reports(self, assessments: List[RiskAssessment]) -> List[MaintenanceReport]:
        """
        Generate individual maintenance reports for each asset.

        Args:
            assessments: List of risk assessments

        Returns:
            List of standardized maintenance reports

        Engineering Logic:
        - Converts complex risk assessments to actionable reports
        - Includes only essential information for maintenance teams
        - Formats failure modes and recommendations clearly
        - Maintains traceability to original assessments
        """
        reports = []

        for assessment in assessments:
            report = MaintenanceReport(
                asset_id=assessment.asset_id,
                risk_score=round(assessment.risk_score, 1),
                failure_mode=assessment.failure_mode.value if assessment.failure_mode else None,
                recommended_action=assessment.recommended_action,
                risk_level=assessment.risk_level,
                confidence_level=round(assessment.confidence_level, 2),
                next_inspection_days=assessment.next_inspection_days,
                assessment_timestamp=assessment.assessment_timestamp
            )
            reports.append(report)

        return reports

    def generate_prioritized_maintenance_schedule(self,
                                                assessments: List[RiskAssessment]) -> Dict[str, Any]:
        """
        Generate prioritized maintenance schedule based on risk levels.

        Args:
            assessments: List of risk assessments

        Returns:
            Dictionary with prioritized maintenance schedule

        Engineering Logic:
        - Groups assets by risk level for scheduling
        - Considers next inspection dates for planning
        - Provides workload estimates for resource planning
        - Orders within risk levels by risk score
        """
        # Group by risk level
        schedule = {
            'critical': [],
            'high': [],
            'medium': [],
            'low': []
        }

        for assessment in assessments:
            risk_category = assessment.risk_level.lower()
            if risk_category in schedule:
                schedule[risk_category].append({
                    'asset_id': assessment.asset_id,
                    'risk_score': assessment.risk_score,
                    'recommended_action': assessment.recommended_action,
                    'next_inspection_days': assessment.next_inspection_days,
                    'failure_mode': assessment.failure_mode.value if assessment.failure_mode else None
                })

        # Sort within each category by risk score
        for category in schedule:
            schedule[category].sort(key=lambda x: x['risk_score'], reverse=True)

        # Add summary statistics
        schedule['summary'] = {
            'total_assets': len(assessments),
            'critical_count': len(schedule['critical']),
            'high_count': len(schedule['high']),
            'medium_count': len(schedule['medium']),
            'low_count': len(schedule['low']),
            'generated_at': datetime.now().isoformat()
        }

        return schedule

    def export_reports_to_json(self, reports: List[MaintenanceReport],
                              filename: Optional[str] = None) -> str:
        """
        Export maintenance reports to JSON format.

        Args:
            reports: List of maintenance reports
            filename: Optional filename for export

        Returns:
            JSON string representation of reports

        Engineering Logic:
        - Uses standardized JSON format for integration
        - Includes all required fields for maintenance systems
        - Maintains data types and precision for analysis
        - Provides timestamp for data freshness tracking
        """
        # Convert reports to dictionaries
        report_dicts = []
        for report in reports:
            report_dict = {
                'asset_id': report.asset_id,
                'risk_score': report.risk_score,
                'failure_mode': report.failure_mode,
                'recommended_action': report.recommended_action,
                'risk_level': report.risk_level,
                'confidence_level': report.confidence_level,
                'next_inspection_days': report.next_inspection_days,
                'assessment_timestamp': report.assessment_timestamp.isoformat()
            }
            report_dicts.append(report_dict)

        # Create export structure
        export_data = {
            'report_type': 'predictive_maintenance_assessment',
            'generated_at': datetime.now().isoformat(),
            'total_assets': len(reports),
            'reports': report_dicts
        }

        # Convert to JSON
        json_output = json.dumps(export_data, indent=2, default=str)

        # Optionally save to file
        if filename:
            try:
                with open(filename, 'w') as f:
                    f.write(json_output)
                self.logger.info(f"Reports exported to {filename}")
            except Exception as e:
                self.logger.error(f"Failed to export reports to file: {str(e)}")

        return json_output

    def generate_executive_summary(self, assessments: List[RiskAssessment]) -> Dict[str, Any]:
        """
        Generate executive summary for management reporting.

        Args:
            assessments: List of risk assessments

        Returns:
            Dictionary with executive summary statistics

        Engineering Logic:
        - Provides high-level overview for management decisions
        - Calculates key performance indicators
        - Shows trends and risk distribution
        - Supports resource allocation decisions
        """
        if not assessments:
            return {
                'total_assets': 0,
                'average_risk_score': 0,
                'risk_distribution': {},
                'critical_assets': [],
                'generated_at': datetime.now().isoformat()
            }

        # Calculate key metrics
        risk_scores = [a.risk_score for a in assessments]
        average_risk = round(sum(risk_scores) / len(risk_scores), 1)

        # Risk distribution
        distribution = {
            'low': len([a for a in assessments if a.risk_score < 30]),
            'medium': len([a for a in assessments if 30 <= a.risk_score < 70]),
            'high': len([a for a in assessments if 70 <= a.risk_score < 90]),
            'critical': len([a for a in assessments if a.risk_score >= 90])
        }

        # Critical assets list
        critical_assets = [
            {
                'asset_id': a.asset_id,
                'risk_score': a.risk_score,
                'failure_mode': a.failure_mode.value if a.failure_mode else None,
                'recommended_action': a.recommended_action
            }
            for a in assessments if a.risk_score >= 90
        ]

        # Asset type breakdown
        asset_types = {}
        for assessment in assessments:
            asset_type = assessment.asset_type.value
            if asset_type not in asset_types:
                asset_types[asset_type] = {'count': 0, 'avg_risk': 0, 'high_risk': 0}
            asset_types[asset_type]['count'] += 1
            asset_types[asset_type]['avg_risk'] += assessment.risk_score
            if assessment.risk_score >= 70:
                asset_types[asset_type]['high_risk'] += 1

        # Calculate averages
        for asset_type in asset_types:
            count = asset_types[asset_type]['count']
            asset_types[asset_type]['avg_risk'] = round(asset_types[asset_type]['avg_risk'] / count, 1)

        return {
            'total_assets': len(assessments),
            'average_risk_score': average_risk,
            'risk_distribution': distribution,
            'critical_assets': critical_assets,
            'asset_type_breakdown': asset_types,
            'generated_at': datetime.now().isoformat()
        }