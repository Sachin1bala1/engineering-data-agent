from datetime import date

from predictive_maintenance.time_intelligence.time_normalizer import normalize_time


def test_time_only_with_default_date():
    record, normalized = normalize_time(
        raw_value="08:15:00",
        row_date=None,
        file_metadata=None,
        default_date=date(2024, 1, 1),
        start_date=None,
        shift_name=None
    )
    assert normalized is not None
    assert record.time_class == "TIME_ONLY"


def test_excel_serial_date():
    record, normalized = normalize_time(
        raw_value="45000",
        row_date=None,
        file_metadata=None,
        default_date=None,
        start_date=None,
        shift_name=None
    )
    assert normalized is not None
    assert record.time_class == "EXCEL_SERIAL"


def test_relative_seconds():
    record, normalized = normalize_time(
        raw_value="120",
        row_date=None,
        file_metadata=None,
        default_date=date(2024, 1, 1),
        start_date=None,
        shift_name=None
    )
    assert normalized is not None


def test_shift_based_anchor():
    record, normalized = normalize_time(
        raw_value="06:15",
        row_date=None,
        file_metadata=None,
        default_date=None,
        start_date=None,
        shift_name="day"
    )
    assert normalized is not None
    assert "anchored_to_shift_day" in record.assumptions
