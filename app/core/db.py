from sqlmodel import create_engine, Session, SQLModel
from sqlalchemy import text, inspect
import os

# For base development, we'll use SQLite.
# This can be easily switched to PostgreSQL by changing the SQLALCHEMY_DATABASE_URL.
#
# SANDVELD_DATA_DIR (set by desktop-app/index.js only for a PACKAGED/installed
# build, never in dev mode) points at a writable per-user folder
# (Electron's app.getPath('userData'), e.g. %APPDATA%\Sandveld Vee Dienste)
# instead of the app's own install folder, which can be read-only and is
# wiped/replaced on every update. Dev mode is untouched: no env var is set,
# so it keeps using ./kyron_agri.db next to the project exactly as before -
# that's where this PC's real, existing data already lives.
_data_dir = os.getenv("SANDVELD_DATA_DIR")
if _data_dir:
    os.makedirs(_data_dir, exist_ok=True)
    # SQLAlchemy sqlite URLs always use forward slashes, even for a Windows
    # path - swap backslashes so an absolute AppData path resolves correctly.
    _db_path = os.path.join(_data_dir, "kyron_agri.db").replace("\\", "/")
    _default_db_url = f"sqlite:///{_db_path}"
else:
    _default_db_url = "sqlite:///./kyron_agri.db"

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", _default_db_url)


def database_file_path() -> str:
    """Where the live sqlite file actually is right now - shown in Settings
    so a user (or whoever supports them) can find it for a backup without
    having to know about SANDVELD_DATA_DIR or dig through AppData by hand."""
    url = SQLALCHEMY_DATABASE_URL
    if url.startswith("sqlite:///"):
        return url[len("sqlite:///"):]
    return url

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    echo=True,
    connect_args={"check_same_thread": False} if "sqlite" in SQLALCHEMY_DATABASE_URL else {}
)

def _sync_missing_columns():
    """`SQLModel.metadata.create_all()` only creates tables that don't exist yet -
    it never alters an existing table when a model gains a new field. Since this
    app runs against one persistent kyron_agri.db file (never recreated), every
    model change like the product-import fields needs this to actually reach the
    live database. This only ever ADDs columns (all new fields are optional), so
    it can't drop or corrupt existing data."""
    inspector = inspect(engine)
    with engine.connect() as conn:
        for table_name, table in SQLModel.metadata.tables.items():
            if not inspector.has_table(table_name):
                continue
            existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table_name}" ADD COLUMN "{column.name}" {col_type}'))
        conn.commit()

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    _sync_missing_columns()

def get_session():
    with Session(engine) as session:
        yield session
