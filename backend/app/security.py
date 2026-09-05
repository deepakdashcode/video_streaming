import hashlib
import uuid
import secrets
from typing import Optional

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with a salt."""
    salt = "lan_watch_salt_2026"
    return hashlib.sha256((password + salt).encode('utf-8')).hexdigest()

def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash

def generate_room_id() -> str:
    """Generate a clean 6-character uppercase room code excluding ambiguous chars (0, O, I, L, 1)."""
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    return ''.join(secrets.choice(alphabet) for _ in range(6))

def generate_id() -> str:
    return str(uuid.uuid4())

def generate_token(room_id: str, user_id: str, role: str) -> str:
    """Generate a lightweight room session token."""
    raw = f"{room_id}:{user_id}:{role}:secret_lan_key"
    signature = hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]
    return f"{room_id}.{user_id}.{role}.{signature}"

def verify_token(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) != 4:
            return None
        room_id, user_id, role, sig = parts
        raw = f"{room_id}:{user_id}:{role}:secret_lan_key"
        expected_sig = hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]
        if secrets.compare_digest(sig, expected_sig):
            return {"room_id": room_id, "user_id": user_id, "role": role}
        return None
    except Exception:
        return None
