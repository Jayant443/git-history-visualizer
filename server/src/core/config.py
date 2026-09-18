from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    DATABASE_URL: str
    REPOSITORY_ROOT: str

    model_config = SettingsConfigDict(
        env_file=str(SERVER_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def model_post_init(self, __context):
        root = Path(self.REPOSITORY_ROOT)
        if not root.is_absolute():
            self.REPOSITORY_ROOT = str(WORKSPACE_ROOT / root)

config = Settings()
