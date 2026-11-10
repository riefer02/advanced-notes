from logging.config import fileConfig
import os
import sys
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# Add the backend directory to sys.path so we can import our app
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import our models
from app.database import Base, get_database_url

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Set the database URL from environment or default to SQLite.
# ConfigParser treats % as interpolation, so escape it (passwords may contain %).
config.set_main_option(
    "sqlalchemy.url", get_database_url().replace("%", "%%")
)

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata


def include_object(object_, name, type_, reflected, compare_to):  # noqa: ANN001
    """Keep SQLite FTS5 shadow tables out of autogenerate/check.

    They are created by the application at runtime and are not part of the
    SQLAlchemy metadata, so autogenerate would otherwise propose dropping them.
    """
    if type_ == "table" and name.startswith("notes_fts"):
        return False
    # Postgres-only generated FTS column; it is intentionally absent from the
    # ORM so SQLite's create_all cannot try to compile to_tsvector.
    if type_ == "column" and name == "search_vector":
        return False
    return True

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        transaction_per_migration=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    database_url = get_database_url()
    connect_args: dict = {}
    if database_url.startswith("postgresql"):
        # Bound the whole migration run so a lock wait cannot hang a deploy.
        connect_args = {
            "connect_timeout": 5,
            "options": (
                "-c statement_timeout=240000 "
                "-c lock_timeout=15000 "
                "-c idle_in_transaction_session_timeout=60000"
            ),
        }

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            transaction_per_migration=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
