# backend-python/app/db.py

import os
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()
raw_url = os.getenv("DB_URL", "")
DATABASE_URL = raw_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, connect_args={})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base(metadata=MetaData())
