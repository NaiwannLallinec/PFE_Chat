import os
from typing import List
import re
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from pydantic import BaseModel, constr
from sqlalchemy import Column, Integer, String, TIMESTAMP, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import create_engine
from passlib.context import CryptContext
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DB_URL")
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

# SQLAlchemy User model
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=text('NOW()'), nullable=False)

# Pydantic schemas
class UserCreate(BaseModel):
    username: constr(min_length=3, max_length=50)
    password: constr(min_length=6)

class UserRead(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        orm_mode = True

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
