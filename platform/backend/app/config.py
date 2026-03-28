from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://cleanrow:cleanrow_dev@localhost:5433/cleanrow"
    ollama_url: str = "http://localhost:11434"
    cors_origins: str = "*"
    secret_key: str = "dev-secret-change-in-production"

    class Config:
        env_file = ".env"


settings = Settings()
