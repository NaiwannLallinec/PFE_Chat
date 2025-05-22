import os
from typing import List
from typing import Optional
import re
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, constr
from sqlalchemy import Column, Integer, String, TIMESTAMP, text, Boolean, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import create_engine
from passlib.context import CryptContext
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables
load_dotenv()

DATABASE_URL = "postgres://user:password@localhost:5432/mydatabase"
if not DATABASE_URL:
    raise RuntimeError("DB_URL environment variable is not set")
# Fix SQLAlchemy dialect prefix if needed
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLAlchemy setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    twitch_channel = Column(String)  # ✅ ce champ doit exister ici
    youtube_live_chat_id = Column(String)
    youtube_video_id = Column(String)
    tiktok_username = Column(String)
    is_viewer = Column(Boolean)
    created_at = Column(DateTime, default=datetime.utcnow)

# Pydantic schemas
class UserCreate(BaseModel):
    username: constr(min_length=3, max_length=50)
    password: constr(min_length=6)


class UserRead(BaseModel):
    id: int
    username: str
    password_hash: str
    twitch_channel: Optional[str] = None
    youtube_live_chat_id: Optional[str] = None
    youtube_video_id: Optional[str] = None
    tiktok_username: Optional[str] = None
    is_viewer: bool
    created_at: datetime

    class Config:
        orm_mode = True  # Pydantic v1
        
        
# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# FastAPI app instance
app = FastAPI()

# Utility functions
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],  # ou ["*"] en dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# CRUD operations
@app.post("/users", response_model=UserRead, status_code=201)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user_in.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed = get_password_hash(user_in.password)
    user = User(username=user_in.username, password_hash=hashed)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@app.get("/users", response_model=List[UserRead])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    users = db.query(User).offset(skip).limit(limit).all()
    return users

@app.get("/users/streamers", response_model=List[UserRead])
def read_streamers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    streamers = db.query(User).filter(User.is_viewer == False).offset(skip).limit(limit).all()
    return streamers


@app.get("/users/{user_id}", response_model=UserRead)
def read_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.put("/users/{user_id}", response_model=UserRead)
def update_user(user_id: int, user_in: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.username = user_in.username
    user.password_hash = get_password_hash(user_in.password)
    db.commit()
    db.refresh(user)
    return user

@app.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()

# Create tables if run as script
if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
