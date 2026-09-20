"""Canonical candidate display name; never infer spelling, casing or initials."""
def candidate_name(value):
    return ' '.join(str(value or '').split()) or 'Candidate'
