"""Shared vocabularies: authentication outcomes and per-modality enrollment status.

Authentication outcomes (the same names in the API, audit log, frontend and tests):
- ACCESS_GRANTED: every submitted modality verified.
- ACCESS_DENIED: every submitted modality was enrolled, but at least one failed verification.
- ENROLLMENT_REQUIRED: a submitted modality is not enrolled. NOT an authentication failure - nothing was verified.

Enrollment status of one modality:
- NOT_REGISTERED: nothing enrolled.
- REGISTERED: enrolled.
- UPDATED: enrolled, and re-enrolled at least once (the earlier templates were replaced).
- RETRY_REQUIRED (voice only): the last enrollment attempt failed the two-recording consistency check, nothing was stored.
"""

ACCESS_GRANTED = "ACCESS_GRANTED"
ACCESS_DENIED = "ACCESS_DENIED"
ENROLLMENT_REQUIRED = "ENROLLMENT_REQUIRED"
ENROLLMENT_INCONSISTENT = "ENROLLMENT_INCONSISTENT"
#: Voice: the recordings are usable but of lower quality - nothing is stored until the user chooses to continue.
LOW_QUALITY_WARNING = "LOW_QUALITY_WARNING"

AUTHENTICATION_STATES = (ACCESS_GRANTED, ACCESS_DENIED, ENROLLMENT_REQUIRED)

NOT_REGISTERED = "NOT_REGISTERED"
REGISTERED = "REGISTERED"
UPDATED = "UPDATED"
RETRY_REQUIRED = "RETRY_REQUIRED"
ENROLLMENT_STATUSES = (NOT_REGISTERED, REGISTERED, UPDATED, RETRY_REQUIRED)

#: The modalities a user can enroll and present.
BIOMETRIC_MODALITIES = ("face", "fingerprint", "voice")
