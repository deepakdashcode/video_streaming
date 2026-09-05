import os

class Settings:
    PROJECT_NAME: str = "Video Sharing Platform (LAN Watch Together)"
    VERSION: str = "1.0.0"
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # Storage settings
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    MAX_UPLOAD_SIZE_MB: int = 2000 # 2 GB max video upload
    
    # Session / Room settings
    ROOM_TOKEN_SECRET: str = "lan_watch_together_secret_key_2026"
    ROOM_ID_LENGTH: int = 6

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
