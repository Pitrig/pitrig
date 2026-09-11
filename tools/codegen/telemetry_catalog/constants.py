from __future__ import annotations


VALID_TYPES = {"text", "uint32", "int32", "float32", "boolean"}


VALID_RATES = {"fast", "normal", "slow", "changes"}


VALID_AVAILABILITY = {
    "common",
    "optional",
    "computed",
    "game_specific",
}


VALID_SIMHUB_CONVERSIONS = {"number", "text", "boolean", "timespan_ms"}


UNAVAILABLE_OPERATORS = {
    "below": "<",
    "at_or_below": "<=",
}


UNSIGNED_UNAVAILABLE = {"op": "below", "value": 0}


WIRE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


CANONICAL_NAME_CAPACITY = 40


WHEEL_LABELS = {
    "front_left": "front-left",
    "front_right": "front-right",
    "rear_left": "rear-left",
    "rear_right": "rear-right",
}


CATEGORY_LABELS = {
    "speed_control": "Speed and controls",
    "engine": "Engine",
    "transmission": "Transmission",
    "laps_sectors": "Laps and sectors",
    "session_position": "Session and position",
    "fuel_energy": "Fuel and energy",
    "electronics_state": "Electronics and vehicle state",
    "flags_messages": "Flags and messages",
    "tyres": "Tyres",
    "brakes_suspension": "Brakes and suspension",
    "track_weather": "Track and weather",
    "motion_physics": "Motion and vehicle physics",
}
